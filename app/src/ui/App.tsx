import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { effectiveConfidence, latestAnswers, outcome, summarise } from "../core/scoring";
import type { AnswerGiven, Confidence, ContentBundle, LearningEvent, Option, Question } from "../core/types";
import { AuthError, fetchBundle, pdfLink, pushEvents } from "../sync/github";
import { store } from "../sync/store";
import { matchTable, stemLines } from "./format";

type Screen = { name: "home" } | { name: "practice"; section: Question["section"] } | { name: "review"; section: Question["section"] };

const answersIn = (log: LearningEvent[]) => log.filter((e): e is AnswerGiven => e.type === "answer");

export default function App() {
  const [token, setToken] = useState(store.token());
  const [bundle, setBundle] = useState<ContentBundle | null>(store.bundle());
  const [events, setEvents] = useState<AnswerGiven[]>(answersIn(store.events()));
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [sync, setSync] = useState<{ state: "idle" | "busy" | "error"; msg?: string }>({ state: "idle" });
  const [pending, setPending] = useState(store.pending().length);

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
    return () => window.removeEventListener("online", syncNow);
  }, [syncNow]);

  const record = useCallback((e: AnswerGiven) => {
    store.addEvent(e);
    setEvents(answersIn(store.events()));
    setPending(store.pending().length);
    void syncNow();
  }, [syncNow]);

  if (!token || !bundle) return <Setup onReady={(t, b) => { store.setToken(t); store.setBundle(b); setToken(t); setBundle(b); }} />;

  const questions = new Map(bundle.questions.map((q) => [q.id, q]));
  if (screen.name === "practice")
    return <Practice bundle={bundle} section={screen.section} token={token} onAnswer={record} onExit={() => setScreen({ name: "home" })} />;
  if (screen.name === "review")
    return <Review bundle={bundle} section={screen.section} events={events} onExit={() => setScreen({ name: "home" })} />;

  return (
    <main className="wrap">
      <header className="top">
        <h1>TNPSC JARVIS</h1>
        <span className="pill">early version</span>
      </header>
      {bundle.papers.map((p) => (
        <section key={p.id}>
          <h2 className="paper">{p.title}</h2>
          {p.sections.map((s) => {
            const qs = bundle.questions.filter((q) => q.section === s.id);
            const sum = summarise(events.filter((e) => questions.get(e.questionId)?.section === s.id), questions);
            const at = store.progress()[s.id] ?? 0;
            return (
              <article className="card" key={s.id}>
                <div className="card-head">
                  <h3>{s.title}</h3>
                  <span className="muted">{sum.answered}/{qs.length}</span>
                </div>
                <div className="bar"><div style={{ width: `${(sum.answered / qs.length) * 100}%` }} /></div>
                {sum.scored > 0 && (
                  <dl className="stats">
                    <div><dt>Accuracy</dt><dd>{Math.round(sum.accuracy * 100)}%</dd></div>
                    <div><dt>Sure & right</dt><dd>{sum.sureCorrect}</dd></div>
                    <div><dt>Lucky guesses</dt><dd>{sum.luckyGuesses}</dd></div>
                    <div><dt className="warn">Misconceptions</dt><dd className="warn">{sum.misconceptions}</dd></div>
                  </dl>
                )}
                <div className="row">
                  <button className="primary" onClick={() => setScreen({ name: "practice", section: s.id })}>
                    {at === 0 ? "Start" : at >= qs.length ? "Practise again" : `Continue from Q${qs[at].n}`}
                  </button>
                  {sum.answered > 0 && <button onClick={() => setScreen({ name: "review", section: s.id })}>Review</button>}
                </div>
              </article>
            );
          })}
        </section>
      ))}
      <footer className="foot">
        <span>
          {sync.state === "busy" ? "Syncing…" : sync.state === "error" ? `Sync failed: ${sync.msg}` : pending ? `${pending} answers waiting to sync` : "All answers synced to tnpsc-data"}
        </span>
        {pending > 0 && sync.state !== "busy" && <button onClick={syncNow}>Sync now</button>}
        <span className="muted">Content {bundle.version}</span>
        <button className="link" onClick={() => { if (confirm("Remove the token from this device?")) { store.setToken(null); setToken(null); } }}>Sign out</button>
      </footer>
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
        <button className="primary" disabled={!t.trim() || busy} onClick={async () => {
          setBusy(true); setErr(null);
          try { onReady(t.trim(), await fetchBundle(t.trim())); }
          catch (e) { setErr(e instanceof AuthError ? "GitHub refused this token. Check it covers tnpsc-content and tnpsc-data." : (e as Error).message); }
          finally { setBusy(false); }
        }}>{busy ? "Loading 200 questions…" : "Connect"}</button>
        {err && <p className="error">{err}</p>}
      </article>
    </main>
  );
}

type Phase = "choose" | "confidence" | "reveal";

function Practice({ bundle, section, token, onAnswer, onExit }: {
  bundle: ContentBundle; section: Question["section"]; token: string; onAnswer: (e: AnswerGiven) => void; onExit: () => void;
}) {
  const qs = useMemo(() => bundle.questions.filter((q) => q.section === section), [bundle, section]);
  const byId = useMemo(() => new Map(bundle.questions.map((q) => [q.id, q])), [bundle]);
  const [i, setI] = useState(() => { const p = store.progress()[section] ?? 0; return p >= qs.length ? 0 : p; });
  const [phase, setPhase] = useState<Phase>("choose");
  const [chosen, setChosen] = useState<Option | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const started = useRef(Date.now());
  const sessionId = useRef(crypto.randomUUID());
  const q = qs[i];
  const lang = q.section === "tamil" ? "ta" : "en";
  const text = q[lang] ?? q.en ?? q.ta!;
  const passage = q.passage?.[lang] ?? (q.passageRef ? byId.get(q.passageRef)?.passage?.[lang] : undefined);

  useEffect(() => { started.current = Date.now(); window.scrollTo(0, 0); }, [i]);

  const submit = (opt: Option, conf: Confidence | null) => {
    const c = effectiveConfidence(opt, conf);
    setConfidence(c);
    onAnswer({
      type: "answer", eventId: crypto.randomUUID(), deviceId: store.deviceId(), at: new Date().toISOString(), schemaVersion: 1,
      sessionId: sessionId.current, questionId: q.id, chosen: opt, confidence: c, timeMs: Date.now() - started.current,
      mode: "practice", contentVersion: bundle.version,
    });
    setPhase("reveal");
  };
  const pick = (opt: Option) => {
    if (phase === "reveal") return;
    setChosen(opt);
    if (opt === "E") submit(opt, null);
    else setPhase("confidence");
  };
  const next = () => {
    const n = i + 1;
    store.setProgress(section, n);
    if (n >= qs.length) { onExit(); return; }
    setI(n); setPhase("choose"); setChosen(null); setConfidence(null);
  };

  const result = chosen ? outcome(q, chosen) : null;
  const table = q.format === "match" ? matchTable(text.stem) : null;
  const optionClass = (o: Option) => {
    if (phase !== "reveal") return o === chosen ? "opt chosen" : "opt";
    const right = q.accepted === "ALL" || (o !== "E" && q.accepted.includes(o));
    return `opt ${right ? "right" : o === chosen ? "wrongpick" : ""}`;
  };

  return (
    <main className="wrap" lang={lang}>
      <header className="qhead">
        <button className="link" onClick={() => { store.setProgress(section, i); onExit(); }}>← Home</button>
        <span className="muted">Q{q.n} · {i + 1}/{qs.length}</span>
      </header>
      <div className="bar thin"><div style={{ width: `${(i / qs.length) * 100}%` }} /></div>
      {passage && <blockquote className="passage">{passage}</blockquote>}
      <div className={`stem ${lang}`}>
        {table ? (
          <>
            <p>{table.intro}</p>
            <table className="match"><tbody>
              {table.left.map((l, k) => (<tr key={k}><td>({"abcd"[k]}) {l}</td><td>{k + 1}. {table.right[k]}</td></tr>))}
            </tbody></table>
            <p className="muted small">Options list (a) (b) (c) (d) in order.</p>
          </>
        ) : stemLines(text.stem).map((l, k) => <p key={k}>{l}</p>)}
        {q.hasFigure && <p className="muted small">This question has a figure. Open the scan to see it.</p>}
      </div>
      <div className={`opts ${lang}`}>
        {(Object.keys(text.options) as Option[]).map((o) => (
          <button key={o} className={optionClass(o)} onClick={() => pick(o)} disabled={phase === "reveal"}>
            <b>({o})</b> <span>{text.options[o]}</span>
          </button>
        ))}
      </div>
      {phase === "confidence" && chosen && (
        <div className="confidence">
          <p>How sure are you?</p>
          <div className="row three">
            <button onClick={() => submit(chosen, "sure")}>Sure</button>
            <button onClick={() => submit(chosen, "guess")}>Guess</button>
            <button onClick={() => submit(chosen, "none")}>No idea</button>
          </div>
        </div>
      )}
      {phase === "reveal" && (
        <div className={`verdict ${result}`}>
          <p className="big">
            {result === "correct" ? (q.accepted === "ALL" ? "Counted correct: TNPSC gave marks to everyone" : "Correct")
              : result === "unscored" ? "Not scored: TNPSC deleted this question"
              : confidence === "sure" ? "Wrong, and you were sure: misconception logged" : "Wrong"}
          </p>
          <p className="small">
            Final key: {q.accepted === "ALL" ? "all options accepted" : q.accepted.join(" / ")}
            {q.accepted !== "ALL" && q.accepted.length > 1 ? " (more than one accepted)" : ""}
            {" · "}{q.source.paper} page {q.source.page}
          </p>
          <div className="row">
            <button onClick={async () => { try { window.open(`${await pdfLink(token, q.source.pdfRef)}#page=${q.source.page}`, "_blank"); } catch (e) { alert((e as Error).message); } }}>Open scan</button>
            <button className="primary" onClick={next}>{i + 1 >= qs.length ? "Finish" : "Next"}</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Review({ bundle, section, events, onExit }: { bundle: ContentBundle; section: Question["section"]; events: AnswerGiven[]; onExit: () => void }) {
  const qs = bundle.questions.filter((q) => q.section === section);
  const latest = latestAnswers(events);
  const rows = qs.map((q) => ({ q, e: latest.get(q.id) })).filter((r) => r.e);
  const groups: [string, typeof rows][] = [
    ["Misconceptions (wrong but sure)", rows.filter((r) => outcome(r.q, r.e!.chosen) === "wrong" && r.e!.confidence === "sure")],
    ["Other wrong answers", rows.filter((r) => outcome(r.q, r.e!.chosen) === "wrong" && r.e!.confidence !== "sure")],
    ["Lucky guesses (right but guessed)", rows.filter((r) => outcome(r.q, r.e!.chosen) === "correct" && r.e!.confidence === "guess")],
  ];
  return (
    <main className="wrap">
      <header className="qhead"><button className="link" onClick={onExit}>← Home</button><span className="muted">Review</span></header>
      {groups.map(([title, list]) => (
        <section key={title} className="card">
          <h3>{title} <span className="muted">· {list.length}</span></h3>
          {list.length === 0 ? <p className="muted">None.</p> : list.map(({ q, e }) => {
            const t = q.ta ?? q.en!;
            return (
              <details key={q.id} className="miss">
                <summary>Q{q.n} · you chose {e!.chosen}, key {q.accepted === "ALL" ? "ALL" : q.accepted.join("/")}</summary>
                <p className={q.ta ? "ta" : ""}>{t.stem}</p>
                <ul>{(["A", "B", "C", "D"] as const).map((o) => <li key={o}><b>({o})</b> {t.options[o]}</li>)}</ul>
              </details>
            );
          })}
        </section>
      ))}
    </main>
  );
}
