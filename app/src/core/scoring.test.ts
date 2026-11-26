import { describe, expect, it } from "vitest";
import { effectiveConfidence, mergeEvents, outcome, summarise } from "./scoring";
import type { AnswerGiven, Question } from "./types";

const q = (id: string, accepted: Question["accepted"], status: Question["status"] = "active"): Question => ({
  id, n: 1, section: "gs_apt", accepted, keyStatus: "final", status,
  en: { stem: "s", options: { A: "a", B: "b", C: "c", D: "d", E: "Answer not known" } },
  paperId: "P", source: { exam: "CCSE-IV", year: 2025, paper: "P", qNo: 1, pdfRef: "x.pdf", page: 1 },
});
let seq = 0;
const ans = (questionId: string, chosen: AnswerGiven["chosen"], confidence: AnswerGiven["confidence"], at = `2026-11-22T10:00:${String(seq).padStart(2, "0")}Z`): AnswerGiven => ({
  type: "answer", eventId: `e${seq++}`, deviceId: "phone", at, schemaVersion: 1, sessionId: "s1",
  questionId, chosen, confidence, timeMs: 1000, mode: "practice", contentVersion: "v1",
});

describe("outcome", () => {
  it("scores a single accepted option", () => {
    expect(outcome(q("a", ["B"]), "B")).toBe("correct");
    expect(outcome(q("a", ["B"]), "C")).toBe("wrong");
  });
  it("accepts any of several options (key B/C)", () => {
    expect(outcome(q("a", ["B", "C"]), "C")).toBe("correct");
  });
  it("ALL scores every choice, including E", () => {
    expect(outcome(q("a", "ALL"), "E")).toBe("correct");
  });
  it("E is wrong when the key names options", () => {
    expect(outcome(q("a", ["A"]), "E")).toBe("wrong");
  });
  it("AT-C4: deleted questions are never scored", () => {
    expect(outcome(q("a", ["A"], "deleted"), "A")).toBe("unscored");
  });
});

describe("AT-C5: choosing E", () => {
  it("records confidence none whatever was tapped", () => {
    expect(effectiveConfidence("E", "sure")).toBe("none");
    expect(effectiveConfidence("B", "sure")).toBe("sure");
  });
});

describe("AT-C1: merge", () => {
  it("counts the same eventId once", () => {
    const e = ans("a", "A", "sure");
    expect(mergeEvents([e], [e, { ...e }])).toHaveLength(1);
  });
});

describe("summarise", () => {
  const qs = new Map([["a", q("a", ["A"])], ["b", q("b", ["B"])], ["c", q("c", ["C"])], ["d", q("d", ["D"], "deleted")]]);
  it("separates misconceptions, lucky guesses and unknowns; latest answer wins", () => {
    const events = [
      ans("a", "B", "sure"), ans("a", "A", "sure"), // re-answered: latest (correct, sure) counts
      ans("b", "B", "guess"), // lucky guess
      ans("c", "A", "sure"), // misconception
      ans("d", "D", "sure"), // deleted: not scored
    ];
    const s = summarise(events, qs);
    expect(s).toMatchObject({ answered: 4, scored: 3, correct: 2, sureCorrect: 1, luckyGuesses: 1, misconceptions: 1 });
    expect(s.accuracy).toBeCloseTo(2 / 3);
  });
  it("AT-C2/AT-C3: deterministic, and re-derives from a revised key", () => {
    const events = [ans("a", "C", "sure")];
    expect(summarise(events, qs)).toEqual(summarise([...events], qs));
    const revised = new Map(qs); revised.set("a", q("a", ["C"]));
    expect(summarise(events, revised).correct).toBe(1);
  });
});
