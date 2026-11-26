// End-to-end over all core modules with a synthetic bundle (no real exam content in this public repo).
import { describe, expect, it } from "vitest";
import { computeState } from "./engine";
import { buildLog } from "./events";
import type { AnswerGiven, ContentBundle, LearningEvent, Option, Question } from "./types";

const EXAM = "CCSE-IV";
const mkQ = (i: number, unit: string, topic: string, accepted: Question["accepted"] = ["A"], status: Question["status"] = "active"): Question => ({
  id: `q${String(i).padStart(3, "0")}`, n: i, section: "gs_apt", accepted, keyStatus: "final", status, unitId: unit, topicId: topic,
  en: { stem: `stem ${i}`, options: { A: "a", B: "b", C: "c", D: "d", E: "Answer not known" } },
  paperId: "P1", source: { exam: EXAM, year: 2025, paper: "P1", qNo: i, pdfRef: "x.pdf", page: 1 },
});

function bundle(overrides: (q: Question) => Question = (q) => q): ContentBundle {
  const qs: Question[] = [];
  for (let i = 1; i <= 15; i++) qs.push(mkQ(i, "u1", i <= 8 ? "u1.t1" : "u1.t2"));
  for (let i = 16; i <= 40; i++) qs.push(mkQ(i, "u2", i <= 28 ? "u2.t1" : "u2.t2"));
  return {
    version: "test", builtAt: "2026-11-22T00:00:00Z",
    papers: [{ id: "P1", title: "Test paper", date: "2025-07-12", sections: [{ id: "gs_apt", title: "GS", questions: 40 }] }],
    units: [{ id: "u1", nameEn: "Unit 1", nameTa: null, questions: 15 }, { id: "u2", nameEn: "Unit 2", nameTa: null, questions: 25 }],
    questions: qs.map(overrides),
  };
}

let seq = 0;
const ans = (q: number, chosen: Option, confidence: AnswerGiven["confidence"], at: string): AnswerGiven => ({
  type: "answer", eventId: `e${String(seq++).padStart(4, "0")}`, deviceId: "phone", at, schemaVersion: 1, sessionId: "s",
  questionId: `q${String(q).padStart(3, "0")}`, chosen, confidence: chosen === "E" ? "none" : confidence, timeMs: 1000,
  mode: "practice", contentVersion: "test",
});

// Unit 1: 12 answered, 6 right, and q002 + q004 wrong while sure -> misconception (checked before weak).
// Unit 2: 3 answered -> not enough data.
function history(): LearningEvent[] {
  seq = 0;
  const ev: LearningEvent[] = [];
  for (let i = 1; i <= 12; i++) ev.push(ans(i, i % 2 ? "A" : "B", i <= 4 ? "sure" : "guess", `2026-11-20T0${i % 9}:0${i % 6}:00.000Z`));
  ev.push(ans(16, "A", "sure", "2026-11-21T04:00:00.000Z"), ans(17, "C", "sure", "2026-11-21T04:01:00.000Z"), ans(18, "E", "sure", "2026-11-21T04:02:00.000Z"));
  return buildLog(ev);
}

describe("engine end to end", () => {
  it("produces a coherent plan from real module outputs", () => {
    const s = computeState(history(), bundle(), "2026-11-22", EXAM);
    expect(s.skills.get("u1")!.box).toBe("misconception");
    expect(s.skills.get("u1")!.accuracy).toBe(0.5);
    expect(s.skills.get("u2")!.box).toBe("insufficient");
    expect([...s.mistakes.values()].some((m) => m.misconception)).toBe(true);
    expect(s.cards.size).toBeGreaterThan(0);
    expect(s.plan.focus).not.toBeNull();
    expect(s.plan.focus!.unitId).toBe("u1"); // weakness 1 beats the undiagnosed unit (0.6)
    expect(s.plan.focus!.why).toMatch(/asked in \d+ of \d+ papers/);
    expect(s.plan.review.estMinutes).toBeLessThanOrEqual(10);
    // every planned question exists and is active
    const ids = new Set(bundle().questions.filter((q) => q.status === "active").map((q) => q.id));
    for (const id of [...s.plan.practiceSet, ...s.plan.quick]) expect(ids.has(id)).toBe(true);
  });

  it("AT-C2: replaying the same log and content gives deep-equal state", () => {
    const a = computeState(history(), bundle(), "2026-11-22", EXAM);
    const b = computeState(buildLog([...history()].reverse()), bundle(), "2026-11-22", EXAM);
    expect(b).toEqual(a);
  });

  it("AT-C3: a revised key re-scores history across every module", () => {
    // q002 was answered B (wrong under key A). Revise the key to B.
    const before = computeState(history(), bundle(), "2026-11-22", EXAM);
    const after = computeState(history(), bundle((q) => (q.id === "q002" ? { ...q, accepted: ["B"] } : q)), "2026-11-22", EXAM);
    expect(after.skills.get("u1")!.correct).toBe(before.skills.get("u1")!.correct + 1);
    expect(after.cards.has("q:q002")).toBe(false);
    expect(before.cards.has("q:q002")).toBe(true);
  });

  it("AT-C4: deleting a question removes it from accuracy, the skill map, cards and plans", () => {
    const after = computeState(history(), bundle((q) => (q.id === "q002" ? { ...q, status: "deleted" } : q)), "2026-11-22", EXAM);
    expect(after.skills.get("u1")!.scored).toBe(11);
    expect(after.cards.has("q:q002")).toBe(false);
    expect([...after.plan.practiceSet, ...after.plan.quick]).not.toContain("q002");
  });

  it("old answers to a question that now needs a figure: nothing crashes, and it never comes back", () => {
    // q002 (wrong while sure) and q003 were answered before the bundle flagged them as needing a figure.
    const hidden = bundle((q) => (q.id === "q002" || q.id === "q003" ? { ...q, figure: true } : q));
    for (const day of ["2026-11-22", "2026-12-15", "2027-06-01"]) {
      const s = computeState(history(), hidden, day, EXAM);
      // Learning state keeps the history (cards, the open mistake) ...
      expect(s.cards.has("q:q002")).toBe(true);
      expect([...s.mistakes.values()].some((m) => m.wrongQuestionIds.includes("q002"))).toBe(true);
      // ... but no plan, review or quick list ever serves them.
      const served = [...s.plan.practiceSet, ...s.plan.review.questionIds, ...s.plan.quick];
      expect(served).not.toContain("q002");
      expect(served).not.toContain("q003");
      expect(s.plan.review.cardIds).not.toContain("q:q002");
      expect(s.plan.review.cardIds).not.toContain("q:q003");
    }
    // The other missed questions on the same concept still come back for their retest.
    expect(computeState(history(), hidden, "2026-11-22", EXAM).plan.review.questionIds).toContain("q004");
  });

  it("AT-C5: E never creates a misconception end to end", () => {
    const s = computeState(history(), bundle(), "2026-11-22", EXAM);
    const m18 = [...s.mistakes.values()].find((m) => m.wrongQuestionIds.includes("q018"))!;
    expect(m18.wrongQuestionIds).toContain("q018");
    // q018's concept (u2.t1) also holds q017 wrong + sure, so check E alone via a log with only the E answer
    seq = 0;
    const only = computeState(buildLog([ans(18, "E", "sure", "2026-11-21T04:02:00.000Z")]), bundle(), "2026-11-22", EXAM);
    expect([...only.mistakes.values()][0].misconception).toBe(false);
  });
});
