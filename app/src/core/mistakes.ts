// core/mistakes — events + content -> MistakeState per concept. (Agent: mistakes)
// Contract is fixed; implement the bodies. Tests: AT-C5, AT-C6, AT-C7 and the rules below.
//
// Lifecycle (spec "Learning design"):
//   logged  - answered wrong; retest is due the next IST day (retestDay = loggedDay + 1)
//   spaced  - at least one counted correct + sure answer since the last wrong; FSRS times further retests
//   fixed   - streak >= 3 AND daysBetween(streakStartDay, day of the latest counted answer) >= 14
//             AND (not misconception OR transferDone)
//
// Processing, in sortEvents order, scored answers only (scoring.outcome !== "unscored"), keyed by conceptKey(q):
//   wrong (any confidence, E included):
//     no state, or state fixed -> new episode: stage logged, streak 0, streakStartDay null,
//                                 misconception = (confidence === "sure"), transferDone false,
//                                 wrongQuestionIds [qid], episodes + 1, fixedAt null
//     open state               -> stage logged, streak 0, streakStartDay null, transferDone false,
//                                 misconception ||= (confidence === "sure"), add qid to wrongQuestionIds
//     both: loggedDay = IST day of the answer, retestDay = loggedDay + 1, lastWrongAt = at,
//           lastWrongEventId = eventId
//   correct + sure, open state, IST day >= retestDay ("counted"):
//     streak + 1 (streakStartDay set when streak becomes 1), stage spaced,
//     transferDone = true if qid is not in wrongQuestionIds; then check fixed (fixedAt = at)
//   correct + sure on loggedDay: ignored (same-day re-answer proves nothing)
//   correct + guess/none, open state: streak 0, streakStartDay null; stage unchanged
//   correct, no state or fixed: nothing
//   E always arrives with confidence "none" (AT-C5) so it can never set misconception.
// reason = reason of the latest ErrorTagged whose answerEventId is lastWrongEventId, else null.
import type { ErrorReason, LearningEvent, Question } from "./types";

export type MistakeStage = "logged" | "spaced" | "fixed";

export interface MistakeState {
  conceptId: string;
  topicId: string | null;
  unitId: string | null;
  stage: MistakeStage;
  misconception: boolean;
  streak: number;
  streakStartDay: string | null;
  transferDone: boolean;
  wrongQuestionIds: string[]; // sorted ascending
  loggedDay: string;
  retestDay: string;
  lastWrongAt: string;
  lastWrongEventId: string;
  reason: ErrorReason | null;
  fixedAt: string | null;
  episodes: number;
}

export function mistakeStates(_log: LearningEvent[], _questions: Map<string, Question>): Map<string, MistakeState> {
  throw new Error("not implemented");
}

/** States not fixed, sorted: misconceptions first, then retestDay, then conceptId. */
export function openMistakes(_states: Map<string, MistakeState>): MistakeState[] {
  throw new Error("not implemented");
}
