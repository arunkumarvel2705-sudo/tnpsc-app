// core/skillmap — events + content -> SkillState per unit. (Agent: skillmap)
// Contract is fixed; implement the bodies. Tests: AT-C4, AT-C8 and the rules below.
//
// Per unit, using the latest answer per question (scoring.latestAnswers), scored answers only:
//   scored    = questions in the unit with a scored latest answer
//   accuracy  = correct / scored (0 when scored is 0)
//   sureShare = correct-and-sure / correct (1 when correct is 0, so it never triggers shaky by itself)
//   unresolvedMisconceptions = questions whose latest answer is wrong + sure and whose concept's
//                              MistakeState is not fixed (a missing state counts as not fixed)
// Box, first rule that matches:
//   misconception  unresolvedMisconceptions >= 2   (checked before the data minimum: red must surface)
//   insufficient   scored < MIN_ANSWERS
//   weak           accuracy < 0.6
//   shaky          accuracy < 0.8, or sureShare < 0.7
//   strong         otherwise
// weakness = WEAKNESS[box]. evidence = one plain sentence for the "why" tap, e.g.
//   "2 sure-but-wrong answers not fixed yet", "Not enough data: 6 of 10 answers",
//   "5 of 10 correct (50%)", "9 of 10 correct (90%), 8 of 9 sure".
// Every unit id passed in gets a state, even with no answers. Questions without unitId are ignored.
import { conceptKey } from "./content";
import type { MistakeState } from "./mistakes";
import { latestAnswers, outcome } from "./scoring";
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
  for (const unitId of unitIds) tallies.set(unitId, { scored: 0, correct: 0, sureCorrect: 0, unresolved: 0 });

  for (const e of latestAnswers(answers).values()) {
    const q = questions.get(e.questionId);
    if (!q || !q.unitId) continue;
    const t = tallies.get(q.unitId);
    if (!t) continue;
    const o = outcome(q, e.chosen);
    if (o === "unscored") continue;
    t.scored++;
    if (o === "correct") {
      t.correct++;
      if (e.confidence === "sure") t.sureCorrect++;
    } else if (e.confidence === "sure" && mistakes.get(conceptKey(q))?.stage !== "fixed") {
      t.unresolved++;
    }
  }

  const out = new Map<string, SkillState>();
  for (const [unitId, t] of tallies) out.set(unitId, toState(unitId, t));
  return out;
}

interface Tally {
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
    : t.scored < MIN_ANSWERS ? "insufficient"
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

function evidence(box: Box, t: Tally, accuracy: number): string {
  if (box === "misconception") return `${t.unresolved} sure-but-wrong answers not fixed yet`;
  if (box === "insufficient") return `Not enough data: ${t.scored} of ${MIN_ANSWERS} answers`;
  const acc = `${t.correct} of ${t.scored} correct (${Math.round(accuracy * 100)}%)`;
  if (box === "weak") return acc;
  return `${acc}, ${t.sureCorrect} of ${t.correct} sure`;
}
