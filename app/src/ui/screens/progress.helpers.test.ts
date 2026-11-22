import { describe, expect, it } from "vitest";
import type { MistakeState } from "../../core/mistakes";
import type { SkillState } from "../../core/skillmap";
import type { ContentBundle, Question } from "../../core/types";
import {
  fixedLine, groupUnits, mistakeName, mistakeStatus, partOf, practiseIds, readableSegment, relativeDay,
  shortDay, skillNumbers, snippet, streakDays, TRANSFER_NOTE,
} from "./progress.helpers";

const mistake = (over: Partial<MistakeState> = {}): MistakeState => ({
  conceptId: "ccse4.ta.u4.k_terms", topicId: "ccse4.ta.u4.k_terms", unitId: "ccse4.ta.u4", stage: "logged",
  misconception: false, streak: 0, streakStartDay: null, transferDone: false, wrongQuestionIds: ["q1"], sureWrongQuestionIds: [], transferPossible: true,
  loggedDay: "2026-11-21", retestDay: "2026-11-22", lastWrongAt: "2026-11-21T05:00:00Z", lastWrongEventId: "e1",
  reason: null, fixedAt: null, episodes: 1, ...over,
});

const question = (id: string, over: Partial<Question> = {}): Question => ({
  id, n: Number(id.replace(/\D/g, "")), section: "tamil", accepted: ["A"], keyStatus: "final", status: "active",
  source: { exam: "CCSE-IV", year: 2025, paper: "P", qNo: 1, pdfRef: "x.pdf", page: 1 }, ...over,
});

const skill = (over: Partial<SkillState> = {}): SkillState => ({
  unitId: "u", box: "shaky", scored: 12, correct: 6, accuracy: 0.5, sureShare: 4 / 6, unresolvedMisconceptions: 0,
  weakness: 0.5, evidence: "", ...over,
});

describe("dates", () => {
  it("formats a day as weekday, date, month", () => {
    expect(shortDay("2026-11-24")).toBe("Tue 24 Nov");
    expect(shortDay("2027-01-01")).toBe("Fri 1 Jan");
  });
  it("says today for due or past days, tomorrow for the next day, else the date", () => {
    expect(relativeDay("2026-11-21", "2026-11-21")).toBe("today");
    expect(relativeDay("2026-11-18", "2026-11-21")).toBe("today");
    expect(relativeDay("2026-11-22", "2026-11-21")).toBe("tomorrow");
    expect(relativeDay("2026-11-24", "2026-11-21")).toBe("Tue 24 Nov");
    expect(relativeDay("2026-12-01", "2026-11-30")).toBe("tomorrow");
  });
});

describe("mistakeStatus", () => {
  it("logged: retest day", () => {
    expect(mistakeStatus(mistake({ retestDay: "2026-11-24" }), "2026-11-21").main).toBe("Retest from Tue 24 Nov");
    expect(mistakeStatus(mistake({ retestDay: "2026-11-20" }), "2026-11-21").main).toBe("Retest from today");
  });
  it("spaced: streak and days from the state, days capped at 14", () => {
    const m = mistake({ stage: "spaced", streak: 2, streakStartDay: "2026-11-16" });
    expect(mistakeStatus(m, "2026-11-21")).toEqual({ main: "2 of 3 sure answers · 5 of 14 days", parts: ["2 of 3 sure answers", "5 of 14 days"], streak: 2, days: 5, needsTransfer: false });
    expect(streakDays(mistake({ stage: "spaced", streak: 2, streakStartDay: "2026-10-01" }), "2026-11-21")).toBe(14);
    expect(streakDays(mistake({ streakStartDay: null }), "2026-11-21")).toBe(0);
  });
  it("misconception without a transfer answer needs a different question", () => {
    const m = mistake({ stage: "spaced", streak: 1, streakStartDay: "2026-11-21", misconception: true });
    expect(mistakeStatus(m, "2026-11-21").needsTransfer).toBe(true);
    expect(mistakeStatus({ ...m, transferDone: true }, "2026-11-21").needsTransfer).toBe(false);
    expect(TRANSFER_NOTE).toBe("needs one different question on this topic");
  });
  it("fixed: the IST day it was fixed", () => {
    expect(mistakeStatus(mistake({ stage: "fixed", fixedAt: "2026-11-09T20:00:00Z" }), "2026-11-21").main).toBe("Fixed on Tue 10 Nov");
  });
});

describe("skill map", () => {
  it("groups units by part in a fixed order", () => {
    const units = [
      { id: "ccse4.gs.u1", nameEn: "Science", nameTa: null, questions: 5 },
      { id: "ccse4.apt.u1", nameEn: "Aptitude", nameTa: null, questions: 15 },
      { id: "ccse4.ta.u1", nameEn: "Grammar", nameTa: null, questions: 25 },
      { id: "ccse4.ta.u2", nameEn: "Vocabulary", nameTa: null, questions: 15 },
      { id: "x.u1", nameEn: "Misc", nameTa: null, questions: 1 },
    ];
    expect(groupUnits(units).map((g) => [g.part, g.weight, g.units.length])).toEqual([
      ["Tamil", 40, 2], ["General Studies", 5, 1], ["Aptitude", 15, 1], ["Other", 1, 1],
    ]);
    expect(partOf("ccse4.apt.u2")).toBe("Aptitude");
  });
  it("spells out the numbers behind a box", () => {
    expect(skillNumbers(skill())).toBe("12 answered · 50% correct · 4 of 6 right answers were sure");
    expect(skillNumbers(skill({ scored: 0, correct: 0, accuracy: 0, sureShare: 1 }))).toBe("Not answered yet");
    expect(skillNumbers(skill({ scored: 3, correct: 1, accuracy: 1 / 3, sureShare: 1, unresolvedMisconceptions: 2 })))
      .toBe("3 answered · 33% correct · 1 of 1 right answer was sure · 2 sure but wrong");
  });
});

describe("names and snippets", () => {
  const bundle = {
    units: [{ id: "ccse4.ta.u4", nameEn: "Technical terms", nameTa: null, questions: 10 }],
    questions: [], papers: [], version: "v", builtAt: "",
  } as ContentBundle;
  const qs = new Map([["q150", question("q150", { section: "gs_apt" })]]);
  it("uses the topic name when the bundle has one, else unit + readable topic", () => {
    expect(readableSegment("ccse4.ta.u4.k_terms")).toBe("K terms");
    expect(mistakeName(mistake(), bundle, qs)).toBe("Technical terms: K terms");
    const withTopics = { ...bundle, topics: [{ id: "ccse4.ta.u4.k_terms", unitId: "ccse4.ta.u4", nameEn: "Key terms", nameTa: null }] };
    expect(mistakeName(mistake(), withTopics, qs)).toBe("Key terms");
    expect(mistakeName(mistake({ conceptId: "q150", topicId: null, unitId: null, wrongQuestionIds: ["q150"] }), bundle, qs)).toBe("Question 150");
  });
  it("shows Tamil text for Tamil questions and trims long stems", () => {
    const ta = question("q1", { ta: { stem: "பிழையான தொடரைக் கண்டறிக.", options: {} as never }, en: { stem: "Find the wrong one", options: {} as never } });
    expect(snippet(ta)).toBe("பிழையான தொடரைக் கண்டறிக.");
    const en = question("q2", { section: "gs_apt", en: { stem: "word ".repeat(40), options: {} as never } });
    expect(snippet(en, 20)).toBe("word word word word…");
  });
});

describe("practiseIds", () => {
  const qs = [
    question("q1", { topicId: "t" }), question("q2", { topicId: "t" }), question("q3", { topicId: "t", status: "deleted" }),
    question("q4", { topicId: "t" }), question("q5", { topicId: "t" }), question("q6", { topicId: "t" }), question("q7", { topicId: "other" }),
  ];
  it("is the missed questions for an ordinary mistake", () => {
    expect(practiseIds(mistake({ conceptId: "t", wrongQuestionIds: ["q1", "q2"] }), qs)).toEqual(["q1", "q2"]);
  });
  it("adds up to 3 other active same-concept questions when a misconception needs a transfer", () => {
    const m = mistake({ conceptId: "t", wrongQuestionIds: ["q1", "q2"], misconception: true });
    expect(practiseIds(m, qs)).toEqual(["q1", "q2", "q4", "q5", "q6"]);
    expect(practiseIds({ ...m, transferDone: true }, qs)).toEqual(["q1", "q2"]);
  });
});

describe("fixedLine", () => {
  it("counts calmly", () => {
    expect(fixedLine(3)).toBe("3 mistakes fixed for good");
    expect(fixedLine(1)).toBe("1 mistake fixed for good");
    expect(fixedLine(0)).toMatch(/^Nothing fixed yet/);
  });
});
