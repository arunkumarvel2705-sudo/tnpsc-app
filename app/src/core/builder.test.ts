import { describe, expect, it } from "vitest";
import { mistakeStates } from "./mistakes";
import {
  builderPool, DEFAULT_SPEC, openMistakeQuestionIds, pickSet, questionStatus, sanitizeSpec, seededRandom, statusCounts, subjectOf, type BuilderSpec,
} from "./builder";
import type { AnswerGiven, Confidence, ContentBundle, Option, Question } from "./types";

// Invented placeholder questions only: two papers, three subjects.
const q = (id: string, paperId: string, unitId: string, topicId: string, extra: Partial<Question> = {}): Question => ({
  id, paperId, n: Number(id.slice(-3)), section: unitId.includes(".ta.") ? "tamil" : "gs_apt",
  accepted: ["A"], keyStatus: "final", status: "active", unitId, topicId,
  source: { exam: "CCSE-IV", year: Number(paperId.slice(-4)), paper: paperId, qNo: 1, pdfRef: "x.pdf", page: 1 },
  ...extra,
});
const bundle = (): ContentBundle => ({
  version: "t", builtAt: "2026-11-27T00:00:00Z",
  papers: [
    { id: "p_2025", title: "P 2025", date: "2025-07-12", sections: [] },
    { id: "p_2024", title: "P 2024", date: "2024-06-09", sections: [] },
  ],
  units: [
    { id: "x.ta.u1", nameEn: "Grammar", nameTa: null, questions: 0 },
    { id: "x.gs.u4", nameEn: "Polity", nameTa: null, questions: 0 },
    { id: "x.apt.u1", nameEn: "Aptitude", nameTa: null, questions: 0 },
  ],
  topics: [
    { id: "t.gram", unitId: "x.ta.u1", nameEn: "Gram", nameTa: null },
    { id: "t.const", unitId: "x.gs.u4", nameEn: "Constitution", nameTa: null },
    { id: "t.parl", unitId: "x.gs.u4", nameEn: "Parliament", nameTa: null },
    { id: "t.pct", unitId: "x.apt.u1", nameEn: "Percent", nameTa: null },
  ],
  questions: [
    q("p_2025_q001", "p_2025", "x.ta.u1", "t.gram"),
    q("p_2025_q101", "p_2025", "x.gs.u4", "t.const"),
    q("p_2025_q102", "p_2025", "x.gs.u4", "t.parl"),
    q("p_2025_q190", "p_2025", "x.apt.u1", "t.pct"),
    q("p_2025_q191", "p_2025", "x.apt.u1", "t.pct", { figure: true }), // never served
    q("p_2024_q101", "p_2024", "x.gs.u4", "t.const"),
    q("p_2024_q102", "p_2024", "x.gs.u4", "t.const", { status: "deleted" }), // never used
    q("p_2024_q190", "p_2024", "x.apt.u1", "t.pct", { accepted: "ALL" }),
  ],
});
let n = 0;
const ans = (questionId: string, chosen: Option, confidence: Confidence): AnswerGiven => ({
  type: "answer", eventId: `e${n++}`, deviceId: "d", at: "2026-11-20T10:00:00Z", schemaVersion: 1, sessionId: "s",
  questionId, chosen, confidence, timeMs: 1000, mode: "practice", contentVersion: "t",
});
const spec = (s: Partial<BuilderSpec> = {}): BuilderSpec => ({ ...DEFAULT_SPEC, ...s });
const ids = (qs: Question[]) => qs.map((x) => x.id);

describe("subjectOf", () => {
  it("reads the subject from the unit id, and falls back to the section", () => {
    expect(subjectOf("ccse4.ta.u3")).toBe("tamil");
    expect(subjectOf("ccse4.gs.u4")).toBe("gs");
    expect(subjectOf("ccse4.apt.u2")).toBe("apt");
    expect(subjectOf(undefined, "tamil")).toBe("tamil");
    expect(subjectOf(undefined, "gs_apt")).toBe("gs");
  });
});

describe("questionStatus", () => {
  const b = bundle();
  const get = (id: string) => b.questions.find((x) => x.id === id)!;
  it("is new with no answer", () => expect(questionStatus(get("p_2025_q101"), undefined)).toEqual({ isNew: true, wrong: false, unsure: false }));
  it("a sure wrong answer is wrong, not unsure", () =>
    expect(questionStatus(get("p_2025_q101"), ans("p_2025_q101", "B", "sure"))).toEqual({ isNew: false, wrong: true, unsure: false }));
  it("a lucky guess is unsure, not wrong", () =>
    expect(questionStatus(get("p_2025_q101"), ans("p_2025_q101", "A", "guess"))).toEqual({ isNew: false, wrong: false, unsure: true }));
  it("Answer not known (E) is wrong and unsure", () =>
    expect(questionStatus(get("p_2025_q101"), ans("p_2025_q101", "E", "none"))).toEqual({ isNew: false, wrong: true, unsure: true }));
  it("an ALL-keyed question is never wrong or unsure once answered", () =>
    expect(questionStatus(get("p_2024_q190"), ans("p_2024_q190", "C", "guess"))).toEqual({ isNew: false, wrong: false, unsure: false }));
});

describe("builderPool", () => {
  it("leaves out figure and deleted questions", () => {
    const all = ids(builderPool(bundle(), [], spec()));
    expect(all).not.toContain("p_2025_q191");
    expect(all).not.toContain("p_2024_q102");
    expect(all).toHaveLength(6);
  });

  it("filters by subject, unit, topic and paper", () => {
    const b = bundle();
    expect(ids(builderPool(b, [], spec({ subject: "tamil" })))).toEqual(["p_2025_q001"]);
    expect(ids(builderPool(b, [], spec({ subject: "apt" })))).toEqual(["p_2025_q190", "p_2024_q190"]);
    expect(ids(builderPool(b, [], spec({ unitId: "x.gs.u4" })))).toEqual(["p_2025_q101", "p_2025_q102", "p_2024_q101"]);
    expect(ids(builderPool(b, [], spec({ unitId: "x.gs.u4", topicId: "t.const" })))).toEqual(["p_2025_q101", "p_2024_q101"]);
    expect(ids(builderPool(b, [], spec({ unitId: "x.gs.u4", paperIds: ["p_2024"] })))).toEqual(["p_2024_q101"]);
  });

  it("filters by status from the latest answer only", () => {
    const log = [ans("p_2025_q101", "B", "sure"), ans("p_2025_q101", "A", "sure"), ans("p_2025_q102", "B", "sure"), ans("p_2024_q101", "A", "guess")];
    const b = bundle();
    expect(ids(builderPool(b, log, spec({ subject: "gs", status: "wrong" })))).toEqual(["p_2025_q102"]); // q101 fixed since
    expect(ids(builderPool(b, log, spec({ subject: "gs", status: "unsure" })))).toEqual(["p_2024_q101"]);
    expect(ids(builderPool(b, log, spec({ subject: "gs", status: "new" })))).toEqual([]);
    expect(statusCounts(b, log, spec({ subject: "gs" }))).toEqual({ any: 3, new: 0, wrong: 1, unsure: 1, mistakes: 0 });
  });

  it("open mistakes keep a question missed earlier even after one right answer, until fixed", () => {
    const b = bundle();
    const at = (id: string, chosen: Option, day: string) => ({ ...ans(id, chosen, "sure"), at: `${day}T10:00:00Z` });
    // q101 missed, then answered right next day: still an open mistake (fixing needs 3 sure answers over 14 days).
    const log = [at("p_2025_q101", "B", "2026-11-01"), at("p_2025_q101", "A", "2026-11-02"), at("p_2025_q190", "B", "2026-11-01")];
    const open = openMistakeQuestionIds(mistakeStates(log, new Map(b.questions.map((x) => [x.id, x]))).values());
    expect([...open].sort()).toEqual(["p_2025_q101", "p_2025_q190"]);
    expect(ids(builderPool(b, log, spec({ status: "wrong" }), open))).toEqual(["p_2025_q190"]);
    expect(ids(builderPool(b, log, spec({ status: "mistakes" }), open))).toEqual(["p_2025_q101", "p_2025_q190"]);
    expect(ids(builderPool(b, log, spec({ subject: "gs", status: "mistakes" }), open))).toEqual(["p_2025_q101"]);
    expect(statusCounts(b, log, spec(), open).mistakes).toBe(2);
    expect(ids(builderPool(b, log, spec({ status: "mistakes" })))).toEqual([]); // no mistakes passed in
  });

  it("a fixed mistake's questions are not open", () => {
    const fixed = { stage: "fixed", wrongQuestionIds: ["a"] } as const;
    const logged = { stage: "logged", wrongQuestionIds: ["b", "c"] } as const;
    expect([...openMistakeQuestionIds([fixed, logged] as never)]).toEqual(["b", "c"]);
  });
});

describe("pickSet", () => {
  const pool = Array.from({ length: 30 }, (_, i) => q(`p_2025_q${String(i + 1).padStart(3, "0")}`, "p_2025", "x.gs.u4", "t.const"));

  it("is repeatable for a seed and different across seeds", () => {
    expect(pickSet(pool, 10, "a")).toEqual(pickSet(pool, 10, "a"));
    expect(pickSet(pool, 10, "a")).not.toEqual(pickSet(pool, 10, "b"));
  });

  it("returns at most count distinct questions, and the whole pool when it is smaller", () => {
    const s = pickSet(pool, 10, "a");
    expect(s).toHaveLength(10);
    expect(new Set(s).size).toBe(10);
    expect(pickSet(pool, 50, "a")).toHaveLength(30);
    expect(pickSet([], 10, "a")).toEqual([]);
  });

  it("keeps a passage's questions together and in paper order", () => {
    const withPassage = [
      ...pool.slice(0, 10),
      q("p_2025_q090", "p_2025", "x.ta.u5", "t.read", { passage: { en: "…" } }),
      q("p_2025_q091", "p_2025", "x.ta.u5", "t.read", { passageRef: "p_2025_q090" }),
      q("p_2025_q092", "p_2025", "x.ta.u5", "t.read", { passageRef: "p_2025_q090" }),
    ];
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const s = pickSet(withPassage, 13, seed);
      const at = s.indexOf("p_2025_q090");
      expect(s.slice(at, at + 3)).toEqual(["p_2025_q090", "p_2025_q091", "p_2025_q092"]);
    }
  });

  it("seededRandom stays in [0, 1)", () => {
    const r = seededRandom("x");
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("sanitizeSpec", () => {
  const b = bundle();
  it("gives the default for nothing stored or junk", () => {
    expect(sanitizeSpec(null, b)).toEqual(DEFAULT_SPEC);
    expect(sanitizeSpec({ subject: "maths", count: 7, status: "x" }, b)).toEqual(DEFAULT_SPEC);
  });
  it("keeps a valid spec", () => {
    const s = spec({ subject: "gs", unitId: "x.gs.u4", topicId: "t.parl", paperIds: ["p_2024"], status: "wrong", count: 50 });
    expect(sanitizeSpec(s, b)).toEqual(s);
    expect(sanitizeSpec(spec({ status: "mistakes" }), b).status).toBe("mistakes");
  });
  it("drops a unit or topic the bundle no longer has, or one outside the subject", () => {
    expect(sanitizeSpec(spec({ subject: "gs", unitId: "x.gs.u9", topicId: "t.const" }), b)).toMatchObject({ unitId: null, topicId: null });
    expect(sanitizeSpec(spec({ subject: "tamil", unitId: "x.gs.u4" }), b)).toMatchObject({ unitId: null });
    expect(sanitizeSpec(spec({ subject: "gs", unitId: "x.gs.u4", topicId: "t.gram" }), b)).toMatchObject({ unitId: "x.gs.u4", topicId: null });
  });
  it("drops papers it does not know, and treats every paper picked as no paper filter", () => {
    expect(sanitizeSpec(spec({ paperIds: ["p_2024", "p_1999"] }), b).paperIds).toEqual(["p_2024"]);
    expect(sanitizeSpec(spec({ paperIds: ["p_2024", "p_2025"] }), b).paperIds).toEqual([]);
  });
});
