// The mock in progress. Saved on every change so closing the app never loses it; the clock keeps
// running while the app is closed, as in the exam hall (AT-U6).
import { MOCK_SECONDS } from "../core/mock";
import type { Confidence, Option } from "../core/types";

export interface MockDraft {
  id: string; // becomes the sessionId of the submitted answers
  paperId: string;
  questionIds: string[];
  startedAt: string; // ISO
  index: number; // question on screen
  answers: Record<string, { chosen: Option; confidence: Confidence; timeMs: number }>;
  marked: string[]; // flagged "review later", sorted
}

export function newDraft(id: string, paperId: string, questionIds: string[], at: string): MockDraft {
  return { id, paperId, questionIds, startedAt: at, index: 0, answers: {}, marked: [] };
}

/** Milliseconds left at `nowMs`; 0 when time is up. */
export function remainingMs(d: MockDraft, nowMs: number): number {
  return Math.max(0, MOCK_SECONDS * 1000 - (nowMs - Date.parse(d.startedAt)));
}
