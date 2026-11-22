import { describe, expect, it } from "vitest";
import { buildLog } from "./events";
import { MARKS_PER_QUESTION, MOCK_SECONDS, mockHistory, mockReport } from "./mock";
import type { AnswerGiven, Confidence, ContentBundle, ErrorTagged, LearningEvent, Option, Question } from "./types";

// Synthetic paper, no real exam text. 10 questions:
//   t1..t4 Tamil (units ta.u1, ta.u2), g1..g3 GS (gs.u1, gs.u2), a1..a3 Aptitude (apt.u1).
//   t4 is deleted; g3 is keyed ALL. Every other key is "A".
function q(id: string, n: number, section: Question["section"], unitId: string, extra: Partial<Question> = {}): Question {
  return {
    id, n, section, unitId, topicId: `${unitId}.k_x`, accepted: ["A"], keyStatus: "final", status: "active",
    source: { exam: "syn", year: 2025, paper: "p1", qNo: n, pdfRef: "x.pdf", page: 1 },
    ...extra,
  };
}

function bundle(overrides: Record<string, Partial<Question>> = {}): ContentBundle {
  const qs: Question[] = [
    q("t1", 1, "tamil", "ccse4.ta.u1"),
    q("t2", 2, "tamil", "ccse4.ta.u1"),
    q("t3", 3, "tamil", "ccse4.ta.u2"),
    q("t4", 4, "tamil", "ccse4.ta.u2", { status: "deleted" }),
    q("g1", 5, "gs_apt", "ccse4.gs.u2"),
    q("g2", 6, "gs_apt", "ccse4.gs.u1"),
    q("g3", 7, "gs_apt", "ccse4.gs.u1", { accepted: "ALL" }),
    q("a1", 8, "gs_apt", "ccse4.apt.u1"),
    q("a2", 9, "gs_apt", "ccse4.apt.u1"),
    q("a3", 10, "gs_apt", "ccse4.apt.u1"),
  ].map((x) => ({ ...x, ...(overrides[x.id] ?? {}) }));
  return {
    version: "syn-1", builtAt: "2026-01-01T00:00:00Z",
    papers: [{ id: "p1", title: "Synthetic", date: "2025-01-01", sections: [] }],
    // Deliberately not alphabetical: byUnit must follow this order.
    units: [
      { id: "ccse4.gs.u1", nameEn: "Science", nameTa: null, questions: 2 },
      { id: "ccse4.gs.u2", nameEn: "Geography", nameTa: null, questions: 1 },
      { id: "ccse4.apt.u1", nameEn: "Aptitude", nameTa: null, questions: 3 },
      { id: "ccse4.ta.u1", nameEn: "Grammar", nameTa: null, questions: 2 },
      { id: "ccse4.ta.u2", nameEn: "Vocabulary", nameTa: null, questions: 2 },
    ],
    questions: qs,
  };
}

let seq = 0;
function ans(questionId: string, chosen: Option, confidence: Confidence, opts: Partial<AnswerGiven> = {}): AnswerGiven {
  seq++;
  return {
    type: "answer", eventId: `e${String(seq).padStart(4, "0")}`, deviceId: "d", at: "2026-03-01T10:00:00.000Z", schemaVersion: 1,
    sessionId: "m1", questionId, chosen, confidence, timeMs: 1000, mode: "mock", contentVersion: "syn-1", ...opts,
  };
}

/** A typical mock m1: 8 of 10 answered. */
function mockOne(): AnswerGiven[] {
  return [
    ans("t1", "A", "sure"), // correct, sure
    ans("t2", "B", "sure"), // wrong, sure -> misconception
    ans("t3", "E", "guess"), // E: answered, wrong, confidence none
    ans("t4", "A", "sure"), // deleted: unscored
    ans("g1", "A", "guess"), // correct, guess
    ans("g3", "E", "none"), // ALL key: correct for marks
    ans("a1", "C", "guess"), // wrong, guess
    ans("a2", "A", "none"), // correct, no idea
    // g2, a3 unanswered
  ];
}

describe("mockReport", () => {
  it("scores 1.5 per correct with no negative marks, and leaves deleted questions out of maxMarks", () => {
    const r = mockReport(mockOne(), bundle(), "m1", "p1", 3_600_000);
    expect(MARKS_PER_QUESTION).toBe(1.5);
    expect(r.total).toBe(10);
    expect(r.unscored).toBe(1);
    expect(r.maxMarks).toBe(9 * 1.5);
    expect(r.correct).toBe(4); // t1, g1, g3 (ALL), a2
    expect(r.wrong).toBe(3); // t2, t3 (E), a1
    expect(r.marks).toBe(6); // 4 * 1.5, wrong answers cost nothing
    expect(r.answered).toBe(8); // E counts as answered; the deleted t4 was answered too
    expect(r.unanswered).toBe(2);
    expect(r.submittedAt).toBe("2026-03-01T10:00:00.000Z");
    expect(r.timeUsedMs).toBe(3_600_000);
    expect(r.sessionId).toBe("m1");
    expect(r.paperId).toBe("p1");
  });

  it("caps timeUsedMs at the 3-hour limit and passes 0 through", () => {
    expect(mockReport(mockOne(), bundle(), "m1", "p1", MOCK_SECONDS * 1000 + 5).timeUsedMs).toBe(MOCK_SECONDS * 1000);
    expect(mockReport(mockOne(), bundle(), "m1", "p1", 0).timeUsedMs).toBe(0);
  });

  it("counts an ALL-keyed question correct whatever was chosen, E included", () => {
    const r = mockReport([ans("g3", "D", "sure")], bundle(), "m1", "p1", 0);
    expect(r.correct).toBe(1);
    expect(r.marks).toBe(1.5);
    expect(r.misconceptionIds).toEqual([]);
  });

  it("treats E as answered and wrong, with confidence none", () => {
    const r = mockReport([ans("t1", "E", "sure")], bundle(), "m1", "p1", 0);
    expect(r.answered).toBe(1);
    expect(r.wrong).toBe(1);
    expect(r.confidence.none).toEqual({ correct: 0, wrong: 1 });
    expect(r.confidence.sure).toEqual({ correct: 0, wrong: 0 });
    expect(r.misconceptionIds).toEqual([]);
  });

  it("uses the latest answer per question within the session", () => {
    const log = [
      ans("t1", "B", "sure", { at: "2026-03-01T10:00:00.000Z" }),
      ans("t1", "A", "guess", { at: "2026-03-01T10:05:00.000Z" }),
      ans("t2", "A", "sure", { at: "2026-03-01T10:06:00.000Z" }),
      ans("t2", "C", "sure", { at: "2026-03-01T10:01:00.000Z" }), // earlier, loses
    ];
    const r = mockReport(log, bundle(), "m1", "p1", 0);
    expect(r.answered).toBe(2);
    expect(r.correct).toBe(2);
    expect(r.wrong).toBe(0);
    expect(r.confidence.guess.correct).toBe(1);
    expect(r.confidence.sure.correct).toBe(1);
    expect(r.submittedAt).toBe("2026-03-01T10:06:00.000Z");
  });

  it("counts only this session's mock answers", () => {
    const log: LearningEvent[] = [
      ans("t1", "A", "sure"),
      ans("t2", "A", "sure", { mode: "practice" }), // same session id, not a mock answer
      ans("t3", "A", "sure", { sessionId: "m2" }), // another mock
      ans("g1", "A", "sure", { sessionId: "p9", mode: "practice" }),
      ans("t1", "B", "sure", { sessionId: "m2", at: "2026-03-02T10:00:00.000Z" }), // later, other mock: ignored
      { type: "errorTag", eventId: "x1", deviceId: "d", at: "2026-03-01T11:00:00.000Z", schemaVersion: 1, sessionId: "m1",
        answerEventId: "e0001", questionId: "t1", reason: "careless" } satisfies ErrorTagged,
    ];
    const r = mockReport(log, bundle(), "m1", "p1", 0);
    expect(r.answered).toBe(1);
    expect(r.correct).toBe(1);
    expect(r.unanswered).toBe(9);
  });

  it("splits parts into Tamil, General Studies and Aptitude, in that order", () => {
    const r = mockReport(mockOne(), bundle(), "m1", "p1", 0);
    expect(r.parts.map((p) => [p.id, p.label])).toEqual([
      ["A", "Part A: Tamil"],
      ["GS", "Part B: General Studies"],
      ["APT", "Part B: Aptitude"],
    ]);
    const [a, gs, apt] = r.parts;
    expect(a).toMatchObject({ total: 3, answered: 3, correct: 1, marks: 1.5, maxMarks: 4.5 }); // t4 deleted
    expect(gs).toMatchObject({ total: 3, answered: 2, correct: 2, marks: 3, maxMarks: 4.5 });
    expect(apt).toMatchObject({ total: 3, answered: 2, correct: 1, marks: 1.5, maxMarks: 4.5 });
    expect(r.parts.reduce((s, p) => s + p.marks, 0)).toBe(r.marks);
    expect(r.parts.reduce((s, p) => s + p.maxMarks, 0)).toBe(r.maxMarks);
  });

  it("lists units in bundle.units order with names, unknown units last", () => {
    const b = bundle({ a3: { unitId: "ccse4.zz.u9" } });
    const r = mockReport(mockOne(), b, "m1", "p1", 0);
    expect(r.byUnit.map(({ answered: _a, ...u }) => u)).toEqual([
      { unitId: "ccse4.gs.u1", name: "Science", total: 2, correct: 1 },
      { unitId: "ccse4.gs.u2", name: "Geography", total: 1, correct: 1 },
      { unitId: "ccse4.apt.u1", name: "Aptitude", total: 2, correct: 1 },
      { unitId: "ccse4.ta.u1", name: "Grammar", total: 2, correct: 1 },
      { unitId: "ccse4.ta.u2", name: "Vocabulary", total: 1, correct: 0 }, // t4 deleted
      { unitId: "ccse4.zz.u9", name: "ccse4.zz.u9", total: 1, correct: 0 },
    ]);
    // answered counts only questions with an answer in the session (review fix: unattempted is not wrong)
    for (const u of r.byUnit) expect(u.answered).toBeLessThanOrEqual(u.total);
    const unanswered = mockReport([], b, "m1", "p1", 0);
    expect(unanswered.byUnit.every((u) => u.answered === 0)).toBe(true);
  });

  it("fills the confidence table and lists misconceptions in paper order", () => {
    const log = [...mockOne(), ans("a3", "D", "sure")];
    const r = mockReport(log, bundle(), "m1", "p1", 0);
    expect(r.confidence).toEqual({
      sure: { correct: 1, wrong: 2 }, // t1 | t2, a3
      guess: { correct: 1, wrong: 1 }, // g1 | a1
      none: { correct: 1, wrong: 1 }, // a2 | t3 (E); g3 (E on an ALL key) earns marks but is no evidence (review fix)
    });
    expect(r.misconceptionIds).toEqual(["t2", "a3"]);
  });

  it("an empty session is a zero report, not an error", () => {
    const r = mockReport([], bundle(), "nope", "p1", 0);
    expect(r).toMatchObject({ answered: 0, unanswered: 10, correct: 0, wrong: 0, marks: 0, maxMarks: 13.5, submittedAt: "" });
  });

  it("replays to a deep-equal report from the same log in any order (AT-C2)", () => {
    const log = mockOne();
    const once = mockReport(buildLog(log), bundle(), "m1", "p1", 1234);
    const again = mockReport(buildLog([...log].reverse()), bundle(), "m1", "p1", 1234);
    expect(again).toEqual(once);
    expect(mockReport(log, bundle(), "m1", "p1", 1234)).toEqual(once);
  });
});

describe("mockHistory", () => {
  const older = () => mockOne().map((e) => ({ ...e, eventId: `old-${e.eventId}`, sessionId: "m-old", at: "2026-02-01T09:00:00.000Z" }));
  const newer = () => [
    ans("t2", "A", "sure", { sessionId: "m-new", at: "2026-03-05T09:00:00.000Z" }),
    ans("g1", "B", "sure", { sessionId: "m-new", at: "2026-03-05T09:00:00.000Z" }),
  ];

  it("has one entry per mock session, newest first, ignoring practice", () => {
    const log = buildLog(older(), newer(), [ans("t1", "A", "sure", { sessionId: "p1", mode: "practice", at: "2026-04-01T00:00:00.000Z" })]);
    expect(mockHistory(log, bundle())).toEqual([
      { sessionId: "m-new", submittedAt: "2026-03-05T09:00:00.000Z", answered: 2, marks: 1.5, maxMarks: 13.5 },
      { sessionId: "m-old", submittedAt: "2026-02-01T09:00:00.000Z", answered: 8, marks: 6, maxMarks: 13.5 },
    ]);
  });

  it("is empty with no mocks", () => {
    expect(mockHistory([ans("t1", "A", "sure", { mode: "practice" })], bundle())).toEqual([]);
  });

  it("matches mockReport for each entry", () => {
    const log = buildLog(older(), newer());
    for (const h of mockHistory(log, bundle())) {
      const r = mockReport(log, bundle(), h.sessionId, "p1", 0);
      expect(h).toEqual({ sessionId: r.sessionId, submittedAt: r.submittedAt, answered: r.answered, marks: r.marks, maxMarks: r.maxMarks });
    }
  });

  it("re-scores old mocks under the current key (AT-C3 spirit)", () => {
    const log = buildLog(older());
    expect(mockHistory(log, bundle())[0].marks).toBe(6);
    // Key revised: t2's answer becomes B (the old mock chose B), a1 becomes ALL, and g1 is deleted.
    const revised = bundle({ t2: { accepted: ["B"] }, a1: { accepted: "ALL" }, g1: { status: "deleted" } });
    const [h] = mockHistory(log, revised);
    // correct: t1, t2, g3, a1, a2 = 5 (g1 no longer scored); deleted t4 and g1 leave maxMarks.
    expect(h.marks).toBe(7.5);
    expect(h.maxMarks).toBe(8 * 1.5);
    const r = mockReport(log, revised, "m-old", "p1", 0);
    expect(r.misconceptionIds).toEqual([]);
    expect(r.unscored).toBe(2);
  });

  it("replays deep-equal (AT-C2)", () => {
    const a = mockHistory(buildLog(older(), newer()), bundle());
    const b = mockHistory(buildLog(newer(), older().reverse()), bundle());
    expect(b).toEqual(a);
  });
});
