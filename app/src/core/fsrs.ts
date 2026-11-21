// core/fsrs — item review history -> next due date. Wraps ts-fsrs 6.0.0 (MIT). (Agent: fsrs)
// Contract is fixed; implement the bodies.
// Rules: default parameters, enable_fuzz false (must be deterministic), replay reviews in (at, cardId) order.
import type { Outcome } from "./scoring";
import type { AnswerGiven, Confidence, Question } from "./types";

export type CardKind = "question" | "fact" | "term"; // v1 creates only "question" cards; the others arrive with content
export type Grade = 1 | 2 | 3 | 4; // ts-fsrs Rating: Again, Hard, Good, Easy

export interface Review {
  cardId: string;
  kind: CardKind;
  at: string; // ISO timestamp of the answer
  grade: Grade;
}

export interface CardState {
  cardId: string;
  kind: CardKind;
  due: string; // ISO timestamp from ts-fsrs
  dueDay: string; // IST day of `due` (core/time localDay)
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewAt: string;
}

/** wrong -> 1 (Again); correct + sure -> 3 (Good); correct + guess or none -> 2 (Hard). Easy is never given in v1. */
export function gradeFor(_o: Exclude<Outcome, "unscored">, _c: Confidence): Grade {
  throw new Error("not implemented");
}

/** Card id for a question card: "q:" + questionId. */
export function questionCardId(questionId: string): string {
  return `q:${questionId}`;
}

/**
 * v1 cards: a question card is born at the first scored wrong answer to that question; that answer and
 * every later scored answer to the same question are its reviews. Unscored answers (deleted questions)
 * and answers to unknown questions are ignored. Correctness comes from the current key (scoring.outcome).
 */
export function reviewsFromAnswers(_answers: AnswerGiven[], _questions: Map<string, Question>): Review[] {
  throw new Error("not implemented");
}

/** Replay all reviews and return the state of every card. Same input -> deep-equal output. */
export function cardStates(_reviews: Review[]): Map<string, CardState> {
  throw new Error("not implemented");
}

/** Cards with dueDay <= today, most overdue first (dueDay, then due, then cardId). */
export function dueCards(_states: Map<string, CardState>, _today: string): CardState[] {
  throw new Error("not implemented");
}
