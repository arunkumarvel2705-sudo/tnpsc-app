import { describe, expect, it } from "vitest";
import type { TopicInfo } from "../../core/content";
import type { DailyPlan, FocusPick } from "../../core/planner";
import type { SkillState } from "../../core/skillmap";
import type { AnswerGiven, ContentBundle, ErrorTagged } from "../../core/types";
import {
  answeredOn, focusLine, pathExamOf, pathLabel, plannedTotal, quickMinutes, readableId, ringFraction,
  sessionTitle, topicName, unitName, weaknessShort, weekDays, whyFactors,
} from "./today.helpers";

const bundle: ContentBundle = {
  version: "t", builtAt: "t", papers: [], questions: [],
  units: [{ id: "ccse4.ta.u4", nameEn: "Technical terms", nameTa: null, questions: 10 }],
};
const topic: TopicInfo = { topicId: "ccse4.ta.u4.k_terms", unitId: "ccse4.ta.u4", nameEn: "ccse4.ta.u4.k_terms", nameTa: null, papersAsked: 1, papersTotal: 1, exams: ["CCSE-IV"] };

const pick = (over: Partial<FocusPick> = {}): FocusPick => ({
  topicId: topic.topicId, unitId: topic.unitId, box: "insufficient", weakness: 0.6, frequency: 1, relevance: 1, score: 0.6,
  why: "Not diagnosed yet: Not enough data: 0 of 10 answers · asked in 1 of 1 papers · on your CCSE-IV path", ...over,
});
const skill = (over: Partial<SkillState> = {}): SkillState => ({
  unitId: topic.unitId, box: "weak", scored: 10, correct: 5, accuracy: 0.5, sureShare: 0.6, unresolvedMisconceptions: 0, weakness: 0.75,
  evidence: "5 of 10 correct (50%)", ...over,
});
const plan = (over: Partial<DailyPlan> = {}): DailyPlan => ({
  date: "2026-11-21", focus: pick(), mode: "diagnostic", practiceSet: ["a", "b", "c"], olderTopicQuestionIds: [],
  review: { retestConceptIds: ["x"], cardIds: ["q:a", "q:b"], questionIds: ["x1", "a", "b"], estMinutes: 2 }, quick: ["a"], ...over,
});
const ans = (at: string, id = "q"): AnswerGiven => ({
  type: "answer", eventId: `${id}-${at}`, deviceId: "d", at, schemaVersion: 1, sessionId: "s", questionId: id, chosen: "A",
  confidence: "sure", timeMs: 1, mode: "practice", contentVersion: "t",
});

describe("names", () => {
  it("labels the path", () => {
    expect(pathLabel("CCSE-IV")).toBe("Group 4");
    expect(pathLabel("CCSE-II")).toBe("CCSE-II");
  });
  it("makes topic ids readable", () => {
    expect(readableId("ccse4.ta.u4.k_terms")).toBe("K terms");
    expect(readableId("ccse4.ta.u1.e_sandhi")).toBe("E sandhi");
  });
  it("uses bundle topic names when present, else unit + readable id", () => {
    expect(topicName(bundle, topic.topicId, topic.unitId)).toBe("Technical terms · K terms");
    const named = { ...bundle, topics: [{ id: topic.topicId, unitId: topic.unitId, nameEn: "Kalaich sorkal", nameTa: null }] };
    expect(topicName(named, topic.topicId, topic.unitId)).toBe("Kalaich sorkal");
    expect(unitName(bundle, "ccse4.gs.u9")).toBe("U9");
  });
  it("titles the session by mode", () => {
    expect(sessionTitle(plan(), bundle)).toBe("Diagnostic: Technical terms");
    expect(sessionTitle(plan({ mode: "practice" }), bundle)).toBe("Focus: Technical terms · K terms");
    expect(sessionTitle(plan({ focus: null }), bundle)).toBeNull();
  });
});

describe("focus one-liner", () => {
  it("never shows the raw planner why", () => {
    const line = focusLine(pick(), skill({ box: "insufficient", scored: 0, correct: 0 }), topic);
    expect(line).toBe("Not diagnosed yet · asked in 1 of 1 papers · on your Group 4 path");
    expect(line).not.toContain("CCSE-IV");
    expect(line).not.toContain("Not enough data");
  });
  it("shows weak evidence for many papers", () => {
    const t = { ...topic, papersAsked: 9, papersTotal: 10 };
    expect(focusLine(pick({ box: "weak", weakness: 0.75, frequency: 0.9 }), skill(), t))
      .toBe("Weak: 5 of 10 correct · asked in 9 of 10 papers · on your Group 4 path");
  });
  it("names misconceptions", () => {
    expect(weaknessShort("misconception", skill({ box: "misconception", unresolvedMisconceptions: 2 })))
      .toBe("Misconception: 2 sure-but-wrong answers to fix");
    expect(weaknessShort("shaky", skill({ box: "shaky", correct: 7 }))).toBe("Shaky: 7 of 10 correct");
  });
  it("finds the path exam without the why text", () => {
    expect(pathExamOf(pick({ why: "" }), topic)).toBe("CCSE-IV");
    expect(pathExamOf(pick({ why: "" }), undefined)).toBeNull();
    expect(focusLine(pick({ why: "" }), undefined, undefined)).toBe("Not diagnosed yet · asked in 100% of papers · on your exam path");
  });
});

describe("why this", () => {
  it("lists weakness, frequency and path with the score", () => {
    const { factors, score } = whyFactors(pick(), skill({ box: "insufficient", scored: 3, correct: 2 }), topic, "Technical terms");
    expect(factors.map((f) => f.key)).toEqual(["weakness", "frequency", "path"]);
    expect(factors[0]).toMatchObject({ title: "Not diagnosed yet", detail: "Technical terms: 3 of 10 answers so far. A short check places it.", value: "0.60", tone: "plain" });
    expect(factors[1].detail).toBe("Asked in 1 of 1 papers.");
    expect(factors[2].detail).toBe("On your Group 4 path.");
    expect(score).toBe("Priority 0.60 = 0.60 × 1.00 × 1. Highest of all topics today.");
  });
  it("uses the skill evidence and calm colours", () => {
    const { factors } = whyFactors(pick({ box: "weak", weakness: 0.75 }), skill(), topic, "Technical terms");
    expect(factors[0]).toMatchObject({ title: "Weak", detail: "Technical terms: 5 of 10 correct (50%).", tone: "miss" });
    const m = whyFactors(pick({ box: "misconception", weakness: 1 }), skill({ box: "misconception", evidence: "2 sure-but-wrong answers not fixed yet" }), topic, "U");
    expect(m.factors[0].tone).toBe("bad");
  });
});

describe("counts", () => {
  it("counts only answers on today's IST day", () => {
    const tag: ErrorTagged = { type: "errorTag", eventId: "t", deviceId: "d", at: "2026-11-21T05:00:00Z", schemaVersion: 1, sessionId: "s", answerEventId: "x", questionId: "q", reason: "concept" };
    const log = [
      ans("2026-11-20T18:29:00Z"), // 23:59 IST on the 20th
      ans("2026-11-20T18:31:00Z"), // 00:01 IST on the 21st
      ans("2026-11-21T18:00:00Z"), // 23:30 IST on the 21st
      ans("2026-11-21T18:31:00Z"), // the 22nd
      tag,
    ];
    expect(answeredOn(log, "2026-11-21")).toBe(2);
  });
  it("totals the plan and fills the ring", () => {
    expect(plannedTotal(plan())).toBe(6);
    expect(ringFraction(3, 6)).toBe(0.5);
    expect(ringFraction(9, 6)).toBe(1);
    expect(ringFraction(0, 0)).toBe(0);
    expect(ringFraction(2, 0)).toBe(1);
  });
  it("estimates quick minutes at the review pace", () => {
    expect(quickMinutes(0)).toBe(0);
    expect(quickMinutes(1)).toBe(1);
    expect(quickMinutes(5)).toBe(3);
  });
});

describe("week", () => {
  it("runs Monday to Sunday of the IST week", () => {
    // 2026-11-21 is a Saturday.
    const w = weekDays("2026-11-21", [ans("2026-11-16T04:00:00Z"), ans("2026-11-19T19:00:00Z"), ans("2026-11-15T10:00:00Z")]);
    expect(w.map((d) => d.day)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(w.map((d) => d.label).join("")).toBe("MTWTFSS");
    expect(w.filter((d) => d.active).map((d) => d.day)).toEqual(["2026-11-16", "2026-11-20"]); // 19:00Z on the 19th is the 20th in IST
    expect(w.find((d) => d.isToday)?.day).toBe("2026-11-21");
    expect(w.filter((d) => d.future).map((d) => d.day)).toEqual(["2026-11-22"]);
  });
  it("handles a Sunday and a Monday", () => {
    expect(weekDays("2026-11-22", [])[0].day).toBe("2026-11-16");
    expect(weekDays("2026-11-23", [])[0].day).toBe("2026-11-23");
  });
});
