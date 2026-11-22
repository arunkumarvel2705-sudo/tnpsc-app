import { describe, expect, it } from "vitest";
import { mockReport, type MockReport } from "../../core/mock";
import type { AnswerGiven, ContentBundle, Option, Question } from "../../core/types";
import { confidenceLine, hmm, marksText, unattemptedUnits, unitRows, wrongIds } from "./mockreport.helpers";

function q(id: string, n: number, unitId: string, extra: Partial<Question> = {}): Question {
  return {
    id, n, section: unitId.includes(".ta.") ? "tamil" : "gs_apt", unitId, accepted: ["A"], keyStatus: "final", status: "active",
    paperId: "p1", source: { exam: "syn", year: 2025, paper: "p1", qNo: n, pdfRef: "x.pdf", page: 1 }, ...extra,
  };
}
const bundle: ContentBundle = {
  version: "v", builtAt: "2026-01-01T00:00:00Z", papers: [{ id: "p1", title: "S", date: "2025-01-01", sections: [] }],
  units: [
    { id: "ccse4.ta.u1", nameEn: "Grammar", nameTa: null, questions: 2 },
    { id: "ccse4.gs.u1", nameEn: "Science", nameTa: null, questions: 3 },
  ],
  questions: [
    q("t1", 1, "ccse4.ta.u1"), q("t2", 2, "ccse4.ta.u1"),
    q("g1", 3, "ccse4.gs.u1"), q("g2", 4, "ccse4.gs.u1", { accepted: "ALL" }), q("g3", 5, "ccse4.gs.u1", { status: "deleted" }),
  ],
};
let n = 0;
const ans = (questionId: string, chosen: Option, extra: Partial<AnswerGiven> = {}): AnswerGiven => ({
  type: "answer", eventId: `e${++n}`, deviceId: "d", at: "2026-03-01T10:00:00.000Z", schemaVersion: 1, sessionId: "m1",
  questionId, chosen, confidence: "sure", timeMs: 1, mode: "mock", contentVersion: "v", ...extra,
});

describe("wrongIds", () => {
  it("lists wrong answers of this mock only, E included, ALL and deleted excluded, in paper order", () => {
    const log = [
      ans("g1", "E"), ans("t2", "B"), ans("t1", "A"), ans("g2", "C"), ans("g3", "B"),
      ans("t1", "C", { mode: "practice" }), ans("t1", "C", { sessionId: "m2" }),
    ];
    expect(wrongIds(log, bundle, "m1", "p1")).toEqual(["t2", "g1"]);
  });
  it("agrees with the report's wrong count", () => {
    const log = [ans("g1", "E"), ans("t2", "B"), ans("t1", "A"), ans("g2", "C")];
    expect(wrongIds(log, bundle, "m1", "p1").length).toBe(mockReport(log, bundle, "m1", "p1", 0).wrong);
  });
});

describe("format", () => {
  it("marks keep a half only when there is one", () => {
    expect(marksText(187.5)).toBe("187.5");
    expect(marksText(186)).toBe("186");
    expect(marksText(0)).toBe("0");
  });
  it("time as h:mm", () => {
    expect(hmm(0)).toBe("0:00");
    expect(hmm(2 * 3600000 + 7 * 60000 + 59000)).toBe("2:07");
    expect(hmm(3 * 3600000)).toBe("3:00");
  });
});

const report = (over: Partial<MockReport>): MockReport => ({
  ...mockReport([], bundle, "m1", "p1", 0), ...over,
});

describe("unitRows", () => {
  it("ranks attempted units by share right of what was answered; unattempted units are listed apart (review fix)", () => {
    const r = report({
      byUnit: [
        { unitId: "a", name: "A", total: 4, answered: 4, correct: 3 },
        { unitId: "b", name: "B", total: 2, answered: 2, correct: 1 },
        { unitId: "c", name: "C", total: 4, answered: 4, correct: 2 },
        { unitId: "d", name: "D", total: 0, answered: 0, correct: 0 },
        { unitId: "e", name: "E", total: 3, answered: 3, correct: 0 },
        { unitId: "f", name: "F", total: 22, answered: 0, correct: 0 },
        { unitId: "g", name: "G", total: 10, answered: 2, correct: 2 },
      ],
    });
    const rows = unitRows(r);
    expect(rows.map((u) => u.unitId)).toEqual(["e", "c", "b", "a", "g"]); // g: 2 of 2 answered right, not 2/10
    expect(rows[0]).toEqual({ unitId: "e", name: "E", total: 3, answered: 3, correct: 0, pct: 0, weak: true });
    expect(rows.find((u) => u.unitId === "c")?.weak).toBe(false); // exactly half is not weak
    expect(unattemptedUnits(r)).toEqual([{ unitId: "f", name: "F", total: 22 }]);
  });
});

describe("confidenceLine", () => {
  const conf = (sw: number, gc: number, other = 0): MockReport["confidence"] => ({
    sure: { correct: other, wrong: sw }, guess: { correct: gc, wrong: 0 }, none: { correct: 0, wrong: 0 },
  });
  it("names wrong-while-sure as misconceptions", () => {
    expect(confidenceLine(report({ confidence: conf(12, 3) }))).toBe(
      "12 wrong while sure: these are misconceptions, added to your mistake list when you submitted.",
    );
    expect(confidenceLine(report({ confidence: conf(1, 0) }))).toMatch(/^1 wrong while sure: that is a misconception/);
  });
  it("otherwise points at lucky guesses, or says sure meant right", () => {
    expect(confidenceLine(report({ confidence: conf(0, 2) }))).toMatch(/2 right answers were guesses/);
    expect(confidenceLine(report({ confidence: conf(0, 0, 5) }))).toMatch(/when you felt sure, you were right/);
    expect(confidenceLine(report({ confidence: conf(0, 0) }))).toBe("No answers to read yet.");
  });
});
