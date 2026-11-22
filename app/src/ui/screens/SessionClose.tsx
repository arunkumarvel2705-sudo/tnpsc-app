// Session close (agent: session-close). Contract: ./contracts.ts SessionCloseProps.
// A calm summary, an optional "why did it slip?" tag per miss, and Done. Tagging never blocks Done.
import { useMemo } from "react";
import type { SessionCloseProps } from "./contracts";
import { closeView, nextLine, REASONS, type SlipRow } from "./close.helpers";
import "./close.css";

export function SessionClose({ session, bundle, log, onTag, onDone }: SessionCloseProps) {
  const view = useMemo(() => closeView(session.id, session.questionIds, bundle, log), [session, bundle, log]);
  const { summary: s, slips } = view;
  const unscored = s.answered - s.scored;

  return (
    <main className="wrap close">
      <header className="top"><h1>Session done</h1></header>

      <article className="card">
        <h3>{session.title}</h3>
        {s.answered === 0 ? (
          <p className="muted">No answers were recorded in this session.</p>
        ) : (
          <>
            <p className="close-lead">
              {s.answered} {s.answered === 1 ? "question" : "questions"} answered · {s.correct} right
              {unscored > 0 && <span className="muted small"> ({unscored} not scored: TNPSC deleted {unscored === 1 ? "it" : "them"})</span>}
            </p>
            <dl className="close-counts">
              <div><dt>Sure and right</dt><dd>{s.sureCorrect}</dd></div>
              <div><dt>Right but guessed</dt><dd>{s.luckyGuesses}</dd></div>
              {s.misconceptions > 0 && <div className="bad"><dt>Wrong while sure</dt><dd>{s.misconceptions}</dd></div>}
            </dl>
          </>
        )}
      </article>

      {slips.length > 0 && (
        <section className="card">
          <h3>Why did these slip?</h3>
          <p className="muted small close-hint">Optional. Tap a reason if you know it; you can change it.</p>
          {slips.map((r) => <Slip key={r.answerEventId} row={r} onTag={onTag} />)}
        </section>
      )}

      <div className="close-foot">
        <p className="muted small">{nextLine(view)}</p>
        <button className="primary wide" onClick={onDone}>Done</button>
      </div>
    </main>
  );
}

function Slip({ row: r, onTag }: { row: SlipRow; onTag: SessionCloseProps["onTag"] }) {
  return (
    <div className={`slip ${r.sure ? "sure" : ""}`}>
      <div className="slip-head">
        <b>Q{r.n}</b>
        {r.sure && <span className="slip-sure">Wrong while sure</span>}
      </div>
      {r.snippet && <p className={`slip-stem ${r.lang}`} lang={r.lang} title={r.snippet}>{r.snippet}</p>}
      <p className="small slip-answer">
        You chose <b>{r.chosen === "E" ? "Not known" : r.chosen}</b> · Key <b>{r.key}</b>
      </p>
      <div className="chips" role="group" aria-label={`Why Q${r.n} slipped`}>
        {REASONS.map(({ reason, label }) => (
          <button key={reason} className={`chip ${r.tag === reason ? "on" : ""}`} aria-pressed={r.tag === reason}
            onClick={() => { if (r.tag !== reason) onTag(r.answerEventId, r.questionId, reason); }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
