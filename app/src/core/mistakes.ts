// core/mistakes — events + content -> MistakeState per concept. (Agent: mistakes)
// Contract is fixed; implement the bodies. Tests: AT-C5, AT-C6, AT-C7 and the rules below.
//
// Lifecycle (spec "Learning design"):
//   logged  - answered wrong; retest is due the next IST day (retestDay = loggedDay + 1)
//   spaced  - at least one counted correct + sure answer since the last wrong; FSRS times further retests
//   fixed   - streak >= 3 AND daysBetween(streakStartDay, day of the latest counted answer) >= 14
//             AND (not misconception OR transferDone OR not transferPossible)
//   transferPossible = the concept has at least one other learnable question (active, not keyed ALL);
//   without one a misconception could never be fixed (review finding 8).
//
// Processing, in sortEvents order, learnable answers only (scoring.learningOutcome !== "unscored": deleted
// and ALL-keyed questions carry no evidence), keyed by conceptKey(q):
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
import { conceptKey } from "./content";
import { effectiveConfidence, learningOutcome, sortEvents } from "./scoring";
import { addDays, daysBetween, localDay } from "./time";
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
  wrongQuestionIds: string[]; // questions answered wrong in the current episode, sorted
  sureWrongQuestionIds: string[]; // the subset answered wrong while sure, sorted (feeds the skill map)
  transferPossible: boolean; // another learnable question on this concept exists
  loggedDay: string;
  retestDay: string;
  lastWrongAt: string;
  lastWrongEventId: string;
  reason: ErrorReason | null;
  fixedAt: string | null;
  episodes: number;
}

export function mistakeStates(log: LearningEvent[], questions: Map<string, Question>): Map<string, MistakeState> {
  const sorted = sortEvents(log);
  const states = new Map<string, MistakeState>();
  // Working sets for wrongQuestionIds; copied into sorted arrays on output.
  const wrongIds = new Map<string, Set<string>>();
  const sureWrongIds = new Map<string, Set<string>>();
  // Learnable questions per concept, to know whether a transfer question can exist.
  const conceptSize = new Map<string, number>();
  for (const q of questions.values()) {
    if (q.status === "deleted" || q.accepted === "ALL") continue;
    conceptSize.set(conceptKey(q), (conceptSize.get(conceptKey(q)) ?? 0) + 1);
  }

  for (const e of sorted) {
    if (e.type !== "answer") continue;
    const q = questions.get(e.questionId);
    if (!q) continue;
    const o = learningOutcome(q, e.chosen);
    if (o === "unscored") continue;
    const key = conceptKey(q);
    const confidence = effectiveConfidence(e.chosen, e.confidence); // E is always "none" (AT-C5)
    const day = localDay(e.at);
    const prev = states.get(key);

    if (o === "wrong") {
      const open = prev !== undefined && prev.stage !== "fixed";
      const ids = open ? wrongIds.get(key)! : new Set<string>();
      ids.add(q.id);
      wrongIds.set(key, ids);
      const sure = open ? sureWrongIds.get(key)! : new Set<string>();
      if (confidence === "sure") sure.add(q.id);
      sureWrongIds.set(key, sure);
      states.set(key, {
        conceptId: key,
        topicId: q.topicId ?? null,
        unitId: q.unitId ?? null,
        stage: "logged",
        misconception: open ? prev.misconception || confidence === "sure" : confidence === "sure",
        streak: 0,
        streakStartDay: null,
        transferDone: false,
        wrongQuestionIds: [],
        sureWrongQuestionIds: [],
        transferPossible: (conceptSize.get(key) ?? 0) >= 2,
        loggedDay: day,
        retestDay: addDays(day, 1),
        lastWrongAt: e.at,
        lastWrongEventId: e.eventId,
        reason: null,
        fixedAt: null,
        episodes: open ? prev.episodes : (prev?.episodes ?? 0) + 1,
      });
      continue;
    }

    // correct
    if (!prev || prev.stage === "fixed") continue;
    if (confidence !== "sure") {
      prev.streak = 0;
      prev.streakStartDay = null;
      continue;
    }
    if (day < prev.retestDay) continue; // same-day re-answer proves nothing
    prev.streak += 1;
    if (prev.streak === 1) prev.streakStartDay = day;
    prev.stage = "spaced";
    if (!wrongIds.get(key)!.has(q.id)) prev.transferDone = true;
    if (
      prev.streak >= 3 &&
      prev.streakStartDay !== null &&
      daysBetween(prev.streakStartDay, day) >= 14 &&
      (!prev.misconception || prev.transferDone || !prev.transferPossible)
    ) {
      prev.stage = "fixed";
      prev.fixedAt = e.at;
    }
  }

  // reason: the latest ErrorTagged explaining the last wrong answer.
  const reasons = new Map<string, ErrorReason>();
  for (const e of sorted) if (e.type === "errorTag") reasons.set(e.answerEventId, e.reason);

  for (const [key, st] of states) {
    st.wrongQuestionIds = [...wrongIds.get(key)!].sort();
    st.sureWrongQuestionIds = [...sureWrongIds.get(key)!].sort();
    st.reason = reasons.get(st.lastWrongEventId) ?? null;
  }
  return states;
}

/** States not fixed, sorted: misconceptions first, then retestDay, then conceptId. */
export function openMistakes(states: Map<string, MistakeState>): MistakeState[] {
  return [...states.values()]
    .filter((s) => s.stage !== "fixed")
    .sort((a, b) => {
      if (a.misconception !== b.misconception) return a.misconception ? -1 : 1;
      if (a.retestDay !== b.retestDay) return a.retestDay < b.retestDay ? -1 : 1;
      return a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0;
    });
}
