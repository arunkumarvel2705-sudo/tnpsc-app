import { describe, expect, it } from "vitest";
import type { AnswerGiven, ContentBundle, Question, Reading } from "../../core/types";
import { askedText, readingText, readingsFor, syllabusRows, topicPractiseIds } from "./syllabus.helpers";

// Invented placeholder questions only.
const q = (id: string, paperId: string, year: number, n: number, section: Question["section"], topicId: string, extra: Partial<Question> = {}): Question => ({
  id, paperId, n, section, accepted: ["A"], keyStatus: "final", status: "active", unitId: topicId.split(".").slice(0, 2).join("."), topicId, ...extra,
  source: { exam: "CCSE-IV", year, paper: paperId, qNo: n, pdfRef: "x.pdf", page: 1 },
});
const bundle: ContentBundle = {
  version: "t", builtAt: "t",
  papers: [
    { id: "p2", title: "2024", date: "2024-01-01", sections: [], rankingExcludedSections: ["tamil"] },
    { id: "p1", title: "2023", date: "2023-01-01", sections: [] },
  ],
  units: [{ id: "gs.u1", nameEn: "Science", nameTa: null, questions: 5 }, { id: "ta.u1", nameEn: "Grammar", nameTa: "இலக்கணம்", questions: 25 }],
  topics: [
    { id: "gs.u1.x", unitId: "gs.u1", nameEn: "Physics", nameTa: null },
    { id: "gs.u1.y", unitId: "gs.u1", nameEn: "Biology", nameTa: null },
    { id: "gs.u1.z", unitId: "gs.u1", nameEn: "Untouched", nameTa: null },
    { id: "ta.u1.a", unitId: "ta.u1", nameEn: "Sandhi", nameTa: "புணர்ச்சி" },
  ],
  questions: [
    q("p1_q101", "p1", 2023, 101, "gs_apt", "gs.u1.x"),
    q("p2_q101", "p2", 2024, 101, "gs_apt", "gs.u1.x"),
    q("p2_q102", "p2", 2024, 102, "gs_apt", "gs.u1.y"),
    q("p2_q103", "p2", 2024, 103, "gs_apt", "gs.u1.y", { figure: true }),
    q("p2_q001", "p2", 2024, 1, "tamil", "ta.u1.a"),
  ],
};
const ans = (questionId: string, chosen: AnswerGiven["chosen"], eventId: string): AnswerGiven => ({
  type: "answer", eventId, deviceId: "d", at: "2026-11-27T10:00:00.000Z", schemaVersion: 1, sessionId: "s", questionId, chosen,
  confidence: "sure", timeMs: 1, mode: "practice", contentVersion: "t",
});

describe("syllabusRows", () => {
  const rows = syllabusRows(bundle, [ans("p1_q101", "B", "1"), ans("p1_q101", "A", "2"), ans("p2_q102", "C", "3")], "CCSE-IV");
  it("lists every unit and topic, most asked first, with servable questions newest paper first", () => {
    expect(rows.map((u) => u.unitId)).toEqual(["gs.u1", "ta.u1"]);
    const gs = rows[0];
    expect(gs.topics.map((t) => t.topicId)).toEqual(["gs.u1.x", "gs.u1.y", "gs.u1.z"]);
    expect(gs.topics[0].questionIds).toEqual(["p2_q101", "p1_q101"]);
    expect(gs.topics[1].questionIds).toEqual(["p2_q102"]); // the figure question is hidden
    expect(gs.questionCount).toBe(3);
  });
  it("counts answered questions and whether the latest answer was right", () => {
    expect(rows[0].topics[0]).toMatchObject({ answered: 1, correct: 1, papersAsked: 2, papersTotal: 2 });
    expect(rows[0].topics[1]).toMatchObject({ answered: 1, correct: 0 });
  });
  it("describes how often a topic is asked, old-pattern sections apart", () => {
    expect(askedText(rows[0].topics[0])).toBe("asked in 2 of 2 papers");
    expect(askedText(rows[1].topics[0])).toBe("not asked in the last 1 paper"); // 2024 Tamil is old-pattern
    expect(askedText(rows[0].topics[2])).toBe("no past questions yet");
  });
});

describe("topicPractiseIds", () => {
  it("puts unanswered questions first and caps the session", () => {
    const row = { topicId: "t", nameEn: "t", nameTa: null, questionIds: ["a", "b", "c"], papersAsked: 1, papersTotal: 1, answered: 1, correct: 1 };
    expect(topicPractiseIds(row, new Set(["a"]))).toEqual(["b", "c", "a"]);
    expect(topicPractiseIds(row, new Set(), 2)).toEqual(["a", "b"]);
  });
});

describe("readingsFor", () => {
  // Invented placeholder units only.
  const r = (label: string, medium: "english" | "tamil", pageStart: number, topicIds = ["t1"]): Reading =>
    ({ topicIds, label, medium, title: "Unit", pdfRef: "x.pdf", pageStart, pageEnd: pageStart + 9 });
  const b = { readings: [r("Class 9 Science", "tamil", 5), r("Class 9 Science", "english", 30), r("Class 6 Science", "english", 50),
    r("Class 7 Science", "english", 5, ["t2"])] } as unknown as ContentBundle;
  it("lists English medium first, then by class and page", () => {
    expect(readingsFor(b, "t1").map((x) => `${x.label}/${x.medium}`)).toEqual(["Class 6 Science/english", "Class 9 Science/english", "Class 9 Science/tamil"]);
    expect(readingsFor(b, "none")).toEqual([]);
    expect(readingsFor({} as ContentBundle, "t1")).toEqual([]);
  });
  it("describes a reading", () => {
    expect(readingText(r("Class 9 Science", "english", 18))).toBe("Class 9 Science · Unit · PDF pages 18–27");
  });
});
