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
//   confidence  : counts of correct / wrong for each of sure, guess, none (effectiveConfidence; E = none),
//                 using scoring.learningOutcome: an ALL-keyed question earns marks but is no evidence of
//                 knowing, so it is left out of this table and of misconceptionIds (matches the engine).
//   misconceptionIds : wrong while sure, by question id.
//   timeUsedMs  : passed in by the caller (submission time minus start, capped at MOCK_SECONDS).
// History: one entry per mock session in the log, newest first, with marks recomputed under the
// current key (so a key revision updates old mocks too).
// Papers: a bundle holds every paper of one exam path (newest first). A mock is always one paper, and
// every count above is against that paper's questions only (paperQuestionIds). Answer events carry no
// paper id (the event format is fixed), so history derives each session's paper from the paperId of
// the questions it answered (mockPaperId).
import { answersOf } from "./events";
import { effectiveConfidence, latestAnswers, learningOutcome, outcome } from "./scoring";
import type { AnswerGiven, ContentBundle, LearningEvent, Question } from "./types";

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
  byUnit: { unitId: string; name: string; total: number; answered: number; correct: number }[];
  confidence: Record<"sure" | "guess" | "none", { correct: number; wrong: number }>;
  misconceptionIds: string[];
  timeUsedMs: number;
}

/** Questions of one paper, in bundle (paper) order. */
export function paperQuestionIds(bundle: ContentBundle, paperId: string): string[] {
  return bundle.questions.filter((q) => q.paperId === paperId).map((q) => q.id);
}

/**
 * The paper a mock session sat, from the questions it answered. A mock serves one paper, so they all
 * agree; if they ever disagree (a hand-edited log, a question moved between papers by a content fix) the
 * paper with the most answered questions wins, ties going to the paper listed first in the bundle (the
 * newer one). Answers to questions no longer in the bundle are ignored; with none left, papers[0].
 */
export function mockPaperId(answers: AnswerGiven[], bundle: ContentBundle): string {
  const byId = new Map(bundle.questions.map((q) => [q.id, q]));
  const counts = new Map<string, number>();
  for (const qid of new Set(answers.map((a) => a.questionId))) {
    const q = byId.get(qid);
    if (q) counts.set(q.paperId, (counts.get(q.paperId) ?? 0) + 1);
  }
  const order = new Map(bundle.papers.map((p, i) => [p.id, i]));
  const ranked = [...counts.entries()].sort(([a, na], [b, nb]) => {
    if (na !== nb) return nb - na;
    const ia = order.get(a) ?? Infinity;
    const ib = order.get(b) ?? Infinity;
    return ia !== ib ? ia - ib : a < b ? -1 : a > b ? 1 : 0;
  });
  return ranked[0]?.[0] ?? bundle.papers[0]?.id ?? "";
}

export function mockReport(
  log: LearningEvent[],
  bundle: ContentBundle,
  sessionId: string,
  paperId: string,
  timeUsedMs: number,
): MockReport {
  const mine = answersOf(log).filter((e) => e.mode === "mock" && e.sessionId === sessionId);
  return reportFrom(mine, bundle, sessionId, paperId, timeUsedMs);
}

const PART_LABELS: Record<PartScore["id"], string> = {
  A: "Part A: Tamil",
  GS: "Part B: General Studies",
  APT: "Part B: Aptitude",
};
const PART_ORDER: PartScore["id"][] = ["A", "GS", "APT"];

function partOf(q: Question): PartScore["id"] {
  if (q.section === "tamil") return "A";
  return q.unitId?.startsWith("ccse4.apt") ? "APT" : "GS";
}

/** The report from one session's mock answers (already filtered to that session and mode "mock"). */
function reportFrom(mine: AnswerGiven[], bundle: ContentBundle, sessionId: string, paperId: string, timeUsedMs: number): MockReport {
  const byId = new Map<string, Question>(bundle.questions.map((q) => [q.id, q]));
  const paper = paperQuestionIds(bundle, paperId)
    .map((id) => byId.get(id))
    .filter((q): q is Question => q !== undefined);
  const latest = latestAnswers(mine);

  let submittedAt = "";
  for (const e of mine) if (e.at > submittedAt) submittedAt = e.at;

  const parts = new Map<PartScore["id"], PartScore>();
  const units = new Map<string, { total: number; answered: number; correct: number }>();
  const confidence: MockReport["confidence"] = {
    sure: { correct: 0, wrong: 0 },
    guess: { correct: 0, wrong: 0 },
    none: { correct: 0, wrong: 0 },
  };
  const misconceptionIds: string[] = [];
  let answered = 0;
  let correct = 0;
  let wrong = 0;
  let unscored = 0;

  for (const q of paper) {
    const a = latest.get(q.id);
    if (a) answered++;
    const pid = partOf(q);
    const part = parts.get(pid) ?? { id: pid, label: PART_LABELS[pid], total: 0, answered: 0, correct: 0, marks: 0, maxMarks: 0 };
    parts.set(pid, part);
    const unit = q.unitId ? units.get(q.unitId) ?? { total: 0, answered: 0, correct: 0 } : null;
    if (q.unitId && unit) units.set(q.unitId, unit);

    if (q.status === "deleted") {
      unscored++;
      continue;
    }
    part.total++;
    if (unit) unit.total++;
    if (!a) continue;
    part.answered++;
    if (unit) unit.answered++;
    const o = outcome(q, a.chosen);
    const conf = effectiveConfidence(a.chosen, a.confidence);
    if (o === "correct") {
      correct++;
      part.correct++;
      if (unit) unit.correct++;
    } else {
      wrong++;
    }
    const evidence = learningOutcome(q, a.chosen);
    if (evidence === "correct") confidence[conf].correct++;
    else if (evidence === "wrong") {
      confidence[conf].wrong++;
      if (conf === "sure") misconceptionIds.push(q.id);
    }
  }

  for (const p of parts.values()) {
    p.marks = p.correct * MARKS_PER_QUESTION;
    p.maxMarks = p.total * MARKS_PER_QUESTION;
  }
  const unitOrder = new Map(bundle.units.map((u, i) => [u.id, i]));
  const unitName = new Map(bundle.units.map((u) => [u.id, u.nameEn]));
  const byUnit = [...units.entries()]
    .sort(([a], [b]) => {
      const ia = unitOrder.get(a) ?? Infinity;
      const ib = unitOrder.get(b) ?? Infinity;
      return ia !== ib ? ia - ib : a < b ? -1 : a > b ? 1 : 0;
    })
    .map(([unitId, u]) => ({ unitId, name: unitName.get(unitId) ?? unitId, total: u.total, answered: u.answered, correct: u.correct }));

  const scorable = paper.length - unscored;
  return {
    sessionId,
    paperId,
    submittedAt,
    total: paper.length,
    answered,
    unanswered: paper.length - answered,
    correct,
    wrong,
    unscored,
    marks: correct * MARKS_PER_QUESTION,
    maxMarks: scorable * MARKS_PER_QUESTION,
    parts: PART_ORDER.flatMap((id) => (parts.has(id) ? [parts.get(id) as PartScore] : [])),
    byUnit,
    confidence,
    misconceptionIds,
    timeUsedMs: Math.max(0, Math.min(timeUsedMs, MOCK_SECONDS * 1000)),
  };
}

export interface MockHistoryEntry {
  sessionId: string;
  paperId: string; // derived from the questions answered (mockPaperId)
  submittedAt: string;
  answered: number;
  marks: number;
  maxMarks: number;
}

export function mockHistory(log: LearningEvent[], bundle: ContentBundle): MockHistoryEntry[] {
  const sessions = new Map<string, AnswerGiven[]>();
  for (const e of answersOf(log)) {
    if (e.mode !== "mock") continue;
    const list = sessions.get(e.sessionId);
    if (list) list.push(e);
    else sessions.set(e.sessionId, [e]);
  }
  return [...sessions.entries()]
    .map(([sessionId, mine]) => {
      const paperId = mockPaperId(mine, bundle);
      const r = reportFrom(mine, bundle, sessionId, paperId, 0);
      return { sessionId, paperId, submittedAt: r.submittedAt, answered: r.answered, marks: r.marks, maxMarks: r.maxMarks };
    })
    .sort((a, b) =>
      a.submittedAt !== b.submittedAt ? (a.submittedAt < b.submittedAt ? 1 : -1) : a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0,
    );
}

/** One row of the "which paper?" choice on the mock card. */
export interface MockPaperChoice {
  paperId: string;
  title: string;
  questions: number; // questions in the paper (deleted ones included: they are still on the sheet)
  last: MockHistoryEntry | null; // the latest mock of this paper, if any
}

/** Every paper in the bundle, newest first (bundle order), each with its question count and last mock. */
export function mockPaperChoices(bundle: ContentBundle, history: MockHistoryEntry[]): MockPaperChoice[] {
  const last = new Map<string, MockHistoryEntry>();
  for (const h of history) if (!last.has(h.paperId) || h.submittedAt > (last.get(h.paperId) as MockHistoryEntry).submittedAt) last.set(h.paperId, h);
  return bundle.papers.map((p) => ({
    paperId: p.id,
    title: p.title,
    questions: paperQuestionIds(bundle, p.id).length,
    last: last.get(p.id) ?? null,
  }));
}
