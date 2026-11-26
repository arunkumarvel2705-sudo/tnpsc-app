// core/events — raw event files -> validated, de-duplicated, ordered log. (Agent: events)
// Contract is fixed; implement the bodies. Tests: AT-C1, AT-C2, plus validation cases.
import { mergeEvents } from "./scoring";
import type { AnswerGiven, ErrorTagged, LearningEvent, TagReviewed } from "./types";

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export interface ParseResult {
  events: LearningEvent[];
  rejected: { line: number; reason: string }[]; // 1-based line numbers; blank lines are skipped, not rejected
}

const OPTIONS: readonly string[] = ["A", "B", "C", "D", "E"];
const CONFIDENCES: readonly string[] = ["sure", "guess", "none"];
const MODES: readonly string[] = ["diagnostic", "practice", "review", "mock"];
const REASONS: readonly string[] = ["concept", "careless", "misread", "time", "memory", "other"];
const VERDICTS: readonly string[] = ["confirm", "change", "nofit"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const show = (v: unknown): string => {
  if (v === undefined) return "missing";
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};
const showBare = (v: unknown): string => (typeof v === "string" ? v : show(v));

/**
 * Validate one parsed JSON value. Returns the event, or a reason string when it is not a valid
 * schemaVersion-1 AnswerGiven, ErrorTagged or TagReviewed. Normalises: chosen "E" forces confidence "none" (AT-C5).
 * Unknown extra fields are dropped from the returned object. `at` is normalised to UTC ISO form
 * (e.g. "...+05:30" -> "...Z") so that sorting by text equals sorting by time.
 */
export function validateEvent(raw: unknown): LearningEvent | string {
  if (!isObject(raw)) return `not an object: ${show(raw)}`;
  const r = raw;
  if (r.type !== "answer" && r.type !== "errorTag" && r.type !== "tagReview") return `bad type: ${showBare(r.type)}`;
  if (r.schemaVersion !== 1) return `bad schemaVersion: ${show(r.schemaVersion)}`;
  for (const k of ["eventId", "deviceId", "sessionId"] as const) {
    if (!isNonEmptyString(r[k])) return `bad ${k}: ${show(r[k])}`;
  }
  // ISO 8601 with an explicit zone only: a zoneless time would be read in the device's own zone (review finding 4).
  if (typeof r.at !== "string" || !ISO_WITH_ZONE.test(r.at) || Number.isNaN(Date.parse(r.at))) return `bad at: ${show(r.at)}`;
  const base = {
    eventId: r.eventId as string,
    deviceId: r.deviceId as string,
    at: new Date(r.at).toISOString(), // normalised to UTC so text order is time order
    schemaVersion: 1 as const,
    sessionId: r.sessionId as string,
  };

  if (r.type === "answer") {
    if (!isNonEmptyString(r.questionId)) return `bad questionId: ${show(r.questionId)}`;
    if (typeof r.chosen !== "string" || !OPTIONS.includes(r.chosen)) return `bad chosen: ${showBare(r.chosen)}`;
    if (typeof r.confidence !== "string" || !CONFIDENCES.includes(r.confidence)) return `bad confidence: ${showBare(r.confidence)}`;
    if (typeof r.timeMs !== "number" || !Number.isFinite(r.timeMs) || r.timeMs < 0) return `bad timeMs: ${show(r.timeMs)}`;
    if (typeof r.mode !== "string" || !MODES.includes(r.mode)) return `bad mode: ${showBare(r.mode)}`;
    if (typeof r.contentVersion !== "string" || r.contentVersion === "") return `bad contentVersion: ${show(r.contentVersion)}`;
    const chosen = r.chosen as AnswerGiven["chosen"];
    const ev: AnswerGiven = {
      type: "answer",
      ...base,
      questionId: r.questionId,
      chosen,
      confidence: chosen === "E" ? "none" : (r.confidence as AnswerGiven["confidence"]),
      timeMs: r.timeMs,
      mode: r.mode as AnswerGiven["mode"],
      contentVersion: r.contentVersion,
    };
    return ev;
  }

  if (r.type === "tagReview") {
    if (!isNonEmptyString(r.questionId)) return `bad questionId: ${show(r.questionId)}`;
    if (typeof r.verdict !== "string" || !VERDICTS.includes(r.verdict)) return `bad verdict: ${showBare(r.verdict)}`;
    if (!isNonEmptyString(r.topicId)) return `bad topicId: ${show(r.topicId)}`;
    const ev: TagReviewed = { type: "tagReview", ...base, questionId: r.questionId, verdict: r.verdict as TagReviewed["verdict"], topicId: r.topicId };
    return ev;
  }

  if (!isNonEmptyString(r.answerEventId)) return `bad answerEventId: ${show(r.answerEventId)}`;
  if (!isNonEmptyString(r.questionId)) return `bad questionId: ${show(r.questionId)}`;
  if (typeof r.reason !== "string" || !REASONS.includes(r.reason)) return `bad reason: ${showBare(r.reason)}`;
  const ev: ErrorTagged = {
    type: "errorTag",
    ...base,
    answerEventId: r.answerEventId,
    questionId: r.questionId,
    reason: r.reason as ErrorTagged["reason"],
  };
  return ev;
}

/** Parse one JSONL file (one event per line). Bad lines are reported, never thrown. */
export function parseEventLines(text: string): ParseResult {
  const result: ParseResult = { events: [], rejected: [] };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim(); // also drops a trailing \r from CRLF files
    if (line === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      result.rejected.push({ line: i + 1, reason: `bad JSON: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }
    const v = validateEvent(parsed);
    if (typeof v === "string") result.rejected.push({ line: i + 1, reason: v });
    else result.events.push(v);
  }
  return result;
}

/** Union of lists; each eventId kept once (first seen wins); ordered by at, then eventId (AT-C1, NFR-05). */
export function buildLog(...lists: LearningEvent[][]): LearningEvent[] {
  return mergeEvents(...lists);
}

export function answersOf(log: LearningEvent[]): AnswerGiven[] {
  return log.filter((e): e is AnswerGiven => e.type === "answer");
}

/** Latest ErrorTagged per answerEventId (by log order). */
export function errorTagsByAnswer(log: LearningEvent[]): Map<string, ErrorTagged> {
  const m = new Map<string, ErrorTagged>();
  for (const e of log) if (e.type === "errorTag") m.set(e.answerEventId, e);
  return m;
}
