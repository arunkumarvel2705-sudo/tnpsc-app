// App shell: owns storage, sync, the engine state and navigation. Screens render; the shell records.
import { useCallback, useEffect, useMemo, useState } from "react";
import { applyTagReviews, sectionQuestionIds, tagReviewQueue } from "../core/content";
import { computeState } from "../core/engine";
import { MOCK_SECONDS, mockHistory, mockPaperChoices, paperQuestionIds } from "../core/mock";
import { buildLog, validateEvent } from "../core/events";
import { localDay } from "../core/time";
import type { AnswerGiven, ContentBundle, ErrorReason, LearningEvent, Question, TagReviewed } from "../core/types";
import { AuthError, fetchBundle, pdfLink, pushEvents } from "../sync/github";
import { store } from "../sync/store";
import type { GsLang } from "./format";
import { newDraft, remainingMs, type MockDraft } from "./mock";
import { QuestionPlayer } from "./QuestionPlayer";
import { MockReport } from "./screens/MockReport";
import { MockRunner } from "./screens/MockRunner";
import { Papers } from "./screens/Papers";
import { Progress } from "./screens/Progress";
import { SessionClose } from "./screens/SessionClose";
import { Syllabus } from "./screens/Syllabus";
import { TermBridge } from "./screens/TermBridge";
import { TagReview } from "./screens/TagReview";
import { Today } from "./screens/Today";
import { newSession, progressKey, type Session, type SessionKind } from "./session";

const PATH_EXAM = "CCSE-IV"; // v1 path: Group 4
type Tab = "today" | "practice" | "progress";
type View =
  | { name: "tabs" }
  | { name: "session" }
  | { name: "close"; session: Session }
  | { name: "mock" }
  | { name: "mockReport"; sessionId: string; paperId: string; timeUsedMs: number }
  | { name: "tags" }
  | { name: "syllabus" }
  | { name: "terms" };

/** Stored events, validated and ordered. Anything that fails validation is left out, never thrown. */
function readLog(): LearningEvent[] {
  return buildLog(store.events().map(validateEvent).filter((e): e is LearningEvent => typeof e !== "string"));
}

export default function App() {
  const [token, setToken] = useState(store.token());
  const [rawBundle, setBundle] = useState<ContentBundle | null>(store.bundle());
  const [log, setLog] = useState<LearningEvent[]>(readLog);
  // AK's tag reviews count at once: every screen sees the bundle with them applied.
  const bundle = useMemo(() => (rawBundle ? applyTagReviews(rawBundle, log) : null), [rawBundle, log]);
  const [tab, setTab] = useState<Tab>("today");
  // A mock still running when the app opens (killed by the phone, Back pressed) goes straight back to it.
  const [view, setView] = useState<View>(() => {
    const d = store.mock();
    return d && remainingMs(d, Date.now()) > 0 ? { name: "mock" } : { name: "tabs" };
  });
  const [active, setActive] = useState<Session | null>(store.session());
  const [mock, setMock] = useState<MockDraft | null>(store.mock());
  const [sync, setSync] = useState<{ state: "idle" | "busy" | "error"; msg?: string }>({ state: "idle" });
  const [pending, setPending] = useState(store.pending().length);
  const [gsLang, setGsLangState] = useState<GsLang>(store.gsLang());
  const setGsLang = (l: GsLang) => { store.setGsLang(l); setGsLangState(l); };
  const today = localDay(new Date().toISOString());

  const syncNow = useCallback(async () => {
    const t = store.token();
    const ids = new Set(store.pending());
    if (!t || !ids.size || !navigator.onLine) return;
    setSync({ state: "busy" });
    try {
      const done = await pushEvents(t, store.events().filter((e) => ids.has(e.eventId)));
      store.markSynced(done);
      setPending(store.pending().length);
      setSync({ state: "idle" });
    } catch (e) {
      setSync({ state: "error", msg: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("online", syncNow);
    void syncNow();
    return () => window.removeEventListener("online", syncNow);
  }, [syncNow]);

  // New content (a new paper, fixed keys, topic names) arrives on the next online launch.
  useEffect(() => {
    const t = store.token();
    if (!t || !navigator.onLine) return;
    fetchBundle(t)
      .then((b) => {
        if (b.version !== store.bundle()?.version) { store.setBundle(b); setBundle(b); }
      })
      .catch(() => { /* offline or GitHub unreachable: keep the cached bundle */ });
  }, [token]);

  const record = useCallback((e: LearningEvent) => {
    store.addEvent(e);
    setLog(readLog());
    setPending(store.pending().length);
    void syncNow();
  }, [syncNow]);

  /**
   * Turn a finished mock into answer events (mode "mock"), all stamped at submission time, in ONE write.
   * Event ids are "<mock id>:<question id>", so submitting the same draft again (after a crash mid-write,
   * or the shell and the runner both noticing time is up) never records anything twice. The draft is only
   * cleared once the answers are safely stored.
   */
  const submitMock = useCallback((d: MockDraft) => {
    if (store.mock()?.id !== d.id) return; // already submitted (the draft is cleared only after a safe write)
    const end = Math.min(Date.now(), Date.parse(d.startedAt) + MOCK_SECONDS * 1000);
    const at = new Date(end).toISOString();
    const version = store.bundle()?.version ?? "unknown";
    const events: LearningEvent[] = [];
    for (const qid of d.questionIds) {
      const a = d.answers[qid];
      if (!a) continue;
      events.push({
        type: "answer", eventId: `${d.id}:${qid}`, deviceId: store.deviceId(), at, schemaVersion: 1,
        sessionId: d.id, questionId: qid, chosen: a.chosen, confidence: a.chosen === "E" ? "none" : a.confidence,
        timeMs: a.timeMs, mode: "mock", contentVersion: version,
      });
    }
    if (!store.addEvents(events)) {
      alert("Your phone's storage for this app is full, so the mock could not be saved yet. Your answers are kept; free some space and open the app again.");
      return;
    }
    store.setMock(null);
    setMock(null);
    setLog(readLog());
    setPending(store.pending().length);
    setView({ name: "mockReport", sessionId: d.id, paperId: d.paperId, timeUsedMs: end - Date.parse(d.startedAt) });
    void syncNow();
  }, [syncNow]);

  // Auto-submit at zero when the mock screen is not open (AT-U6): on app open, every 15 s while the app
  // is open, and whenever it comes back to the foreground. On the mock screen the runner does it.
  useEffect(() => {
    const check = () => {
      const d = store.mock();
      if (d && view.name !== "mock" && remainingMs(d, Date.now()) === 0) submitMock(d);
    };
    check();
    const timer = window.setInterval(check, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [submitMock, view.name]);

  const state = useMemo(() => (bundle ? computeState(log, bundle, today, PATH_EXAM) : null), [log, bundle, today]);
  const answers = useMemo(() => log.filter((e): e is AnswerGiven => e.type === "answer"), [log]);

  if (!token || !bundle || !state) return <Setup onReady={(t, b) => { store.setToken(t); store.setBundle(b); setToken(t); setBundle(b); }} />;

  const begin = (s: Session) => { store.setSession(s); setActive(s); setView({ name: "session" }); };
  const start = (kind: Exclude<SessionKind, "paper">, title: string, ids: string[]) => {
    if (ids.length) begin(newSession(kind, title, ids, new Date().toISOString(), crypto.randomUUID()));
  };
  const startPaper = (paperId: string, section: Question["section"], title: string) => {
    const ids = sectionQuestionIds(bundle, paperId, section);
    if (!ids.length) return;
    const key = progressKey(paperId, section);
    const at = store.progress()[key] ?? 0;
    const s = newSession("paper", title, ids, new Date().toISOString(), crypto.randomUUID(), key);
    begin({ ...s, index: at >= ids.length ? 0 : at });
  };
  const advance = (n: number) => {
    if (!active) return;
    const s = { ...active, index: n };
    if (s.paperSection) store.setProgress(s.paperSection, n);
    if (n >= s.questionIds.length) { store.setSession(null); setActive(null); setView({ name: "close", session: s }); }
    else { store.setSession(s); setActive(s); }
  };
  const openScan = async (pdfRef: string, page: number) => {
    try { window.open(`${await pdfLink(token, pdfRef)}#page=${page}`, "_blank"); } catch (e) { alert((e as Error).message); }
  };
  const reviewTag = (questionId: string, verdict: TagReviewed["verdict"], topicId: string) => record({
    type: "tagReview", eventId: crypto.randomUUID(), deviceId: store.deviceId(), at: new Date().toISOString(), schemaVersion: 1,
    sessionId: "tags", questionId, verdict, topicId,
  });
  const tag = (answerEventId: string, questionId: string, reason: ErrorReason) => record({
    type: "errorTag", eventId: crypto.randomUUID(), deviceId: store.deviceId(), at: new Date().toISOString(), schemaVersion: 1,
    sessionId: view.name === "close" ? view.session.id : "tag", answerEventId, questionId, reason,
  });

  if (view.name === "session" && active)
    return <QuestionPlayer bundle={bundle} session={active} deviceId={store.deviceId()} gsLang={gsLang} onGsLang={setGsLang} onAnswer={record} onAdvance={advance}
      onExit={() => setView({ name: "tabs" })} onOpenScan={openScan} />;
  if (view.name === "mock" && mock)
    return <MockRunner bundle={bundle} draft={mock} nowMs={() => Date.now()} gsLang={gsLang} onGsLang={setGsLang}
      onChange={(d) => { store.setMock(d); setMock(d); }}
      onSubmit={(d) => submitMock(d)} onPause={() => setView({ name: "tabs" })} />;
  if (view.name === "mockReport")
    return <MockReport bundle={bundle} log={log} sessionId={view.sessionId} paperId={view.paperId} timeUsedMs={view.timeUsedMs}
      onPractise={(title, ids) => start("quick", title, ids)} onDone={() => setView({ name: "tabs" })} />;
  if (view.name === "terms") return <TermBridge bundle={bundle} onExit={() => setView({ name: "tabs" })} />;
  if (view.name === "syllabus")
    return <Syllabus bundle={bundle} answers={answers} pathExam={PATH_EXAM} onPractise={(title, ids) => start("quick", title, ids)}
      onExit={() => setView({ name: "tabs" })} />;
  if (view.name === "tags")
    return <TagReview bundle={bundle} queue={tagReviewQueue(bundle)} gsLang={gsLang} onGsLang={setGsLang} onReview={reviewTag}
      onExit={() => setView({ name: "tabs" })} />;
  if (view.name === "close")
    return <SessionClose session={view.session} bundle={bundle} log={log} onTag={tag} onDone={() => { setView({ name: "tabs" }); setTab("today"); }} />;

  return (
    <main className="wrap tabs-pad">
      <header className="top">
        <h1>TNPSC JARVIS</h1>
        <span className={`pill ${sync.state === "error" ? "bad" : ""}`} title={sync.msg}>
          {sync.state === "busy" ? "Syncing…" : sync.state === "error" ? "Sync failed" : pending ? `${pending} to sync` : "Synced"}
        </span>
      </header>
      {tab === "today" && <Today state={state} bundle={bundle} log={log} today={today} resumable={active}
        onStart={start} onResume={() => setView({ name: "session" })} />}
      {tab === "practice" && (
        <>
          <MockCard bundle={bundle} log={log} draft={mock}
            onStart={(paperId) => {
              const ids = paperQuestionIds(bundle, paperId);
              if (!ids.length) return;
              const d = newDraft(crypto.randomUUID(), paperId, ids, new Date().toISOString());
              store.setMock(d); setMock(d); setView({ name: "mock" });
            }}
            onContinue={() => setView({ name: "mock" })}
            onOpen={(sessionId, paperId) => setView({ name: "mockReport", sessionId, paperId, timeUsedMs: 0 })} />
          {mock ? (
            <p className="muted small">Paper practice is hidden while a mock is running, so the mock stays under exam conditions.</p>
          ) : (
            <>
              <section className="card">
                <p><b>Syllabus</b></p>
                <p className="muted small">Every unit and topic, how often it is asked, and its past questions to practise.</p>
                <button onClick={() => setView({ name: "syllabus" })}>Browse the syllabus</button>
              </section>
              {(bundle.terms?.length ?? 0) > 0 && (
                <section className="card">
                  <p><b>Term Bridge</b></p>
                  <p className="muted small">{bundle.terms!.length} English-Tamil technical terms from the bilingual papers.</p>
                  <button onClick={() => setView({ name: "terms" })}>Open Term Bridge</button>
                </section>
              )}
              <Papers bundle={bundle} answers={answers} progress={store.progress()} onStart={startPaper} />
            </>
          )}
        </>
      )}
      {tab === "progress" && (
        <>
          <Progress state={state} bundle={bundle} log={log} today={today} onPractise={(title, ids) => start("quick", title, ids)} />
          <TagReviewCard left={tagReviewQueue(bundle).length} onOpen={() => setView({ name: "tags" })} />
          <footer className="settings muted small">
            <span>Content {bundle.version}</span>
            {sync.state === "error" && <span className="error">Sync failed: {sync.msg}</span>}
            {pending > 0 && sync.state !== "busy" && <button onClick={syncNow}>Sync now</button>}
            <button className="link" onClick={() => { if (confirm("Remove the token from this device?")) { store.setToken(null); setToken(null); } }}>Sign out</button>
          </footer>
        </>
      )}
      <nav className="tabbar">
        {(["today", "practice", "progress"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </nav>
    </main>
  );
}

/**
 * The full-mock card. A bundle can hold several papers (newest first): each is its own 3-hour mock, so
 * with more than one the learner picks which to sit, seeing each paper's size and last score. With one
 * paper the card looks as it always has. A draft in progress always continues its own paper.
 */
function MockCard({ bundle, log, draft, onStart, onContinue, onOpen }: {
  bundle: ContentBundle; log: LearningEvent[]; draft: MockDraft | null;
  onStart: (paperId: string) => void; onContinue: () => void; onOpen: (sessionId: string, paperId: string) => void;
}) {
  const history = useMemo(() => mockHistory(log, bundle), [log, bundle]);
  const choices = useMemo(() => mockPaperChoices(bundle, history), [bundle, history]);
  const many = choices.length > 1;
  const titleOf = (paperId: string) => choices.find((c) => c.paperId === paperId)?.title ?? paperId;
  const left = draft ? remainingMs(draft, Date.now()) : 0;
  const hhmm = (ms: number) => `${Math.floor(ms / 3600000)}h ${String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0")}m`;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const confirmStart = (paperId: string) => {
    const ask = many
      ? `Start the ${titleOf(paperId)} mock now? The 3-hour timer runs even if you close the app.`
      : "Start a 3-hour mock now? The timer runs even if you close the app.";
    if (confirm(ask)) onStart(paperId);
  };
  return (
    <article className="card">
      <div className="card-head">
        <h3>Full mock</h3>
        <span className="muted">{many ? `${choices.length} papers · 3 hours each` : `${choices[0]?.questions ?? 0} questions · 3 hours`}</span>
      </div>
      {draft ? (
        <>
          <p className="muted small">
            In progress{many ? `: ${titleOf(draft.paperId)},` : ":"} {Object.keys(draft.answers).length} answered, {hhmm(left)} left. The clock keeps running.
          </p>
          <button className="primary wide" onClick={onContinue}>Continue mock</button>
        </>
      ) : many ? (
        <>
          <p className="muted small">Pick a paper. Exam conditions: no answers shown until you submit. Best on a weekend with 3 free hours.</p>
          <ul className="mock-papers">
            {choices.map((c) => (
              <li key={c.paperId}>
                <div>
                  <b>{c.title}</b>
                  <span className="muted small">
                    {c.questions} questions · {c.last ? `last ${c.last.marks} / ${c.last.maxMarks} on ${day(c.last.submittedAt)}` : "not taken yet"}
                  </span>
                </div>
                <button className={c.last ? "" : "primary"} disabled={!c.questions} onClick={() => confirmStart(c.paperId)}>Start</button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="muted small">Exam conditions: no answers shown until you submit. Best on a weekend with 3 free hours.</p>
          <button className="primary wide" disabled={!choices[0]?.questions} onClick={() => confirmStart(choices[0].paperId)}>Start mock</button>
        </>
      )}
      {history.length > 0 && (
        <ul className="mock-history">
          {history.map((h) => (
            <li key={h.sessionId}>
              <button className="link" onClick={() => onOpen(h.sessionId, h.paperId)}>
                {day(h.submittedAt)}{many ? ` · ${titleOf(h.paperId)}` : ""}: {h.marks} / {h.maxMarks}
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Setup({ onReady }: { onReady: (token: string, bundle: ContentBundle) => void }) {
  const [t, setT] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="wrap">
      <header className="top"><h1>TNPSC JARVIS</h1></header>
      <article className="card">
        <h3>Connect your content</h3>
        <p className="muted">Paste your fine-grained GitHub token once. It stays on this device and is sent only to api.github.com.</p>
        <input type="password" autoComplete="off" placeholder="github_pat_…" value={t} onChange={(e) => setT(e.target.value)} />
        <button className="primary wide" disabled={!t.trim() || busy} onClick={async () => {
          setBusy(true); setErr(null);
          try { onReady(t.trim(), await fetchBundle(t.trim())); }
          catch (e) { setErr(e instanceof AuthError ? "GitHub refused this token. Check it covers tnpsc-content and tnpsc-data." : (e as Error).message); }
          finally { setBusy(false); }
        }}>{busy ? "Loading questions…" : "Connect"}</button>
        {err && <p className="error">{err}</p>}
      </article>
    </main>
  );
}

/** Entry to the tag review: how many topic tags still wait for AK's check. */
function TagReviewCard({ left, onOpen }: { left: number; onOpen: () => void }) {
  if (!left) return null;
  return (
    <section className="card">
      <p><b>Topic tags to check: {left}</b></p>
      <p className="muted small">The tagger was unsure of these. Each one you confirm or fix improves what the planner picks.</p>
      <button onClick={onOpen}>Review tags</button>
    </section>
  );
}
