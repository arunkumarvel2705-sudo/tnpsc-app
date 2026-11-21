// core/fsrs — item review history -> next due date. Wraps ts-fsrs 6.0.0 (MIT). (Agent: fsrs)
// Contract is fixed; implement the bodies.
// Rules: default parameters, enable_fuzz false (must be deterministic), replay reviews in (at, cardId) order.
import { Rating, createEmptyCard, fsrs, generatorParameters, type Card, type Grade as FsrsGrade } from "ts-fsrs";
import { outcome, sortEvents, type Outcome } from "./scoring";
import { localDay } from "./time";
import type { AnswerGiven, Confidence, Question } from "./types";

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));
const RATING: Record<Grade, FsrsGrade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

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
export function gradeFor(o: Exclude<Outcome, "unscored">, c: Confidence): Grade {
  if (o === "wrong") return 1;
  return c === "sure" ? 3 : 2;
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
export function reviewsFromAnswers(answers: AnswerGiven[], questions: Map<string, Question>): Review[] {
  const born = new Set<string>();
  const reviews: Review[] = [];
  for (const a of sortEvents(answers)) {
    const q = questions.get(a.questionId);
    if (!q) continue;
    const o = outcome(q, a.chosen);
    if (o === "unscored") continue;
    if (!born.has(q.id)) {
      if (o !== "wrong") continue;
      born.add(q.id);
    }
    reviews.push({ cardId: questionCardId(q.id), kind: "question", at: a.at, grade: gradeFor(o, a.confidence) });
  }
  return reviews;
}

function compareReviews(a: Review, b: Review): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.cardId !== b.cardId) return a.cardId < b.cardId ? -1 : 1;
  if (a.grade !== b.grade) return a.grade - b.grade; // total order so shuffled input replays identically
  return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
}

/** Replay all reviews and return the state of every card. Same input -> deep-equal output. */
export function cardStates(reviews: Review[]): Map<string, CardState> {
  const byCard = new Map<string, Review[]>();
  for (const r of [...reviews].sort(compareReviews)) {
    const list = byCard.get(r.cardId);
    if (list) list.push(r);
    else byCard.set(r.cardId, [r]);
  }
  const out = new Map<string, CardState>();
  for (const cardId of [...byCard.keys()].sort()) {
    const list = byCard.get(cardId)!;
    let card: Card = createEmptyCard(new Date(list[0].at));
    for (const r of list) card = scheduler.next(card, new Date(r.at), RATING[r.grade]).card;
    const due = card.due.toISOString();
    out.set(cardId, {
      cardId,
      kind: list[0].kind,
      due,
      dueDay: localDay(due),
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      lastReviewAt: list[list.length - 1].at,
    });
  }
  return out;
}

/** Cards with dueDay <= today, most overdue first (dueDay, then due, then cardId). */
export function dueCards(states: Map<string, CardState>, today: string): CardState[] {
  return [...states.values()]
    .filter((s) => s.dueDay <= today)
    .sort((a, b) =>
      a.dueDay !== b.dueDay ? (a.dueDay < b.dueDay ? -1 : 1)
      : a.due !== b.due ? (a.due < b.due ? -1 : 1)
      : a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0,
    );
}
