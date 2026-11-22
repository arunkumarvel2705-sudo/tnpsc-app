// Mock report screen (agent: mock-report). Contract: ./contracts.ts MockReportProps.
// Shown right after a mock is submitted and from the mock history list. Marks, parts, units weakest
// first, the confidence table, and one tap into practice. Calm colour: red only for wrong-while-sure.
import { useMemo } from "react";
import { mockReport } from "../../core/mock";
import type { MockReportProps } from "./contracts";
import { confidenceLine, hmm, marksText, unattemptedUnits, unitRows, wrongIds } from "./mockreport.helpers";
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
  const skipped = useMemo(() => unattemptedUnits(r), [r]);
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

      <article className="card mrep-head">
        <p className="mrep-marks">
          <b>{marksText(r.marks)}</b> <span className="muted">/ {marksText(r.maxMarks)}</span>
        </p>
        <p className="mrep-sub">
          {r.answered} answered · {r.unanswered} unanswered
        </p>
        <p className="muted small mrep-sub">
          {r.correct} right · {r.wrong} wrong · no marks taken off for wrong answers
          {r.unscored > 0 && <> · {r.unscored} deleted by TNPSC, not counted</>}
        </p>
        {r.timeUsedMs > 0 && <p className="muted small mrep-sub">Time used {hmm(r.timeUsedMs)} of 3:00</p>}
      </article>

      {r.answered === 0 ? (
        <article className="card"><p className="muted">No answers were recorded in this mock.</p></article>
      ) : (
        <>
          <section className="card">
            <h3>By part</h3>
            <table className="mrep-parts">
              <thead>
                <tr><th scope="col">Part</th><th scope="col">Right / answered</th><th scope="col">Marks</th></tr>
              </thead>
              <tbody>
                {r.parts.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.label}</th>
                    <td>{p.correct}<span className="muted">/{p.answered}</span>{p.answered < p.total && <span className="muted small"> of {p.total}</span>}</td>
                    <td>{marksText(p.marks)}<span className="muted">/{marksText(p.maxMarks)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {units.length > 0 && (
            <section className="card">
              <div className="card-head"><h3>By unit</h3><span className="muted small">weakest first, of what you answered</span></div>
              <ul className="mrep-units">
                {units.map((u) => (
                  <li key={u.unitId}>
                    <div className="mrep-unit-line">
                      <span className="mrep-unit-name">{u.name}</span>
                      <span className="mrep-unit-count">{u.correct}/{u.answered}{u.answered < u.total && <span className="muted"> ({u.total - u.answered} not attempted)</span>}</span>
                    </div>
                    <div className="bar thin mrep-bar" role="img" aria-label={`${u.name}: ${u.correct} of ${u.answered} answered right`}>
                      <div className={u.weak ? "weak" : ""} style={{ width: `${u.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              {skipped.length > 0 && (
                <p className="muted small">Not attempted: {skipped.map((u) => `${u.name} (${u.total})`).join(" · ")}</p>
              )}
            </section>
          )}

          <section className="card">
            <h3>How sure you were</h3>
            <table className="mrep-conf">
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
            <p className="small mrep-reading">{confidenceLine(r)}</p>
          </section>
        </>
      )}

      <div className="mrep-foot">
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
