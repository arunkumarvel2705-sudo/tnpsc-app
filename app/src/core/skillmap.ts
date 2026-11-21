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
import type { MistakeState } from "./mistakes";
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
  _unitIds: string[],
  _answers: AnswerGiven[],
  _questions: Map<string, Question>,
  _mistakes: Map<string, MistakeState>,
): Map<string, SkillState> {
  throw new Error("not implemented");
}
