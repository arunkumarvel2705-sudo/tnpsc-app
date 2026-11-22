// Mock exam screen (agent: mock-runner). Contract: ./contracts.ts MockRunnerProps.
// The 3-hour full mock under exam conditions (AT-U6): 200 questions, a 3:00:00 countdown, one question at
// a time, options shaded like an OMR sheet, no correctness shown, auto-submit at zero.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Confidence, Option, Question } from "../../core/types";
import { remainingMs, type MockDraft } from "../mock";
import { matchTable, stemLines } from "../format";
import type { MockRunnerProps } from "./contracts";
import {
  choose, counts, formatClock, gridCells, isLowTime, move, setConfidence, spend, submitOnce, toggleFlag,
  type Carry, type GridCell,
} from "./mockrunner.helpers";
import "./mockrunner.css";

type Panel = "question" | "grid" | "confirm";

const CONFIDENCE: { id: Confidence; label: string }[] = [
  { id: "sure", label: "Sure" },
  { id: "guess", label: "Guess" },
  { id: "none", label: "No idea" },
];

export function MockRunner({ bundle, draft, nowMs, onChange, onSubmit, onPause }: MockRunnerProps) {
  // Latest props in refs: the shell passes new callbacks every render, and two taps can land before a re-render.
  const clock = useRef(nowMs);
  clock.current = nowMs;
  const submitCb = useRef(onSubmit);
  submitCb.current = onSubmit;
  const latest = useRef(draft);
  latest.current = draft;

  const [now, setNow] = useState(() => nowMs());
  const [panel, setPanel] = useState<Panel>("question");
  const entered = useRef<number | null>(now); // when the question on screen was opened; null while the app is hidden
  const carry = useRef<Carry>({}); // time on questions not answered yet
  const submit = useRef(submitOnce<"manual" | "timeout">((d, r) => submitCb.current(d, r))).current;

  const byId = useMemo(() => new Map(bundle.questions.map((q) => [q.id, q])), [bundle]);
  const sectionTitle = useMemo(() => {
    const paper = bundle.papers.find((p) => p.id === draft.paperId) ?? bundle.papers[0];
    const titles = new Map((paper?.sections ?? []).map((s) => [s.id, s.title]));
    return (s: Question["section"] | undefined) => (s ? titles.get(s) ?? (s === "tamil" ? "Part A · Tamil" : "Part B") : "");
  }, [bundle, draft.paperId]);

  const save = (d: MockDraft) => {
    if (d === latest.current) return;
    latest.current = d;
    onChange(d);
  };
  /** Book the time spent on the question on screen so far; returns the updated draft (not yet saved). */
  const settle = (): MockDraft => {
    const d = latest.current;
    const qid = d.questionIds[d.index];
    const t = clock.current();
    const elapsed = entered.current === null ? 0 : t - entered.current;
    entered.current = t;
    if (!qid) return d;
    const r = spend(d, carry.current, qid, elapsed);
    carry.current = r.carry;
    return r.draft;
  };
  const finish = (reason: "manual" | "timeout") => {
    const d = settle();
    latest.current = d;
    submit(d, reason);
  };
  const go = (to: number) => {
    const t = clock.current();
    const r = move(latest.current, carry.current, to, entered.current === null ? 0 : t - entered.current);
    carry.current = r.carry;
    entered.current = t;
    save(r.draft);
    setPanel("question");
  };

  // Tick every second.
  useEffect(() => {
    const id = window.setInterval(() => setNow(clock.current()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Phone locked or app switched: book the time so far and save; the clock keeps running regardless.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        const d = settle();
        entered.current = null;
        save(d);
      } else {
        entered.current = clock.current();
        setNow(clock.current());
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []); // settle/save read refs only

  const remaining = remainingMs(draft, now);
  // At zero, submit exactly once, even if the screen opened already at zero.
  useEffect(() => {
    if (remaining === 0) finish("timeout");
  }, [remaining]); // finish reads refs only

  // New question or confirm step: start at the top. The grid scrolls itself to the current question.
  useEffect(() => { if (panel !== "grid") window.scrollTo(0, 0); }, [draft.index, panel]);

  const total = draft.questionIds.length;
  const i = Math.min(Math.max(0, draft.index), total - 1);
  const qid = draft.questionIds[i];
  const q = qid ? byId.get(qid) : undefined;
  const c = counts(draft);
  const low = isLowTime(remaining);
  const last = i >= total - 1;

  return (
    <main className="wrap mr">
      <header className="mr-head">
        <div className="mr-head-row">
          <button className="link mr-pause" onClick={() => { save(settle()); onPause(); }}>← Pause</button>
          <span className={`mr-clock${low ? " low" : ""}`} role="timer" aria-label={`Time left ${formatClock(remaining)}`}>
            {formatClock(remaining)}
          </span>
          <span className="mr-count"><b>{c.answered}/{c.total}</b> <span className="muted">answered</span></span>
        </div>
        <p className="muted mr-note">Pausing leaves this screen; the clock keeps running.</p>
      </header>

      {panel === "grid" && (
        <Grid cells={gridCells(draft)} sectionOf={(id) => byId.get(id)?.section} sectionTitle={sectionTitle} answered={c.answered}
          unanswered={c.unanswered} flagged={c.flagged} onJump={go} />
      )}

      {panel === "confirm" && (
        <section className="card mr-confirm" aria-labelledby="mr-confirm-h">
          <h3 id="mr-confirm-h">Submit your mock?</h3>
          <dl className="mr-confirm-counts">
            <div><dt>Unanswered</dt><dd>{c.unanswered}</dd></div>
            <div><dt>Flagged</dt><dd>{c.flagged}</dd></div>
            <div><dt>Time left</dt><dd>{formatClock(remaining)}</dd></div>
          </dl>
          <p className="mr-tip">In the exam hall, shade E for questions you leave.</p>
          <p className="muted small">You cannot change answers after you submit.</p>
          <div className="row">
            <button onClick={() => setPanel("question")}>Keep going</button>
            <button className="primary" onClick={() => finish("manual")}>Submit now</button>
          </div>
        </section>
      )}

      {panel === "question" && (
        <>
          <div className="mr-qline">
            <span className="mr-qnum">
              <span><b>Question {i + 1}</b> <span className="muted">of {total}</span></span>
              {q && <span className="muted small">{sectionTitle(q.section)}</span>}
            </span>
            {qid && (
              <button className={`mr-flag${draft.marked.includes(qid) ? " on" : ""}`} aria-pressed={draft.marked.includes(qid)}
                onClick={() => save(toggleFlag(latest.current, qid))}>
                {draft.marked.includes(qid) ? "⚑ Flagged" : "⚐ Flag for review"}
              </button>
            )}
          </div>
          {q ? (
            <QuestionBody q={q} byId={byId} answer={draft.answers[q.id]}
              onPick={(o) => save(choose(latest.current, q.id, o))}
              onConfidence={(cf) => save(setConfidence(latest.current, q.id, cf))} />
          ) : (
            <p className="card">This question is no longer in your content. Move on to the next one.</p>
          )}
          {last && (
            <div className="mr-end">
              <p className="muted small">That was the last question. Check Questions for unanswered or flagged ones, then Submit.</p>
            </div>
          )}
        </>
      )}

      {panel === "question" && (
        <nav className="mr-nav" aria-label="Move between questions">
          <button onClick={() => go(i - 1)} disabled={i === 0}>← Prev</button>
          <button onClick={() => setPanel("grid")}>Questions</button>
          {last
            ? <button className="primary" onClick={() => setPanel("confirm")}>Submit</button>
            : <button onClick={() => go(i + 1)}>Next →</button>}
        </nav>
      )}
      {panel === "grid" && (
        <nav className="mr-nav" aria-label="Questions grid">
          <button onClick={() => setPanel("question")}>Back to question</button>
          <button className="primary" onClick={() => setPanel("confirm")}>Submit mock</button>
        </nav>
      )}
    </main>
  );
}

/** Question text and options, shown as the question player shows them, with no correctness. */
function QuestionBody({ q, byId, answer, onPick, onConfidence }: {
  q: Question;
  byId: Map<string, Question>;
  answer: MockDraft["answers"][string] | undefined;
  onPick: (o: Option) => void;
  onConfidence: (c: Confidence) => void;
}) {
  const lang = q.section === "tamil" ? "ta" : "en";
  const text = q[lang] ?? q.en ?? q.ta;
  const passage = q.passage?.[lang] ?? (q.passageRef ? byId.get(q.passageRef)?.passage?.[lang] : undefined);
  if (!text) return <p className="card">This question has no text yet.</p>;
  const table = q.format === "match" ? matchTable(text.stem) : null;
  return (
    <div lang={lang} className="mr-q">
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
        {q.hasFigure && <p className="muted small">This question has a figure. You can open the scan after you submit.</p>}
      </div>
      <div className={`opts ${lang}`} role="radiogroup" aria-label="Options">
        {(Object.keys(text.options) as Option[]).map((o) => (
          <button key={o} role="radio" aria-checked={answer?.chosen === o} className={`opt mr-opt${answer?.chosen === o ? " chosen" : ""}`}
            onClick={() => onPick(o)}>
            <b>({o})</b> <span>{text.options[o]}</span>
          </button>
        ))}
      </div>
      {answer && answer.chosen !== "E" && (
        <div className="mr-conf" lang="en">
          <span className="muted small">How sure?</span>
          <div className="mr-chips" role="radiogroup" aria-label="How sure are you">
            {CONFIDENCE.map((cf) => (
              <button key={cf.id} role="radio" aria-checked={answer.confidence === cf.id}
                className={`mr-chip${answer.confidence === cf.id ? " on" : ""}`} onClick={() => onConfidence(cf.id)}>
                {cf.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Grid({ cells, sectionOf, sectionTitle, answered, unanswered, flagged, onJump }: {
  cells: GridCell[];
  sectionOf: (qid: string) => Question["section"] | undefined;
  sectionTitle: (s: Question["section"] | undefined) => string;
  answered: number;
  unanswered: number;
  flagged: number;
  onJump: (index: number) => void;
}) {
  // Runs of questions from the same section, in paper order.
  const groups: { section: Question["section"] | undefined; cells: GridCell[] }[] = [];
  for (const cell of cells) {
    const s = sectionOf(cell.qid) ?? groups[groups.length - 1]?.section;
    const g = groups[groups.length - 1];
    if (g && g.section === s) g.cells.push(cell);
    else groups.push({ section: s, cells: [cell] });
  }
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => { current.current?.scrollIntoView({ block: "center" }); }, []);

  return (
    <section className="mr-grid-wrap" aria-label="All questions">
      <div className="card-head mr-grid-head">
        <h3>All questions</h3>
        <span className="muted small">Tap a number to go there</span>
      </div>
      <p className="small mr-grid-counts">
        {answered} answered · {unanswered} unanswered · {flagged} flagged
      </p>
      <p className="mr-legend small muted">
        <span><i className="mr-key answered" /> answered</span>
        <span><i className="mr-key flagged" /> flagged</span>
        <span><i className="mr-key" /> not yet</span>
      </p>
      {groups.map((g, k) => (
        <div key={k}>
          {g.section && <h2 className="paper">{sectionTitle(g.section)}</h2>}
          <div className="mr-grid">
            {g.cells.map((cell) => (
              <button key={cell.qid} ref={cell.current ? current : undefined} onClick={() => onJump(cell.index)}
                className={`mr-cell${cell.answered ? " answered" : ""}${cell.flagged ? " flagged" : ""}${cell.current ? " current" : ""}`}
                aria-current={cell.current ? "true" : undefined}
                aria-label={`Question ${cell.n}${cell.answered ? ", answered" : ", not answered"}${cell.flagged ? ", flagged" : ""}`}>
                {cell.n}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
