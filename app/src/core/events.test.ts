import { describe, expect, it } from "vitest";
import { answersOf, buildLog, errorTagsByAnswer, parseEventLines, validateEvent } from "./events";
import type { AnswerGiven, ErrorTagged, LearningEvent } from "./types";

const answer = (over: Partial<AnswerGiven> = {}): AnswerGiven => ({
  type: "answer", eventId: "a1", deviceId: "phone", at: "2026-11-22T10:00:00Z", schemaVersion: 1, sessionId: "s1",
  questionId: "q1", chosen: "B", confidence: "sure", timeMs: 1200, mode: "practice", contentVersion: "v1",
  ...over,
});
const tag = (over: Partial<ErrorTagged> = {}): ErrorTagged => ({
  type: "errorTag", eventId: "t1", deviceId: "phone", at: "2026-11-22T10:05:00Z", schemaVersion: 1, sessionId: "s1",
  answerEventId: "a1", questionId: "q1", reason: "concept",
  ...over,
});
const jsonl = (...rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n");
const without = (o: object, k: string) => {
  const c: Record<string, unknown> = { ...o };
  delete c[k];
  return c;
};

describe("validateEvent", () => {
  it("accepts a valid answer and a valid error tag unchanged", () => {
    expect(validateEvent(answer())).toEqual(answer());
    expect(validateEvent(tag())).toEqual(tag());
  });

  it("returns a fresh object, not the input", () => {
    const a = answer();
    const v = validateEvent(a);
    expect(v).not.toBe(a);
    expect(v).toEqual(a);
  });

  it("drops unknown extra fields", () => {
    const v = validateEvent({ ...answer(), extra: 1, questionText: "secret" });
    expect(v).toEqual(answer());
    expect(Object.keys(v as object).sort()).toEqual(Object.keys(answer()).sort());
    const t = validateEvent({ ...tag(), note: "x" });
    expect(t).toEqual(tag());
  });

  it("AT-C5: chosen E forces confidence none", () => {
    const v = validateEvent(answer({ chosen: "E", confidence: "sure" })) as AnswerGiven;
    expect(v.confidence).toBe("none");
    expect((validateEvent(answer({ chosen: "A", confidence: "guess" })) as AnswerGiven).confidence).toBe("guess");
  });

  it("accepts timeMs 0 and an empty contentVersion string", () => {
    expect(validateEvent(answer({ timeMs: 0, contentVersion: "" }))).toEqual(answer({ timeMs: 0, contentVersion: "" }));
  });

  const cases: [string, unknown, string][] = [
    ["null", null, "not an object"],
    ["array", [answer()], "not an object"],
    ["string", "answer", "not an object"],
    ["unknown type", { ...answer(), type: "click" }, "bad type: click"],
    ["missing type", without(answer(), "type"), "bad type"],
    ["schemaVersion 2", { ...answer(), schemaVersion: 2 }, "bad schemaVersion: 2"],
    ["schemaVersion as string", { ...answer(), schemaVersion: "1" }, "bad schemaVersion"],
    ["empty eventId", answer({ eventId: "" }), "bad eventId"],
    ["missing deviceId", without(answer(), "deviceId"), "bad deviceId: missing"],
    ["numeric sessionId", { ...answer(), sessionId: 7 }, "bad sessionId: 7"],
    ["unparseable at", answer({ at: "yesterday" }), "bad at"],
    ["numeric at", { ...answer(), at: 1732269600000 }, "bad at"],
    ["empty questionId", answer({ questionId: "" }), "bad questionId"],
    ["chosen F", { ...answer(), chosen: "F" }, "bad chosen: F"],
    ["lowercase chosen", { ...answer(), chosen: "a" }, "bad chosen: a"],
    ["bad confidence", { ...answer(), confidence: "maybe" }, "bad confidence: maybe"],
    ["negative timeMs", answer({ timeMs: -1 }), "bad timeMs: -1"],
    ["infinite timeMs", answer({ timeMs: Infinity }), "bad timeMs"],
    ["NaN timeMs", answer({ timeMs: NaN }), "bad timeMs"],
    ["string timeMs", { ...answer(), timeMs: "1200" }, "bad timeMs"],
    ["bad mode", { ...answer(), mode: "exam" }, "bad mode: exam"],
    ["missing contentVersion", without(answer(), "contentVersion"), "bad contentVersion"],
    ["tag: empty answerEventId", tag({ answerEventId: "" }), "bad answerEventId"],
    ["tag: missing questionId", without(tag(), "questionId"), "bad questionId"],
    ["tag: bad reason", { ...tag(), reason: "lazy" }, "bad reason: lazy"],
  ];
  for (const [name, raw, reason] of cases) {
    it(`rejects ${name}`, () => {
      const v = validateEvent(raw);
      expect(typeof v).toBe("string");
      expect(v as string).toContain(reason);
    });
  }
});

describe("parseEventLines", () => {
  it("skips blank lines without rejecting them and handles CRLF", () => {
    const text = ["", JSON.stringify(answer()), "   ", JSON.stringify(tag()), ""].join("\r\n");
    const r = parseEventLines(text);
    expect(r.rejected).toEqual([]);
    expect(r.events).toEqual([answer(), tag()]);
  });

  it("reports a bad JSON line by 1-based number and keeps parsing later lines", () => {
    const text = [JSON.stringify(answer()), "{not json", "", JSON.stringify(answer({ eventId: "a2" }))].join("\n");
    const r = parseEventLines(text);
    expect(r.events.map((e) => e.eventId)).toEqual(["a1", "a2"]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].line).toBe(2);
    expect(r.rejected[0].reason).toMatch(/^bad JSON/);
  });

  it("reports invalid events with their line number and reason", () => {
    const r = parseEventLines(jsonl(answer(), { ...answer({ eventId: "a2" }), chosen: "F" }, tag()));
    expect(r.events.map((e) => e.eventId)).toEqual(["a1", "t1"]);
    expect(r.rejected).toEqual([{ line: 2, reason: "bad chosen: F" }]);
  });

  it("empty text yields nothing", () => {
    expect(parseEventLines("")).toEqual({ events: [], rejected: [] });
  });
});

describe("AT-C1: duplicate eventIds count once", () => {
  it("within one file", () => {
    const r = parseEventLines(jsonl(answer(), answer(), tag()));
    expect(buildLog(r.events)).toHaveLength(2);
  });

  it("across two files", () => {
    const f1 = parseEventLines(jsonl(answer(), tag())).events;
    const f2 = parseEventLines(jsonl(answer(), answer({ eventId: "a2", at: "2026-11-22T10:01:00Z" }))).events;
    const log = buildLog(f1, f2);
    expect(log.map((e) => e.eventId)).toEqual(["a1", "a2", "t1"]);
    expect(answersOf(log)).toHaveLength(2);
  });

  it("first seen wins when a duplicate id differs", () => {
    const log = buildLog([answer({ chosen: "A" })], [answer({ chosen: "C" })]);
    expect(log).toHaveLength(1);
    expect((log[0] as AnswerGiven).chosen).toBe("A");
  });
});

describe("AT-C2: replay is deterministic", () => {
  const events: LearningEvent[] = [
    answer({ eventId: "a3", at: "2026-11-22T10:02:00Z", questionId: "q3" }),
    answer({ eventId: "a1", at: "2026-11-22T10:00:00Z" }),
    tag({ eventId: "t1", at: "2026-11-22T10:05:00Z" }),
    answer({ eventId: "a2b", at: "2026-11-22T10:01:00Z", questionId: "q2" }),
    answer({ eventId: "a2a", at: "2026-11-22T10:01:00Z", questionId: "q2", deviceId: "laptop" }), // same at: eventId breaks the tie
  ];
  const text = jsonl(...events);

  it("replaying the same events twice gives deep-equal logs", () => {
    const once = buildLog(parseEventLines(text).events);
    const twice = buildLog(parseEventLines(text).events, parseEventLines(text).events);
    expect(twice).toEqual(once);
    expect(once.map((e) => e.eventId)).toEqual(["a1", "a2a", "a2b", "a3", "t1"]);
  });

  it("shuffled input order gives the same log", () => {
    const base = buildLog(events);
    const permutations = [[...events].reverse(), [events[2], events[4], events[0], events[3], events[1]], [events[1], events[3], events[4], events[0], events[2]]];
    for (const p of permutations) {
      expect(buildLog(p)).toEqual(base);
      expect(buildLog(parseEventLines(jsonl(...p)).events)).toEqual(base);
    }
    // split across files in different orders
    expect(buildLog(events.slice(3), events.slice(0, 3))).toEqual(base);
  });

  it("buildLog does not mutate its inputs", () => {
    const copy = [...events];
    buildLog(events);
    expect(events).toEqual(copy);
  });
});

describe("answersOf / errorTagsByAnswer", () => {
  it("answersOf keeps only answers, in log order", () => {
    const log = buildLog([tag(), answer(), answer({ eventId: "a2", at: "2026-11-22T10:01:00Z" })]);
    expect(answersOf(log).map((e) => e.eventId)).toEqual(["a1", "a2"]);
  });

  it("errorTagsByAnswer keeps the latest tag per answer", () => {
    const log = buildLog([
      answer(),
      answer({ eventId: "a2", at: "2026-11-22T10:01:00Z" }),
      tag({ eventId: "t2", at: "2026-11-22T10:07:00Z", reason: "careless" }),
      tag({ eventId: "t1", at: "2026-11-22T10:05:00Z", reason: "concept" }),
      tag({ eventId: "t3", at: "2026-11-22T10:06:00Z", answerEventId: "a2", reason: "time" }),
    ]);
    const m = errorTagsByAnswer(log);
    expect(m.size).toBe(2);
    expect(m.get("a1")?.reason).toBe("careless");
    expect(m.get("a1")?.eventId).toBe("t2");
    expect(m.get("a2")?.reason).toBe("time");
    expect(m.has("missing")).toBe(false);
  });
});
