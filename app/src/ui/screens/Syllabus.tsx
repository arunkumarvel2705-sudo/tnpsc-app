// Syllabus browser: the Group 4 syllabus unit by unit, each topic with how often it is asked, its past
// questions, AK's record on them, and a button to practise them now.
import { useMemo, useState } from "react";
import type { AnswerGiven, ContentBundle } from "../../core/types";
import { groupUnits, weightText } from "./progress.helpers";
import { askedText, readingText, readingsFor, syllabusRows, topicPractiseIds } from "./syllabus.helpers";
import "./progress.css";

/** Readings shown before "show all". */
const READ_SHOWN = 3;

export function Syllabus({ bundle, answers, pathExam, onPractise, onRead, onExit }: {
  bundle: ContentBundle;
  answers: AnswerGiven[];
  pathExam: string;
  onPractise: (title: string, questionIds: string[]) => void;
  onRead: (pdfRef: string, page: number) => void;
  onExit: () => void;
}) {
  const rows = useMemo(() => syllabusRows(bundle, answers, pathExam), [bundle, answers, pathExam]);
  const byUnit = useMemo(() => new Map(rows.map((r) => [r.unitId, r])), [rows]);
  const answered = useMemo(() => new Set(answers.map((a) => a.questionId)), [answers]);
  const groups = useMemo(() => groupUnits(bundle.units), [bundle.units]);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [allReads, setAllReads] = useState<Set<string>>(new Set());
  return (
    <main className="wrap">
      <header className="qhead">
        <button className="link" onClick={onExit}>← Back</button>
        <span className="muted">Syllabus</span>
      </header>
      <p className="muted small">Topics are ordered by how often recent papers asked them. Old-syllabus Tamil parts don't count towards that, but their questions are here to practise.</p>
      {groups.map((g) => (
        <article key={g.part} className="card pg-part">
          <h4>{g.part} <span className="muted small">{weightText(g.weight)}</span></h4>
          <ul className="pg-list">
            {g.units.map((u) => {
              const r = byUnit.get(u.id);
              const open = openUnit === u.id;
              return (
                <li key={u.id}>
                  <button className="pg-row" aria-expanded={open} onClick={() => setOpenUnit(open ? null : u.id)}>
                    <span className="pg-main">
                      <span className="pg-name">{u.nameEn}{u.nameTa && <span lang="ta" className="muted"> · {u.nameTa}</span>}</span>
                      <span className="pg-sub muted small">{weightText(u.questions)} · {r?.questionCount ?? 0} past questions</span>
                    </span>
                    <span className="pg-caret" aria-hidden>›</span>
                  </button>
                  {open && r && (
                    <ul className="sy-topics">
                      {r.topics.map((t) => (
                        <li key={t.topicId}>
                          <div className="sy-main">
                            <span>{t.nameEn}{t.nameTa && <span lang="ta" className="muted"> · {t.nameTa}</span>}</span>
                            <span className="muted small">
                              {askedText(t)} · {t.questionIds.length} questions
                              {t.answered > 0 && ` · you: ${t.correct}/${t.answered} right`}
                            </span>
                          </div>
                          {t.questionIds.length > 0 && (
                            <button onClick={() => onPractise(t.nameEn, topicPractiseIds(t, answered))}>Practise</button>
                          )}
                          {(() => {
                            const reads = readingsFor(bundle, t.topicId);
                            if (reads.length === 0) return null;
                            const all = allReads.has(t.topicId);
                            return (
                              <div className="sy-read">
                                <span className="muted small">Read in the textbooks</span>
                                {(all ? reads : reads.slice(0, READ_SHOWN)).map((r) => (
                                  <button key={`${r.pdfRef}#${r.pageStart}`} className="link sy-readlink" lang={r.medium === "tamil" ? "ta" : undefined}
                                    onClick={() => onRead(r.pdfRef, r.pageStart)}>
                                    {readingText(r)}{r.medium === "tamil" && " · Tamil medium"}
                                  </button>
                                ))}
                                {!all && reads.length > READ_SHOWN && (
                                  <button className="link small" onClick={() => setAllReads(new Set(allReads).add(t.topicId))}>Show all {reads.length}</button>
                                )}
                              </div>
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </main>
  );
}
