// core/planner — skill, mistake and card states + date -> DailyPlan. (Agent: planner)
// Contract is fixed; implement the bodies. Tests: AT-C9, AT-C10, AT-C11 and the rules below.
//
// Focus topic: among topics with at least one active question in `questions`,
//   weakness  = skills.get(unitId)?.weakness ?? WEAKNESS.insufficient
//   frequency = papersAsked / papersTotal (0 when papersTotal is 0)
//   relevance = exams includes pathExam ? 1 : 0
//   score     = weakness * frequency * relevance
// Highest score wins; ties -> more open mistakes in the topic, then topicId ascending. No topic with
// score > 0 -> focus null and an empty practice set.
// why names every factor in one line, e.g.
//   "Weak: 5 of 10 correct (50%) · asked in 1 of 1 papers · on your CCSE-IV path"
//   (box label + skill evidence · frequency · relevance)
//
// Mode: "diagnostic" when the focus unit's box is insufficient: practiceSet = up to DIAGNOSTIC_SIZE active
// questions from the focus UNIT never answered, ordered by id; olderTopicQuestionIds empty.
// Otherwise "practice": PRACTICE_SIZE questions:
//   older = min(3, available older-topic questions) where an older topic is any topic other than the focus
//           topic with at least one answer before `today`; pick questions whose concept has an open mistake,
//           then latest answer wrong, then the longest-ago answered; ties by id
//   focus = fill the rest from the focus topic: never answered, then latest wrong, then correct-but-not-sure,
//           ties by id; if the topic runs out, the set is shorter (never pad with more older questions)
//   practiceSet = focus picks then older picks; olderTopicQuestionIds = the older picks
// Review (must fit MAX_REVIEW_MINUTES even after missed days, AT-C10):
//   candidates = open mistakes in stage logged with retestDay <= today (as retestConceptIds, ordered by
//   retestDay then conceptId), then due cards (fsrs.dueCards order); total capped at
//   floor(MAX_REVIEW_MINUTES * 60 / REVIEW_SECONDS_PER_ITEM); estMinutes = ceil(count * REVIEW_SECONDS_PER_ITEM / 60).
//   Retests come first because a next-day retest is the step that most often lapses.
// quick: up to QUICK_SIZE question ids — question ids behind review.cardIds ("q:<id>"), then practiceSet
// order, de-duplicated.
// Deterministic: no clock, no randomness; `today` is an IST day (core/time).
import type { TopicInfo } from "./content";
import type { CardState } from "./fsrs";
import type { MistakeState } from "./mistakes";
import type { Box, SkillState } from "./skillmap";
import type { AnswerGiven, Question } from "./types";

export const PRACTICE_SIZE = 12;
export const DIAGNOSTIC_SIZE = 20;
export const QUICK_SIZE = 5;
export const REVIEW_SECONDS_PER_ITEM = 30;
export const MAX_REVIEW_MINUTES = 10;

export interface PlannerInput {
  today: string;
  pathExam: string; // e.g. "CCSE-IV"
  topics: TopicInfo[];
  questions: Question[];
  answers: AnswerGiven[];
  skills: Map<string, SkillState>;
  mistakes: Map<string, MistakeState>;
  cards: Map<string, CardState>;
}

export interface FocusPick {
  topicId: string;
  unitId: string;
  box: Box;
  weakness: number;
  frequency: number;
  relevance: number;
  score: number;
  why: string;
}

export interface DailyPlan {
  date: string;
  focus: FocusPick | null;
  mode: "diagnostic" | "practice";
  practiceSet: string[];
  olderTopicQuestionIds: string[];
  review: { retestConceptIds: string[]; cardIds: string[]; estMinutes: number };
  quick: string[];
}

export function planDay(_input: PlannerInput): DailyPlan {
  throw new Error("not implemented");
}
