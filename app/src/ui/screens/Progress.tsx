// Progress tab (agent: progress). Contract: ./contracts.ts ProgressProps.
// Where AK stands: the skill map by unit, open mistakes with their retest status, and what is already fixed.
import { useMemo, useState } from "react";
import { indexQuestions } from "../../core/content";
import { openMistakes, type MistakeState } from "../../core/mistakes";
import type { SkillState } from "../../core/skillmap";
import type { ContentBundle, Question } from "../../core/types";
import type { ProgressProps } from "./contracts";
import {
  BOX_LABEL, FIX_DAYS, FIX_STREAK, REASON_LABEL, TRANSFER_NOTE, fixedLine, groupUnits, mistakeName, mistakeStatus,
  practiseIds, shortDay, skillNumbers, snippet, weightText,
} from "./progress.helpers";
import { localDay } from "../../core/time";
import "./progress.css";

export function Progress({ state, bundle, today, onPractise }: ProgressProps) {
  const questions = useMemo(() => indexQuestions(bundle), [bundle]);
  const open = useMemo(() => openMistakes(state.mistakes), [state.mistakes]);
  const fixed = useMemo(
    () => [...state.mistakes.values()].filter((m) => m.stage === "fixed").sort((a, b) => ((a.fixedAt ?? "") < (b.fixedAt ?? "") ? 1 : -1)),
    [state.mistakes],
  );

  return (
    <section className="pg">
      <SkillMap bundle={bundle} skills={state.skills} />
      <article className="card">
        <div className="card-head">
          <h3>Mistakes to fix</h3>
          {open.length > 0 && <span className="muted small">{open.length} open</span>}
        </div>
        {open.length === 0 ? (
          <p className="muted small pg-empty">No open mistakes. Anything you miss shows up here with a day to retest it.</p>
        ) : (
          <ul className="pg-list">
            {open.map((m) => (
              <MistakeRow key={m.conceptId} m={m} bundle={bundle} questions={questions} today={today} onPractise={onPractise} />
            ))}
          </ul>
        )}
      </article>
      <FixedCard fixed={fixed} bundle={bundle} questions={questions} />
    </section>
  );
}

function SkillMap({ bundle, skills }: { bundle: ContentBundle; skills: Map<string, SkillState> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => groupUnits(bundle.units), [bundle.units]);
  return (
    <article className="card">
      <div className="card-head">
        <h3>Skill map</h3>
        <span className="muted small">Tap a unit for why</span>
      </div>
      {groups.map((g) => (
        <div key={g.part} className="pg-part">
          <h4>
            {g.part} <span className="muted small">{weightText(g.weight)}</span>
          </h4>
          <ul className="pg-list">
            {g.units.map((u) => {
              const s = skills.get(u.id);
              const box = s?.box ?? "insufficient";
              const isOpen = openId === u.id;
              return (
                <li key={u.id}>
                  <button className="pg-row" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : u.id)}>
                    <span className="pg-main">
                      <span className="pg-name">{u.nameEn}</span>
                      <span className="pg-sub muted small">{weightText(u.questions)}</span>
                    </span>
                    <span className={`pg-chip box-${box}`}>{BOX_LABEL[box]}</span>
                    <span className="pg-caret" aria-hidden>›</span>
                  </button>
                  {isOpen && (
                    <div className="pg-detail">
                      <p>{s ? s.evidence : "Not answered yet"}</p>
                      {s && s.scored > 0 && <p className="muted small">{skillNumbers(s)}</p>}
                      {box === "misconception" && <p className="muted small">The sure-but-wrong answers are listed under Mistakes to fix.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </article>
  );
}

interface RowProps {
  m: MistakeState;
  bundle: ContentBundle;
  questions: Map<string, Question>;
  today: string;
  onPractise: ProgressProps["onPractise"];
}

function MistakeRow({ m, bundle, questions, today, onPractise }: RowProps) {
  const [isOpen, setOpen] = useState(false);
  const name = mistakeName(m, bundle, questions);
  const st = mistakeStatus(m, today);
  const ids = practiseIds(m, bundle.questions);
  const extra = ids.length - m.wrongQuestionIds.length;
  return (
    <li>
      <button className="pg-row" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
        <span className="pg-main">
          <span className="pg-name">{name}</span>
          {st.parts.map((p, i) => (
            <span key={i} className="pg-sub small">
              {i === 0 && m.stage === "spaced" && <Dots n={st.streak ?? 0} />}
              {p}
            </span>
          ))}
          {st.needsTransfer && m.stage === "spaced" && <span className="pg-sub small muted">{cap(TRANSFER_NOTE)}</span>}
          {m.reason && <span className="pg-sub small muted">Tagged: {REASON_LABEL[m.reason]}</span>}
        </span>
        <span className={`pg-chip ${m.misconception ? "box-misconception" : "box-weak"}`}>{m.misconception ? "Sure but wrong" : "Missed"}</span>
        <span className="pg-caret" aria-hidden>›</span>
      </button>
      {isOpen && (
        <div className="pg-detail">
          <p className="small">
            {m.misconception
              ? `You were sure, but the answer was wrong. It is fixed after ${FIX_STREAK} sure right answers spread over ${FIX_DAYS} days, one of them on a different question.`
              : `It is fixed after ${FIX_STREAK} sure right answers spread over ${FIX_DAYS} days.`}
          </p>
          {m.stage === "spaced" && (
            <div className="pg-meters small">
              <span>Sure answers {m.streak} of {FIX_STREAK}</span>
              <div className="bar thin"><div style={{ width: `${(Math.min(m.streak, FIX_STREAK) / FIX_STREAK) * 100}%` }} /></div>
              <span>Days {st.days} of {FIX_DAYS}</span>
              <div className="bar thin"><div style={{ width: `${((st.days ?? 0) / FIX_DAYS) * 100}%` }} /></div>
            </div>
          )}
          <p className="small pg-label">{m.wrongQuestionIds.length === 1 ? "Question missed" : "Questions missed"}</p>
          <ul className="pg-qs">
            {m.wrongQuestionIds.map((id) => {
              const q = questions.get(id);
              return (
                <li key={id} lang={q?.section === "tamil" ? "ta" : undefined}>
                  <b>Q{q?.n ?? id}</b> <span className={q?.section === "tamil" ? "ta" : undefined}>{q ? snippet(q) : ""}</span>
                </li>
              );
            })}
          </ul>
          {extra > 0 && <p className="muted small">Plus {extra} other {extra === 1 ? "question" : "questions"} on the same topic.</p>}
          <button className="primary wide" onClick={() => onPractise(`Retest: ${name}`, ids)}>
            Practise now · {ids.length} {ids.length === 1 ? "question" : "questions"}
          </button>
        </div>
      )}
    </li>
  );
}

function Dots({ n }: { n: number }) {
  return (
    <span className="pg-dots" aria-hidden>
      {Array.from({ length: FIX_STREAK }, (_, i) => <i key={i} className={i < n ? "on" : ""} />)}
    </span>
  );
}

function FixedCard({ fixed, bundle, questions }: { fixed: MistakeState[]; bundle: ContentBundle; questions: Map<string, Question> }) {
  const [isOpen, setOpen] = useState(false);
  if (fixed.length === 0) return <p className="muted small pg-fixed-none">{fixedLine(0)}</p>;
  return (
    <article className="card">
      <button className="pg-row" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
        <span className="pg-main">
          <span className="pg-name pg-good">{fixedLine(fixed.length)}</span>
          <span className="pg-sub muted small">Each one held up for {FIX_DAYS} days</span>
        </span>
        <span className="pg-caret" aria-hidden>›</span>
      </button>
      {isOpen && (
        <ul className="pg-list pg-fixed">
          {fixed.map((m) => (
            <li key={m.conceptId} className="pg-fixed-item">
              <span>{mistakeName(m, bundle, questions)}</span>
              <span className="muted small">{m.fixedAt ? shortDay(localDay(m.fixedAt)) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}
