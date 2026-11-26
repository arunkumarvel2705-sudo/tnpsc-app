import { describe, expect, it } from "vitest";
import { normalizeBundle, sectionQuestionIds, topicIndex, type RawBundle } from "./content";
import type { ContentBundle, Question } from "./types";

// Invented placeholder questions only: two papers of one exam path, newest first.
const q = (id: string, paperId: string, year: number, section: Question["section"], topicId: string): Question => ({
  id, paperId, n: Number(id.replace(/\D/g, "").slice(-3)), section, accepted: ["A"], keyStatus: "final", status: "active",
  unitId: "U", topicId,
  source: { exam: "CCSE-IV", year, paper: paperId, qNo: 1, pdfRef: "x.pdf", page: 1 },
});
const twoPapers = (): ContentBundle => ({
  version: "t", builtAt: "2026-11-22T00:00:00Z",
  papers: [
    { id: "ccse4_2024", title: "Group 4 2024", date: "2024-06-09", sections: [] },
    { id: "ccse4_2023", title: "Group 4 2023", date: "2023-07-01", sections: [] },
  ],
  units: [{ id: "U", nameEn: "U", nameTa: null, questions: 0 }],
  questions: [
    q("ccse4_2024_q001", "ccse4_2024", 2024, "tamil", "T.both"),
    q("ccse4_2024_q101", "ccse4_2024", 2024, "gs_apt", "T.new"),
    q("ccse4_2024_q102", "ccse4_2024", 2024, "gs_apt", "T.both"),
    q("ccse4_2023_q001", "ccse4_2023", 2023, "tamil", "T.old"),
    q("ccse4_2023_q101", "ccse4_2023", 2023, "gs_apt", "T.both"),
  ],
});

describe("normalizeBundle", () => {
  it("gives questions of a pre-multi-paper bundle (no paperId) the bundle's first paper", () => {
    const { questions, ...rest } = twoPapers();
    const old: RawBundle = { ...rest, questions: questions.map(({ paperId: _p, ...x }) => x) };
    const b = normalizeBundle(old);
    expect(b.questions.map((x) => x.paperId)).toEqual(Array(5).fill("ccse4_2024"));
    expect(old.questions[0]).not.toHaveProperty("paperId"); // input untouched
  });

  it("keeps paperIds that are present and fills only the missing ones", () => {
    const b = twoPapers();
    const mixed: RawBundle = { ...b, questions: b.questions.map((x, i) => (i === 0 ? (({ paperId: _p, ...y }) => y)(x) : x)) };
    expect(normalizeBundle(mixed).questions.map((x) => x.paperId)).toEqual(["ccse4_2024", "ccse4_2024", "ccse4_2024", "ccse4_2023", "ccse4_2023"]);
  });

  it("returns a complete bundle as is", () => {
    const b = twoPapers();
    expect(normalizeBundle(b)).toBe(b);
  });

  it("does not throw on a bundle with no papers", () => {
    const b: RawBundle = { ...twoPapers(), papers: [], questions: [{ ...twoPapers().questions[0], paperId: undefined }] };
    expect(normalizeBundle(b).questions[0].paperId).toBe("");
  });
});

describe("sectionQuestionIds", () => {
  it("serves one section of one paper, in bundle order", () => {
    const b = twoPapers();
    expect(sectionQuestionIds(b, "ccse4_2024", "gs_apt")).toEqual(["ccse4_2024_q101", "ccse4_2024_q102"]);
    expect(sectionQuestionIds(b, "ccse4_2023", "gs_apt")).toEqual(["ccse4_2023_q101"]);
    expect(sectionQuestionIds(b, "ccse4_2023", "tamil")).toEqual(["ccse4_2023_q001"]);
    expect(sectionQuestionIds(b, "nope", "tamil")).toEqual([]);
  });
});

describe("topicIndex with two papers in one bundle", () => {
  it("a topic asked in both papers has frequency 2/2; one asked once has 1/2", () => {
    const t = new Map(topicIndex(twoPapers(), "CCSE-IV").map((x) => [x.topicId, x]));
    expect(t.get("T.both")).toMatchObject({ papersAsked: 2, papersTotal: 2 });
    expect(t.get("T.new")).toMatchObject({ papersAsked: 1, papersTotal: 2 });
    expect(t.get("T.old")).toMatchObject({ papersAsked: 1, papersTotal: 2 });
  });
});
