// Mock report screen (agent: mock-report). Contract: ./contracts.ts MockReportProps.
// Shown right after a mock is submitted and from the mock history list. Marks, parts, units weakest
// first, the confidence table, and one tap into practice. Calm colour: red only for wrong-while-sure.
import { useMemo } from "react";
import { mockReport } from "../../core/mock";
import type { MockReportProps } from "./contracts";
import { confidenceLine, hmm, marksText, unitRows, wrongIds } from "./mockreport.helpers";
import "./mockreport.css";

const CONF_COLS = [
  { key: "sure", label: "Sure" },
  { key: "guess", label: "Guess" },
  { key: "none", label: "No idea" },
] as const;

export function MockReport({ bundle, log, sessionId, paperId, timeUsedMs, onPractise, onDone }: MockReportProps) {
  const r = useMemo(() => mockReport(log, bundle, sessionId, paperId, timeUsedMs), [log, bundle, sessionId, paperId, timeUsedMs]);
  const wrong = useMemo(() => wrongIds(log, bundle, sessionId, paperId), [log, bundle, sessionId, paperId]);
  const units = useMemo(() => unitRows(r), [r]);
  const when = r.submittedAt
    ? new Date(r.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const misconceptions = r.misconceptionIds.length;

  return (
    <main className="wrap mockreport">
      <header className="top">
        <h1>Mock report</h1>
        {when && <span className="muted small">{when}</span>}
      </header>

      <article className="card mr-head">
        <p className="mr-marks">
          <b>{marksText(r.marks)}</b> <span className="muted">/ {marksText(r.maxMarks)}</span>
        </p>
        <p className="mr-sub">
          {r.answered} answered · {r.unanswered} unanswered
        </p>
        <p className="muted small mr-sub">
          {r.correct} right · {r.wrong} wrong · no marks taken off for wrong answers
          {r.unscored > 0 && <> · {r.unscored} deleted by TNPSC, not counted</>}
        </p>
        {r.timeUsedMs > 0 && <p className="muted small mr-sub">Time used {hmm(r.timeUsedMs)} of 3:00</p>}
      </article>

      {r.answered === 0 ? (
        <article className="card"><p className="muted">No answers were recorded in this mock.</p></article>
      ) : (
        <>
          <section className="card">
            <h3>By part</h3>
            <table className="mr-parts">
              <thead>
                <tr><th scope="col">Part</th><th scope="col">Right</th><th scope="col">Marks</th></tr>
              </thead>
              <tbody>
                {r.parts.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.label}</th>
                    <td>{p.correct}<span className="muted">/{p.total}</span></td>
                    <td>{marksText(p.marks)}<span className="muted">/{marksText(p.maxMarks)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {units.length > 0 && (
            <section className="card">
              <div className="card-head"><h3>By unit</h3><span className="muted small">weakest first</span></div>
              <ul className="mr-units">
                {units.map((u) => (
                  <li key={u.unitId}>
                    <div className="mr-unit-line">
                      <span className="mr-unit-name">{u.name}</span>
                      <span className="mr-unit-count">{u.correct}/{u.total}</span>
                    </div>
                    <div className="bar thin mr-bar" role="img" aria-label={`${u.name}: ${u.correct} of ${u.total} right`}>
                      <div className={u.weak ? "weak" : ""} style={{ width: `${u.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h3>How sure you were</h3>
            <table className="mr-conf">
              <thead>
                <tr><th aria-hidden="true" />{CONF_COLS.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Right</th>
                  {CONF_COLS.map((c) => <td key={c.key}>{r.confidence[c.key].correct}</td>)}
                </tr>
                <tr>
                  <th scope="row">Wrong</th>
                  {CONF_COLS.map((c) => (
                    <td key={c.key} className={c.key === "sure" && r.confidence.sure.wrong > 0 ? "bad" : ""}>{r.confidence[c.key].wrong}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="small mr-reading">{confidenceLine(r)}</p>
          </section>
        </>
      )}

      <div className="mr-foot">
        {misconceptions > 0 && (
          <button className="primary wide" onClick={() => onPractise("Mock misconceptions", r.misconceptionIds)}>
            Practise the sure-but-wrong ones ({misconceptions})
          </button>
        )}
        {wrong.length > 0 && (
          <button className={`wide ${misconceptions === 0 ? "primary" : ""}`} onClick={() => onPractise("Mock mistakes", wrong)}>
            Practise all wrong answers ({wrong.length})
          </button>
        )}
        <button className={`wide ${wrong.length === 0 ? "primary" : ""}`} onClick={onDone}>Done</button>
      </div>
    </main>
  );
}
