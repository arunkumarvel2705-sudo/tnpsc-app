// core/events — raw event files -> validated, de-duplicated, ordered log. (Agent: events)
// Contract is fixed; implement the bodies. Tests: AT-C1, AT-C2, plus validation cases.
import type { AnswerGiven, ErrorTagged, LearningEvent } from "./types";

export interface ParseResult {
  events: LearningEvent[];
  rejected: { line: number; reason: string }[]; // 1-based line numbers; blank lines are skipped, not rejected
}

/**
 * Validate one parsed JSON value. Returns the event, or a reason string when it is not a valid
 * schemaVersion-1 AnswerGiven or ErrorTagged. Normalises: chosen "E" forces confidence "none" (AT-C5).
 * Unknown extra fields are dropped from the returned object.
 */
export function validateEvent(_raw: unknown): LearningEvent | string {
  throw new Error("not implemented");
}

/** Parse one JSONL file (one event per line). Bad lines are reported, never thrown. */
export function parseEventLines(_text: string): ParseResult {
  throw new Error("not implemented");
}

/** Union of lists; each eventId kept once (first seen wins); ordered by at, then eventId (AT-C1, NFR-05). */
export function buildLog(..._lists: LearningEvent[][]): LearningEvent[] {
  throw new Error("not implemented");
}

export function answersOf(_log: LearningEvent[]): AnswerGiven[] {
  throw new Error("not implemented");
}

/** Latest ErrorTagged per answerEventId (by log order). */
export function errorTagsByAnswer(_log: LearningEvent[]): Map<string, ErrorTagged> {
  throw new Error("not implemented");
}
