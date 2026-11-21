import type { AnswerGiven, Confidence, Option, Question } from "./types";

export type Outcome = "correct" | "wrong" | "unscored";

/** Correctness is always derived from the current key, never stored (spec rule; AT-C3, AT-C4). */
export function outcome(q: Question, chosen: Option): Outcome {
  if (q.status === "deleted") return "unscored";
  if (q.accepted === "ALL") return "correct";
  if (chosen === "E") return "wrong";
  return q.accepted.includes(chosen) ? "correct" : "wrong";
}

/** Choosing E (Answer not known) always records confidence "none" (AT-C5). */
export function effectiveConfidence(chosen: Option, tapped: Confidence | null): Confidence {
  return chosen === "E" ? "none" : tapped ?? "none";
}

export interface Summary {
  answered: number;
  scored: number;
  correct: number;
  accuracy: number; // 0..1 over scored answers
  sureCorrect: number;
  luckyGuesses: number; // correct but guessed
  misconceptions: number; // wrong but sure
  unknown: number; // chose E or "no idea"
}

/** Latest answer per question wins; summary over those answers. Pure: same input, same output. */
export function summarise(events: AnswerGiven[], questions: Map<string, Question>): Summary {
  const latest = latestAnswers(events);
  const s: Summary = { answered: 0, scored: 0, correct: 0, accuracy: 0, sureCorrect: 0, luckyGuesses: 0, misconceptions: 0, unknown: 0 };
  for (const e of latest.values()) {
    const q = questions.get(e.questionId);
    if (!q) continue;
    s.answered++;
    const o = outcome(q, e.chosen);
    if (o === "unscored") continue;
    s.scored++;
    if (e.chosen === "E" || e.confidence === "none") s.unknown++;
    if (o === "correct") {
      s.correct++;
      if (e.confidence === "sure") s.sureCorrect++;
      if (e.confidence === "guess") s.luckyGuesses++;
    } else if (e.confidence === "sure") {
      s.misconceptions++;
    }
  }
  s.accuracy = s.scored ? s.correct / s.scored : 0;
  return s;
}

export function latestAnswers(events: AnswerGiven[]): Map<string, AnswerGiven> {
  const m = new Map<string, AnswerGiven>();
  for (const e of sortEvents(events)) m.set(e.questionId, e);
  return m;
}

/** Deterministic order: time, then eventId as a tie-break (NFR-05). */
export function sortEvents<T extends { at: string; eventId: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
}

/** Union of event lists, each eventId counted once (AT-C1). */
export function mergeEvents<T extends { eventId: string; at: string }>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const e of list) if (!byId.has(e.eventId)) byId.set(e.eventId, e);
  return sortEvents([...byId.values()]);
}
