// Pure helpers for the mock runner: timer text, draft updates and the question grid.
// Every update returns a NEW draft (or the same object when nothing changed); props are never mutated.
import type { Confidence, Option } from "../../core/types";
import type { MockDraft } from "../mock";

/** Under this much time left the timer turns amber. */
export const LOW_TIME_MS = 10 * 60 * 1000;

/** Countdown text h:mm:ss. Whole seconds, rounded down; never negative. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function isLowTime(ms: number): boolean {
  return ms < LOW_TIME_MS;
}

export interface MockCounts { total: number; answered: number; unanswered: number; flagged: number }

export function counts(d: MockDraft): MockCounts {
  const answered = d.questionIds.filter((id) => d.answers[id]).length;
  return { total: d.questionIds.length, answered, unanswered: d.questionIds.length - answered, flagged: d.marked.length };
}

/**
 * Shade an option, like an OMR sheet: it can be changed any time; choosing the shaded option again
 * changes nothing. E (answer not known) always stores "none". A first non-E choice defaults to "guess";
 * switching between A–D keeps the confidence already given.
 */
export function choose(d: MockDraft, qid: string, opt: Option): MockDraft {
  const prev = d.answers[qid];
  if (prev?.chosen === opt) return d;
  const confidence: Confidence = opt === "E" ? "none" : prev && prev.chosen !== "E" ? prev.confidence : "guess";
  return { ...d, answers: { ...d.answers, [qid]: { chosen: opt, confidence, timeMs: prev?.timeMs ?? 0 } } };
}

/** Confidence for an answered A–D question. E stays "none"; unanswered questions are left alone. */
export function setConfidence(d: MockDraft, qid: string, c: Confidence): MockDraft {
  const prev = d.answers[qid];
  if (!prev || prev.chosen === "E" || prev.confidence === c) return d;
  return { ...d, answers: { ...d.answers, [qid]: { ...prev, confidence: c } } };
}

/** Flag or unflag for review. `marked` stays in paper order. */
export function toggleFlag(d: MockDraft, qid: string): MockDraft {
  if (d.marked.includes(qid)) return { ...d, marked: d.marked.filter((id) => id !== qid) };
  const pos = (id: string) => {
    const i = d.questionIds.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const marked = [...d.marked, qid].sort((a, b) => pos(a) - pos(b) || (a < b ? -1 : a > b ? 1 : 0));
  return { ...d, marked };
}

/**
 * Time spent on a question that is not answered yet, held until it is answered (kept in memory only;
 * the draft has nowhere to store time for an unanswered question).
 */
export type Carry = Readonly<Record<string, number>>;

/**
 * Add `ms` spent on `qid`. Answered: added to its timeMs together with any carried time.
 * Unanswered: carried until it is answered.
 */
export function spend(d: MockDraft, carry: Carry, qid: string, ms: number): { draft: MockDraft; carry: Carry } {
  const add = Math.max(0, Math.round(ms));
  const prev = d.answers[qid];
  if (!prev) {
    if (!add) return { draft: d, carry };
    return { draft: d, carry: { ...carry, [qid]: (carry[qid] ?? 0) + add } };
  }
  const total = add + (carry[qid] ?? 0);
  if (!total) return { draft: d, carry };
  const { [qid]: _used, ...rest } = carry;
  void _used;
  return { draft: { ...d, answers: { ...d.answers, [qid]: { ...prev, timeMs: prev.timeMs + total } } }, carry: rest };
}

/** Leave the question on screen (after `elapsedMs` on it) and go to `to` (clamped to the paper). */
export function move(d: MockDraft, carry: Carry, to: number, elapsedMs: number): { draft: MockDraft; carry: Carry } {
  const qid = d.questionIds[d.index];
  const spent = qid ? spend(d, carry, qid, elapsedMs) : { draft: d, carry };
  const index = Math.max(0, Math.min(d.questionIds.length - 1, to));
  if (index === spent.draft.index) return spent;
  return { draft: { ...spent.draft, index }, carry: spent.carry };
}

export interface GridCell { n: number; index: number; qid: string; answered: boolean; flagged: boolean; current: boolean }

/** One cell per question, numbered 1..N in paper order. */
export function gridCells(d: MockDraft): GridCell[] {
  const flagged = new Set(d.marked);
  return d.questionIds.map((qid, index) => ({
    n: index + 1, index, qid, answered: !!d.answers[qid], flagged: flagged.has(qid), current: index === d.index,
  }));
}

/** Wraps onSubmit so the mock is submitted at most once (a timeout tick and a tap can race). */
export function submitOnce<R>(onSubmit: (d: MockDraft, reason: R) => void): (d: MockDraft, reason: R) => boolean {
  let done = false;
  return (d, reason) => {
    if (done) return false;
    done = true;
    onSubmit(d, reason);
    return true;
  };
}
