import { describe, expect, it } from "vitest";
import { applyTagReviews, tagReviewQueue, tagReviews } from "./content";
import { validateEvent } from "./events";
import type { ContentBundle, LearningEvent, Question, TagReviewed } from "./types";

// Invented placeholder questions only.
const q = (id: string, paperId: string, n: number, section: Question["section"], topicId: string, tagConfidence?: number, extra: Partial<Question> = {}): Question => ({
  id, paperId, n, section, accepted: ["A"], keyStatus: "final", status: "active", unitId: topicId.split(".").slice(0, 2).join("."), topicId,
  ...(tagConfidence === undefined ? {} : { tagConfidence }), ...extra,
  source: { exam: "CCSE-IV", year: 2024, paper: paperId, qNo: n, pdfRef: "x.pdf", page: 1 },
});
const bundle = (): ContentBundle => ({
  version: "t", builtAt: "2026-11-27",
  papers: [
    { id: "p2024", title: "2024", date: "2024-06-09", sections: [], rankingExcludedSections: ["tamil"] },
    { id: "p2023", title: "2023", date: "2023-06-09", sections: [] },
  ],
  units: [{ id: "ta.u1", nameEn: "Grammar", nameTa: null, questions: 1 }, { id: "gs.u1", nameEn: "Science", nameTa: null, questions: 1 }],
  topics: [
    { id: "ta.u1.a", unitId: "ta.u1", nameEn: "a", nameTa: null },
    { id: "gs.u1.x", unitId: "gs.u1", nameEn: "x", nameTa: null },
    { id: "gs.u1.y", unitId: "gs.u1", nameEn: "y", nameTa: null },
  ],
  questions: [
    q("p2024_q001", "p2024", 1, "tamil", "ta.u1.a", 0.5),
    q("p2024_q101", "p2024", 101, "gs_apt", "gs.u1.x", 0.6),
    q("p2024_q102", "p2024", 102, "gs_apt", "gs.u1.x", 0.9),
    q("p2024_q103", "p2024", 103, "gs_apt", "gs.u1.x", 0.4, { figure: true }),
    q("p2023_q001", "p2023", 1, "tamil", "ta.u1.a", 0.7),
    q("p2023_q101", "p2023", 101, "gs_apt", "gs.u1.x"),
  ],
});
const review = (eventId: string, questionId: string, verdict: TagReviewed["verdict"], topicId: string, at = "2026-11-27T10:00:00.000Z"): TagReviewed => ({
  type: "tagReview", eventId, deviceId: "phone", at, schemaVersion: 1, sessionId: "tags", questionId, verdict, topicId,
});

describe("tag review queue", () => {
  it("lists low-confidence, servable, unreviewed tags; ranking sections first, then newest paper, then number", () => {
    expect(tagReviewQueue(bundle())).toEqual(["p2024_q101", "p2023_q001", "p2024_q001"]);
  });
  it("drops a question once it is reviewed", () => {
    const b = applyTagReviews(bundle(), [review("r1", "p2024_q101", "confirm", "gs.u1.x")]);
    expect(tagReviewQueue(b)).toEqual(["p2023_q001", "p2024_q001"]);
  });
});

describe("applyTagReviews", () => {
  it("moves a changed tag to the new topic and its unit", () => {
    const b = applyTagReviews(bundle(), [review("r1", "p2024_q101", "change", "gs.u1.y")]);
    const got = b.questions.find((x) => x.id === "p2024_q101")!;
    expect(got).toMatchObject({ topicId: "gs.u1.y", unitId: "gs.u1", tagReviewed: "change" });
  });
  it("uses the latest review of a question", () => {
    const log: LearningEvent[] = [review("r1", "p2024_q101", "change", "gs.u1.y"), review("r2", "p2024_q101", "confirm", "gs.u1.x", "2026-11-27T11:00:00.000Z")];
    expect(tagReviews(log).get("p2024_q101")?.eventId).toBe("r2");
    expect(applyTagReviews(bundle(), log).questions.find((x) => x.id === "p2024_q101")?.topicId).toBe("gs.u1.x");
  });
  it("ignores a review naming an unknown topic, and returns the same bundle when nothing applies", () => {
    const b = bundle();
    expect(applyTagReviews(b, [review("r1", "p2024_q101", "change", "nope")])).toBe(b);
    expect(applyTagReviews(b, [])).toBe(b);
  });
});

describe("validateEvent: tagReview", () => {
  const raw = { type: "tagReview", eventId: "r1", deviceId: "phone", at: "2026-11-27T10:00:00Z", schemaVersion: 1, sessionId: "tags", questionId: "q", verdict: "nofit", topicId: "t", extra: 1 };
  it("accepts a valid review and drops unknown fields", () => {
    expect(validateEvent(raw)).toEqual({ ...review("r1", "q", "nofit", "t"), at: "2026-11-27T10:00:00.000Z" });
  });
  it("rejects a bad verdict or a missing topic", () => {
    expect(validateEvent({ ...raw, verdict: "maybe" })).toBe("bad verdict: maybe");
    expect(validateEvent({ ...raw, topicId: "" })).toBe('bad topicId: ""');
  });
});
