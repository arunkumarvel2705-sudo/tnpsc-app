// App shell: owns storage, sync, the engine state and navigation. Screens render; the shell records.
import { useCallback, useEffect, useMemo, useState } from "react";
import { computeState } from "../core/engine";
import { buildLog, validateEvent } from "../core/events";
import { localDay } from "../core/time";
import type { AnswerGiven, ContentBundle, ErrorReason, LearningEvent, Question } from "../core/types";
import { AuthError, fetchBundle, pdfLink, pushEvents } from "../sync/github";
import { store } from "../sync/store";
import { QuestionPlayer } from "./QuestionPlayer";
import { Papers } from "./screens/Papers";
import { Progress } from "./screens/Progress";
import { SessionClose } from "./screens/SessionClose";
import { Today } from "./screens/Today";
import { newSession, type Session, type SessionKind } from "./session";

const PATH_EXAM = "CCSE-IV"; // v1 path: Group 4
type Tab = "today" | "practice" | "progress";
type View = { name: "tabs" } | { name: "session" } | { name: "close"; session: Session };

/** Stored events, validated and ordered. Anything that fails validation is left out, never thrown. */
function readLog(): LearningEvent[] {
  return buildLog(store.events().map(validateEvent).filter((e): e is LearningEvent => typeof e !== "string"));
}

export default function App() {
  const [token, setToken] = useState(store.token());
  const [bundle, setBundle] = useState<ContentBundle | null>(store.bundle());
  const [log, setLog] = useState<LearningEvent[]>(readLog);
  const [tab, setTab] = useState<Tab>("today");
  const [view, setView] = useState<View>({ name: "tabs" });
  const [active, setActive] = useState<Session | null>(store.session());
  const [sync, setSync] = useState<{ state: "idle" | "busy" | "error"; msg?: string }>({ state: "idle" });
  const [pending, setPending] = useState(store.pending().length);
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

  const record = useCallback((e: LearningEvent) => {
    store.addEvent(e);
    setLog(readLog());
    setPending(store.pending().length);
    void syncNow();
  }, [syncNow]);

  const state = useMemo(() => (bundle ? computeState(log, bundle, today, PATH_EXAM) : null), [log, bundle, today]);
  const answers = useMemo(() => log.filter((e): e is AnswerGiven => e.type === "answer"), [log]);

  if (!token || !bundle || !state) return <Setup onReady={(t, b) => { store.setToken(t); store.setBundle(b); setToken(t); setBundle(b); }} />;

  const begin = (s: Session) => { store.setSession(s); setActive(s); setView({ name: "session" }); };
  const start = (kind: Exclude<SessionKind, "paper">, title: string, ids: string[]) => {
    if (ids.length) begin(newSession(kind, title, ids, new Date().toISOString(), crypto.randomUUID()));
  };
  const startPaper = (section: Question["section"], title: string) => {
    const ids = bundle.questions.filter((q) => q.section === section).map((q) => q.id);
    const at = store.progress()[section] ?? 0;
    const s = newSession("paper", title, ids, new Date().toISOString(), crypto.randomUUID(), section);
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
  const tag = (answerEventId: string, questionId: string, reason: ErrorReason) => record({
    type: "errorTag", eventId: crypto.randomUUID(), deviceId: store.deviceId(), at: new Date().toISOString(), schemaVersion: 1,
    sessionId: view.name === "close" ? view.session.id : "tag", answerEventId, questionId, reason,
  });

  if (view.name === "session" && active)
    return <QuestionPlayer bundle={bundle} session={active} deviceId={store.deviceId()} onAnswer={record} onAdvance={advance}
      onExit={() => setView({ name: "tabs" })} onOpenScan={openScan} />;
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
      {tab === "practice" && <Papers bundle={bundle} answers={answers} progress={store.progress()} onStart={startPaper} />}
      {tab === "progress" && (
        <>
          <Progress state={state} bundle={bundle} log={log} today={today} onPractise={(title, ids) => start("quick", title, ids)} />
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
