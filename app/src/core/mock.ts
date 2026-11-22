// core/mock — a finished full mock -> its report; the event log -> mock history. (Agent: mock-report)
// Contract is fixed; implement the bodies. Tests: AT-U6 (report side) and the rules below.
//
// A mock is one paper sat under exam conditions: every question of the paper, options A–E, a 3-hour
// timer, no answers revealed until submission. Its answers are AnswerGiven events with mode "mock" and
// the mock's id as sessionId, recorded together at submission (the shell does this).
//
// Report rules (per mock session; latest answer per question within the session):
//   marks       : TNPSC Group 4 scoring, MARKS_PER_QUESTION per correct answer, no negative marking.
//                 Correctness is scoring.outcome against the CURRENT key (an ALL key is correct for marks).
//   unscored    : questions TNPSC deleted; excluded from maxMarks (maxMarks = scorable questions * 1.5).
//   unanswered  : questions in the paper with no answer in the session (E counts as answered).
//   parts       : "tamil" section -> "Part A: Tamil"; gs_apt questions whose unitId starts "ccse4.apt"
//                 -> "Part B: Aptitude"; other gs_apt -> "Part B: General Studies". Order: A, GS, Apt.
//   byUnit      : every unitId present among the paper's questions, in bundle.units order, unknown last.
//   confidence  : counts of correct / wrong for each of sure, guess, none (effectiveConfidence; E = none).
//   misconceptionIds : wrong while sure, by question id.
//   timeUsedMs  : passed in by the caller (submission time minus start, capped at MOCK_SECONDS).
// History: one entry per mock session in the log, newest first, with marks recomputed under the
// current key (so a key revision updates old mocks too).
import type { ContentBundle, LearningEvent } from "./types";

export const MOCK_SECONDS = 3 * 60 * 60;
export const MARKS_PER_QUESTION = 1.5;

export interface PartScore {
  id: "A" | "GS" | "APT";
  label: string;
  total: number; // scorable questions in this part
  answered: number;
  correct: number;
  marks: number;
  maxMarks: number;
}

export interface MockReport {
  sessionId: string;
  paperId: string;
  submittedAt: string; // `at` of the latest answer in the session
  total: number; // questions in the paper
  answered: number;
  unanswered: number;
  correct: number;
  wrong: number;
  unscored: number;
  marks: number;
  maxMarks: number;
  parts: PartScore[];
  byUnit: { unitId: string; name: string; total: number; correct: number }[];
  confidence: Record<"sure" | "guess" | "none", { correct: number; wrong: number }>;
  misconceptionIds: string[];
  timeUsedMs: number;
}

/** Questions of a paper, in paper order. A bundle with one paper: all questions. */
export function paperQuestionIds(bundle: ContentBundle, paperId: string): string[] {
  void paperId; // v1 bundles hold one paper per file; multi-paper bundles will filter by source.paper here
  return bundle.questions.map((q) => q.id);
}

export function mockReport(
  _log: LearningEvent[],
  _bundle: ContentBundle,
  _sessionId: string,
  _paperId: string,
  _timeUsedMs: number,
): MockReport {
  throw new Error("not implemented");
}

export interface MockHistoryEntry {
  sessionId: string;
  submittedAt: string;
  answered: number;
  marks: number;
  maxMarks: number;
}

export function mockHistory(_log: LearningEvent[], _bundle: ContentBundle): MockHistoryEntry[] {
  throw new Error("not implemented");
}
