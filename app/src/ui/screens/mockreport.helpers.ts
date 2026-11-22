// Mock report: small pure helpers for the screen. Scoring stays in core (mock.ts, scoring.ts).
import { answersOf } from "../../core/events";
import { paperQuestionIds, type MockReport } from "../../core/mock";
import { latestAnswers, outcome } from "../../core/scoring";
import type { ContentBundle, LearningEvent } from "../../core/types";

/** Questions answered wrong in this mock (latest answer per question, current key; E counts as wrong), in paper order. */
export function wrongIds(log: LearningEvent[], bundle: ContentBundle, sessionId: string, paperId: string): string[] {
  const latest = latestAnswers(answersOf(log).filter((e) => e.mode === "mock" && e.sessionId === sessionId));
  const byId = new Map(bundle.questions.map((q) => [q.id, q]));
  return paperQuestionIds(bundle, paperId).filter((id) => {
    const a = latest.get(id);
    const q = byId.get(id);
    return !!a && !!q && outcome(q, a.chosen) === "wrong";
  });
}

/** 187.5 -> "187.5", 186 -> "186". */
export function marksText(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Milliseconds as h:mm, e.g. 2:07. */
export function hmm(ms: number): string {
  const mins = Math.floor(Math.max(0, ms) / 60000);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

export interface UnitRow {
  unitId: string;
  name: string;
  total: number;
  answered: number;
  correct: number;
  pct: number; // 0..100 of ANSWERED questions
  weak: boolean; // under half of answered right
}

/**
 * Attempted units, weakest first by share right OF ANSWERED questions (then more answered, then report
 * order). Not attempting a question is not the same as getting it wrong (review finding 3).
 */
export function unitRows(r: MockReport): UnitRow[] {
  return r.byUnit
    .map((u, i) => ({ ...u, i, pct: u.answered ? Math.round((u.correct / u.answered) * 100) : 0 }))
    .filter((u) => u.answered > 0)
    .sort((a, b) => a.correct / a.answered - b.correct / b.answered || b.answered - a.answered || a.i - b.i)
    .map(({ i: _i, ...u }) => ({ ...u, weak: u.correct * 2 < u.answered }));
}

/** Units with scorable questions that were not attempted at all, in report order. */
export function unattemptedUnits(r: MockReport): { unitId: string; name: string; total: number }[] {
  return r.byUnit.filter((u) => u.total > 0 && u.answered === 0).map(({ unitId, name, total }) => ({ unitId, name, total }));
}

/** One plain line reading the confidence table. */
export function confidenceLine(r: MockReport): string {
  const c = r.confidence;
  const sureWrong = c.sure.wrong;
  if (sureWrong > 0) {
    return sureWrong === 1
      ? "1 wrong while sure: that is a misconception, added to your mistake list when you submitted."
      : `${sureWrong} wrong while sure: these are misconceptions, added to your mistake list when you submitted.`;
  }
  const scored = c.sure.correct + c.guess.correct + c.guess.wrong + c.none.correct + c.none.wrong;
  if (scored === 0) return "No answers to read yet.";
  const lucky = c.guess.correct;
  if (lucky > 0) return `Nothing wrong while sure. ${lucky} right ${lucky === 1 ? "answer was a guess" : "answers were guesses"}: worth a second look.`;
  return "Nothing wrong while sure: when you felt sure, you were right.";
}
