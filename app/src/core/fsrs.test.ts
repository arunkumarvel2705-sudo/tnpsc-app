import { describe, expect, it } from "vitest";
import { cardStates, dueCards, gradeFor, questionCardId, reviewsFromAnswers, type CardState, type Review } from "./fsrs";
import { localDay } from "./time";
import type { AnswerGiven, Question } from "./types";

const q = (id: string, accepted: Question["accepted"], status: Question["status"] = "active"): Question => ({
  id, n: 1, section: "gs_apt", accepted, keyStatus: "final", status,
  source: { exam: "CCSE-IV", year: 2025, paper: "P", qNo: 1, pdfRef: "x.pdf", page: 1 },
});
let seq = 0;
const ans = (questionId: string, chosen: AnswerGiven["chosen"], confidence: AnswerGiven["confidence"], at: string): AnswerGiven => ({
  type: "answer", eventId: `e${String(seq++).padStart(4, "0")}`, deviceId: "phone", at, schemaVersion: 1, sessionId: "s1",
  questionId, chosen, confidence, timeMs: 1000, mode: "practice", contentVersion: "v1",
});
const rev = (cardId: string, at: string, grade: Review["grade"]): Review => ({ cardId, kind: "question", at, grade });

describe("gradeFor", () => {
  it("maps every outcome/confidence pair", () => {
    expect(gradeFor("wrong", "sure")).toBe(1);
    expect(gradeFor("wrong", "guess")).toBe(1);
    expect(gradeFor("wrong", "none")).toBe(1);
    expect(gradeFor("correct", "sure")).toBe(3);
    expect(gradeFor("correct", "guess")).toBe(2);
    expect(gradeFor("correct", "none")).toBe(2);
  });
});

describe("reviewsFromAnswers", () => {
  const qs = new Map([["a", q("a", ["A"])], ["b", q("b", ["B"])], ["d", q("d", ["D"], "deleted")]]);

  it("creates no card until the first scored wrong answer", () => {
    expect(reviewsFromAnswers([ans("a", "A", "sure", "2026-11-01T10:00:00Z"), ans("a", "A", "guess", "2026-11-02T10:00:00Z")], qs)).toEqual([]);
  });

  it("ignores earlier correct answers; the miss and every later answer are reviews", () => {
    const events = [
      ans("a", "A", "sure", "2026-11-01T10:00:00Z"), // before the card: ignored
      ans("a", "C", "sure", "2026-11-02T10:00:00Z"), // card born: Again
      ans("a", "A", "guess", "2026-11-03T10:00:00Z"), // Hard
      ans("a", "A", "sure", "2026-11-05T10:00:00Z"), // Good
      ans("a", "E", "none", "2026-11-09T10:00:00Z"), // Again
    ];
    // input order does not matter: answers are sorted by time first
    expect(reviewsFromAnswers([...events].reverse(), qs)).toEqual([
      rev("q:a", "2026-11-02T10:00:00Z", 1),
      rev("q:a", "2026-11-03T10:00:00Z", 2),
      rev("q:a", "2026-11-05T10:00:00Z", 3),
      rev("q:a", "2026-11-09T10:00:00Z", 1),
    ]);
  });

  it("ignores deleted questions and unknown question ids", () => {
    const events = [ans("d", "A", "sure", "2026-11-01T10:00:00Z"), ans("zz", "A", "sure", "2026-11-01T10:00:00Z")];
    expect(reviewsFromAnswers(events, qs)).toEqual([]);
  });

  it("keeps cards of different questions apart", () => {
    const events = [ans("a", "B", "sure", "2026-11-01T10:00:00Z"), ans("b", "A", "guess", "2026-11-01T11:00:00Z"), ans("b", "B", "sure", "2026-11-02T11:00:00Z")];
    expect(reviewsFromAnswers(events, qs)).toEqual([
      rev("q:a", "2026-11-01T10:00:00Z", 1),
      rev("q:b", "2026-11-01T11:00:00Z", 1),
      rev("q:b", "2026-11-02T11:00:00Z", 3),
    ]);
  });

  it("AT-C3 spirit: a key change (B -> C) re-grades the whole history", () => {
    const events = [
      ans("x", "C", "sure", "2026-11-01T10:00:00Z"),
      ans("x", "B", "sure", "2026-11-02T10:00:00Z"),
      ans("x", "C", "guess", "2026-11-03T10:00:00Z"),
    ];
    const underB = reviewsFromAnswers(events, new Map([["x", q("x", ["B"])]]));
    expect(underB.map((r) => [r.at, r.grade])).toEqual([
      ["2026-11-01T10:00:00Z", 1],
      ["2026-11-02T10:00:00Z", 3],
      ["2026-11-03T10:00:00Z", 1],
    ]);
    const underC = reviewsFromAnswers(events, new Map([["x", q("x", ["C"])]]));
    // the first answer is now correct, so the card is born at the B answer
    expect(underC.map((r) => [r.at, r.grade])).toEqual([
      ["2026-11-02T10:00:00Z", 1],
      ["2026-11-03T10:00:00Z", 2],
    ]);
    expect(cardStates(underC).get("q:x")!.reps).toBe(2);
  });
});

describe("cardStates", () => {
  const reviews = [
    rev("q:a", "2026-11-01T10:00:00Z", 1),
    rev("q:a", "2026-11-02T10:00:00Z", 3),
    rev("q:b", "2026-11-01T10:00:00Z", 1),
    rev("q:c", "2026-11-03T18:29:30Z", 1),
    rev("q:b", "2026-11-04T09:00:00Z", 2),
    rev("q:a", "2026-11-08T10:00:00Z", 3),
  ];

  it("AT-C2: same input and shuffled input give deep-equal maps", () => {
    const first = cardStates(reviews);
    expect(cardStates(reviews)).toEqual(first);
    const shuffled = [reviews[4], reviews[0], reviews[5], reviews[2], reviews[3], reviews[1]];
    expect(cardStates(shuffled)).toEqual(first);
    expect(cardStates([...reviews].reverse())).toEqual(first);
    expect([...cardStates(shuffled).keys()]).toEqual(["q:a", "q:b", "q:c"]);
  });

  it("does not mutate its input", () => {
    const copy = reviews.map((r) => ({ ...r }));
    cardStates(copy);
    expect(copy).toEqual(reviews);
  });

  it("wrong then correct-sure pushes the due date later than wrong only", () => {
    const wrongOnly = cardStates([rev("q:a", "2026-11-01T10:00:00Z", 1)]).get("q:a")!;
    const thenGood = cardStates([rev("q:a", "2026-11-01T10:00:00Z", 1), rev("q:a", "2026-11-01T10:20:00Z", 3)]).get("q:a")!;
    expect(thenGood.due > wrongOnly.due).toBe(true);
    expect(wrongOnly.reps).toBe(1);
    expect(thenGood.reps).toBe(2);
    expect(thenGood.lastReviewAt).toBe("2026-11-01T10:20:00Z");
  });

  it("reports ISO due, its IST dueDay and the counters", () => {
    const s = cardStates(reviews);
    for (const st of s.values()) {
      expect(new Date(st.due).toISOString()).toBe(st.due);
      expect(st.dueDay).toBe(localDay(st.due));
      expect(st.kind).toBe("question");
      expect(st.stability).toBeGreaterThan(0);
      expect(st.difficulty).toBeGreaterThan(0);
    }
    expect(s.get("q:a")!.reps).toBe(3);
    expect(s.get("q:a")!.lastReviewAt).toBe("2026-11-08T10:00:00Z");
    // a miss at 23:59:30 IST is due again after the 1-minute learning step, which is the next IST day
    const c = s.get("q:c")!;
    expect(c.due).toBe("2026-11-03T18:30:30.000Z");
    expect(c.dueDay).toBe("2026-11-04");
  });

  it("returns an empty map for no reviews", () => {
    expect(cardStates([]).size).toBe(0);
  });
});

describe("dueCards", () => {
  const st = (cardId: string, due: string): CardState => ({
    cardId, kind: "question", due, dueDay: localDay(due), stability: 1, difficulty: 5, reps: 1, lapses: 0, lastReviewAt: "2026-11-01T00:00:00Z",
  });

  it("keeps cards due today or earlier, most overdue first, ties by due then cardId", () => {
    const states = new Map(
      [
        st("q:late", "2026-11-25T03:00:00Z"), // future: excluded
        st("q:today2", "2026-11-21T12:00:00Z"),
        st("q:today1", "2026-11-21T01:00:00Z"),
        st("q:old", "2026-11-10T08:00:00Z"),
        st("q:tieB", "2026-11-15T08:00:00Z"),
        st("q:tieA", "2026-11-15T08:00:00Z"),
        st("q:edge", "2026-11-21T18:30:00Z"), // 00:00 IST on 22 Nov: tomorrow
      ].map((s) => [s.cardId, s]),
    );
    expect(dueCards(states, "2026-11-21").map((s) => s.cardId)).toEqual(["q:old", "q:tieA", "q:tieB", "q:today1", "q:today2"]);
  });

  it("returns nothing when nothing is due", () => {
    expect(dueCards(new Map([["q:a", st("q:a", "2026-12-01T00:00:00Z")]]), "2026-11-21")).toEqual([]);
  });

  it("works end to end from answers", () => {
    const qs = new Map([["a", q("a", ["A"])]]);
    const states = cardStates(reviewsFromAnswers([ans("a", "B", "sure", "2026-11-01T10:00:00Z")], qs));
    expect(questionCardId("a")).toBe("q:a");
    expect(dueCards(states, "2026-10-31")).toEqual([]);
    expect(dueCards(states, "2026-11-01").map((s) => s.cardId)).toEqual(["q:a"]);
  });
});
