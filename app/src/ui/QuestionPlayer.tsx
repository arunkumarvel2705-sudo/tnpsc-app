// The question screen (spec: gets the most design care). Works through one Session.
// Flow: choose option -> confidence (skipped for E, AT-U1) -> reveal -> next.
import { useEffect, useMemo, useRef, useState } from "react";
import { isServable } from "../core/content";
import { effectiveConfidence, outcome } from "../core/scoring";
import type { AnswerGiven, Confidence, ContentBundle, Option } from "../core/types";
import { matchTable, stemLines } from "./format";
import type { Session } from "./session";

export function QuestionPlayer({ bundle, session, deviceId, onAnswer, onAdvance, onExit, onOpenScan }: {
  bundle: ContentBundle;
  session: Session;
  deviceId: string;
  onAnswer: (e: AnswerGiven) => void;
  onAdvance: (nextIndex: number) => void; // shell stores it; finishing = nextIndex >= questionIds.length
  onExit: () => void; // leave mid-session; it stays resumable
  onOpenScan: (pdfRef: string, page: number) => void;
}) {
  const byId = useMemo(() => new Map(bundle.questions.map((q) => [q.id, q])), [bundle]);
  const i = Math.min(session.index, session.questionIds.length - 1);
  const found = byId.get(session.questionIds[i]);
  // A session saved before the content marked a question as needing a figure can still hold it: skip it.
  const hidden = found !== undefined && !isServable(found);
  const q = hidden ? undefined : found;
  const [phase, setPhase] = useState<"choose" | "confidence" | "reveal">("choose");
  const [chosen, setChosen] = useState<Option | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const started = useRef(Date.now());

  useEffect(() => { started.current = Date.now(); setPhase("choose"); setChosen(null); setConfidence(null); window.scrollTo(0, 0); }, [i, session.id]);

  if (!q) {
    return (
      <main className="wrap">
        <p>{hidden ? "This question needs a diagram the app can't show yet, so it is skipped." : "This question is no longer in your content."}</p>
        <button className="primary" onClick={() => onAdvance(i + 1)}>Skip</button>
      </main>
    );
  }

  const lang = q.section === "tamil" ? "ta" : "en";
  const text = q[lang] ?? q.en ?? q.ta!;
  const passage = q.passage?.[lang] ?? (q.passageRef ? byId.get(q.passageRef)?.passage?.[lang] : undefined);
  const total = session.questionIds.length;

  const submit = (opt: Option, conf: Confidence | null) => {
    const c = effectiveConfidence(opt, conf);
    setConfidence(c);
    onAnswer({
      type: "answer", eventId: crypto.randomUUID(), deviceId, at: new Date().toISOString(), schemaVersion: 1,
      sessionId: session.id, questionId: q.id, chosen: opt, confidence: c, timeMs: Date.now() - started.current,
      mode: session.mode, contentVersion: bundle.version,
    });
    setPhase("reveal");
  };
  const pick = (opt: Option) => {
    if (phase === "reveal") return;
    setChosen(opt);
    if (opt === "E") submit(opt, null);
    else setPhase("confidence");
  };

  const result = chosen && phase === "reveal" ? outcome(q, chosen) : null;
  const misconception = result === "wrong" && confidence === "sure";
  const table = q.format === "match" ? matchTable(text.stem) : null;
  const optionClass = (o: Option) => {
    if (phase !== "reveal") return o === chosen ? "opt chosen" : "opt";
    const right = q.accepted === "ALL" || (o !== "E" && q.accepted.includes(o));
    return `opt ${right ? "right" : o === chosen ? (misconception ? "wrongpick" : "missed") : ""}`;
  };

  return (
    <main className="wrap" lang={lang}>
      <header className="qhead">
        <button className="link" onClick={onExit}>← Pause</button>
        <span className="muted">{session.title} · {i + 1}/{total}</span>
      </header>
      <div className="bar thin"><div style={{ width: `${(i / total) * 100}%` }} /></div>
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
        <div className={`verdict ${result === "wrong" ? (misconception ? "wrong" : "missed") : result}`}>
          <p className="big">
            {result === "correct" ? (q.accepted === "ALL" ? "Counted correct: TNPSC gave marks to everyone" : "Correct")
              : result === "unscored" ? "Not scored: TNPSC deleted this question"
              : misconception ? "Wrong, and you were sure: misconception logged" : "Not this time: logged for a retest tomorrow"}
          </p>
          <p className="small">
            Final key: {q.accepted === "ALL" ? "all options accepted" : q.accepted.join(" / ")}
            {q.accepted !== "ALL" && q.accepted.length > 1 ? " (more than one accepted)" : ""}
            {" · "}{q.source.paper} page {q.source.page}
          </p>
          <div className="row">
            <button onClick={() => onOpenScan(q.source.pdfRef, q.source.page)}>Open scan</button>
            <button className="primary" onClick={() => onAdvance(i + 1)}>{i + 1 >= total ? "Finish" : "Next"}</button>
          </div>
        </div>
      )}
    </main>
  );
}
