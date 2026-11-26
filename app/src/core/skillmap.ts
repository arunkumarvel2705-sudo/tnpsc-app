// core/skillmap — events + content -> SkillState per unit. (Agent: skillmap)
// Tests: AT-C4, AT-C8 and the rules below. (Revised after independent review, findings 1, 2, 5, 7.)
//
// Per unit, using the latest answer per question (scoring.latestAnswers), learnable answers only
// (scoring.learningOutcome: deleted and ALL-keyed questions are no evidence):
//   scored    = questions in the unit with a learnable latest answer
//   accuracy  = correct / scored (0 when scored is 0)
//   sureShare = correct-and-sure / correct (1 when correct is 0, so it never triggers shaky by itself)
//   unresolvedMisconceptions = sureWrongQuestionIds of every open misconception MistakeState, counted in
//                              the unit of each question (the current episode only: once a concept is
//                              fixed its old answers stop counting, and they count until it is fixed)
//   needed    = min(MIN_ANSWERS, learnable questions in the unit), at least 1; only servable questions
//               (content.isServable) count here, since a unit must be able to leave "insufficient" on
//               questions the app can actually show. Answers already given to a hidden question still count.
// Box, first rule that matches:
//   misconception  unresolvedMisconceptions >= 2   (checked before the data minimum: red must surface)
//   insufficient   scored < needed   (a 6-question unit is judged once all 6 are answered)
//   weak           accuracy < 0.6
//   shaky          accuracy < 0.8, or sureShare < 0.7
//   strong         otherwise
// weakness = WEAKNESS[box]. evidence = one plain sentence for the "why" tap, e.g.
//   "2 sure-but-wrong answers not fixed yet", "6 of 10 answers so far",
//   "5 of 10 correct (50%)", "9 of 10 correct (90%), 8 of 9 sure".
// Confidence is read through scoring.effectiveConfidence, so a raw E + "sure" counts as "none" (AT-C5).
// Every unit id passed in gets a state, even with no answers. Questions without unitId are ignored.
import { isServable } from "./content";
import type { MistakeState } from "./mistakes";
import { effectiveConfidence, latestAnswers, learningOutcome } from "./scoring";
import type { AnswerGiven, Question } from "./types";

export type Box = "insufficient" | "misconception" | "weak" | "shaky" | "strong";

export const MIN_ANSWERS = 10;

/** Weakness for the planner: 0 strong ... 1 misconception. Insufficient sits high so unknown units get diagnosed early. */
export const WEAKNESS: Record<Box, number> = { misconception: 1, weak: 0.75, insufficient: 0.6, shaky: 0.5, strong: 0 };

export interface SkillState {
  unitId: string;
  box: Box;
  scored: number;
  correct: number;
  accuracy: number;
  sureShare: number;
  unresolvedMisconceptions: number;
  weakness: number;
  evidence: string;
}

export function skillStates(
  unitIds: string[],
  answers: AnswerGiven[],
  questions: Map<string, Question>,
  mistakes: Map<string, MistakeState>,
): Map<string, SkillState> {
  const tallies = new Map<string, Tally>();
  for (const unitId of unitIds) tallies.set(unitId, { learnable: 0, scored: 0, correct: 0, sureCorrect: 0, unresolved: 0 });

  for (const q of questions.values()) {
    if (!q.unitId || q.status === "deleted" || q.accepted === "ALL" || !isServable(q)) continue;
    const t = tallies.get(q.unitId);
    if (t) t.learnable++;
  }

  for (const e of latestAnswers(answers).values()) {
    const q = questions.get(e.questionId);
    if (!q || !q.unitId) continue;
    const t = tallies.get(q.unitId);
    if (!t) continue;
    const o = learningOutcome(q, e.chosen);
    if (o === "unscored") continue;
    t.scored++;
    if (o === "correct") {
      t.correct++;
      if (effectiveConfidence(e.chosen, e.confidence) === "sure") t.sureCorrect++;
    }
  }

  // Unresolved misconceptions: sure-but-wrong answers in each open misconception episode, counted
  // against the unit of the question that was answered (review finding 2).
  for (const m of mistakes.values()) {
    if (m.stage === "fixed" || !m.misconception) continue;
    for (const qid of m.sureWrongQuestionIds) {
      const unitId = questions.get(qid)?.unitId;
      const t = unitId ? tallies.get(unitId) : undefined;
      if (t) t.unresolved++;
    }
  }

  const out = new Map<string, SkillState>();
  for (const [unitId, t] of tallies) out.set(unitId, toState(unitId, t));
  return out;
}

interface Tally {
  learnable: number; // active, non-ALL, servable questions in the unit
  scored: number;
  correct: number;
  sureCorrect: number;
  unresolved: number;
}

function toState(unitId: string, t: Tally): SkillState {
  const accuracy = t.scored ? t.correct / t.scored : 0;
  const sureShare = t.correct ? t.sureCorrect / t.correct : 1;
  const box: Box =
    t.unresolved >= 2 ? "misconception"
    : t.scored < needed(t) ? "insufficient"
    : accuracy < 0.6 ? "weak"
    : accuracy < 0.8 || sureShare < 0.7 ? "shaky"
    : "strong";
  return {
    unitId,
    box,
    scored: t.scored,
    correct: t.correct,
    accuracy,
    sureShare,
    unresolvedMisconceptions: t.unresolved,
    weakness: WEAKNESS[box],
    evidence: evidence(box, t, accuracy),
  };
}

/** A unit with fewer than MIN_ANSWERS questions is judged once all of them are answered (review finding 1). */
function needed(t: Tally): number {
  return Math.max(1, Math.min(MIN_ANSWERS, t.learnable));
}

function evidence(box: Box, t: Tally, accuracy: number): string {
  if (box === "misconception") return `${t.unresolved} sure-but-wrong answers not fixed yet`;
  if (box === "insufficient") return t.learnable ? `${t.scored} of ${needed(t)} answers so far` : "No questions on this unit yet";
  const acc = `${t.correct} of ${t.scored} correct (${Math.round(accuracy * 100)}%)`;
  if (box === "weak") return acc;
  return `${acc}, ${t.sureCorrect} of ${t.correct} sure`;
}
