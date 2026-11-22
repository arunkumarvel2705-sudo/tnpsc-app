// core/engine — one pure call from the event log + content bundle to everything the screens need.
// Replaying the same log against the same bundle on the same day gives deep-equal state (AT-C2).
import { topicIndex, indexQuestions } from "./content";
import { answersOf, buildLog } from "./events";
import { cardStates, reviewsFromAnswers, type CardState } from "./fsrs";
import { mistakeStates, type MistakeState } from "./mistakes";
import { planDay, type DailyPlan } from "./planner";
import { skillStates, type SkillState } from "./skillmap";
import type { AnswerGiven, ContentBundle, LearningEvent } from "./types";

export interface EngineState {
  answers: AnswerGiven[];
  mistakes: Map<string, MistakeState>;
  skills: Map<string, SkillState>;
  cards: Map<string, CardState>;
  plan: DailyPlan;
}

/**
 * `log` should be validated (events.validateEvent); it is de-duplicated and ordered here so AT-C1 never
 * depends on the caller (review finding 6). `today` is an IST day (core/time).
 */
export function computeState(rawLog: LearningEvent[], bundle: ContentBundle, today: string, pathExam: string): EngineState {
  const log = buildLog(rawLog);
  const questions = indexQuestions(bundle);
  const answers = answersOf(log);
  const mistakes = mistakeStates(log, questions);
  const skills = skillStates(bundle.units.map((u) => u.id), answers, questions, mistakes);
  const cards = cardStates(reviewsFromAnswers(answers, questions));
  const plan = planDay({
    today,
    pathExam,
    topics: topicIndex(bundle, pathExam),
    questions: bundle.questions,
    answers,
    skills,
    mistakes,
    cards,
  });
  return { answers, mistakes, skills, cards, plan };
}
