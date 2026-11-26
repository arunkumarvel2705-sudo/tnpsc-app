import { describe, expect, it } from "vitest";
import { isServable, normalizeBundle, sectionQuestionIds, servableQuestions, topicIndex, type RawBundle } from "./content";
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

describe("topicIndex with old-pattern sections left out of ranking", () => {
  // AK's case: three Group 4 papers; the 2024 and 2022 Tamil parts were set on the older syllabus.
  const threePapers = (excluded: Question["section"][] | undefined): ContentBundle => ({
    version: "t", builtAt: "2026-11-26T00:00:00Z",
    papers: [
      { id: "ccse4_2025", title: "Group 4 2025", date: "2025-07-12", sections: [] },
      { id: "ccse4_2024", title: "Group 4 2024", date: "2024-06-09", sections: [], rankingExcludedSections: excluded },
      { id: "ccse4_2022", title: "Group 4 2022", date: "2022-07-24", sections: [], rankingExcludedSections: excluded },
    ],
    units: [{ id: "U", nameEn: "U", nameTa: null, questions: 0 }],
    questions: [
      q("ccse4_2025_q001", "ccse4_2025", 2025, "tamil", "T.ta_all"),
      q("ccse4_2024_q001", "ccse4_2024", 2024, "tamil", "T.ta_all"),
      q("ccse4_2022_q001", "ccse4_2022", 2022, "tamil", "T.ta_all"),
      q("ccse4_2024_q002", "ccse4_2024", 2024, "tamil", "T.ta_old"), // only in old-pattern Tamil
      q("ccse4_2022_q002", "ccse4_2022", 2022, "tamil", "T.ta_old"),
      q("ccse4_2025_q101", "ccse4_2025", 2025, "gs_apt", "T.gs"),
      q("ccse4_2024_q101", "ccse4_2024", 2024, "gs_apt", "T.gs"),
      q("ccse4_2022_q101", "ccse4_2022", 2022, "gs_apt", "T.gs"),
    ],
  });

  it("counts Tamil only from 2025 (1 of 1) and General Studies from all three papers (3 of 3)", () => {
    const t = new Map(topicIndex(threePapers(["tamil"]), "CCSE-IV").map((x) => [x.topicId, x]));
    expect(t.get("T.ta_all")).toMatchObject({ papersAsked: 1, papersTotal: 1 });
    expect(t.get("T.gs")).toMatchObject({ papersAsked: 3, papersTotal: 3 });
  });

  it("keeps a topic seen only in excluded sections, at 0 of the papers that count", () => {
    const t = new Map(topicIndex(threePapers(["tamil"]), "CCSE-IV").map((x) => [x.topicId, x]));
    expect(t.get("T.ta_old")).toMatchObject({ papersAsked: 0, papersTotal: 1, exams: ["CCSE-IV"] });
  });

  it("gives 0 of 0 when no counted paper ranks the section", () => {
    const b = threePapers(["tamil"]);
    const onlyOld = { ...b, papers: b.papers.slice(1), questions: b.questions.filter((x) => x.paperId !== "ccse4_2025") };
    const t = new Map(topicIndex(onlyOld, "CCSE-IV").map((x) => [x.topicId, x]));
    expect(t.get("T.ta_all")).toMatchObject({ papersAsked: 0, papersTotal: 0 });
    expect(t.get("T.gs")).toMatchObject({ papersAsked: 2, papersTotal: 2 });
  });

  it("without the field (or with it empty) every paper counts in full, as before", () => {
    const expected = [
      { topicId: "T.gs", papersAsked: 3, papersTotal: 3 },
      { topicId: "T.ta_all", papersAsked: 3, papersTotal: 3 },
      { topicId: "T.ta_old", papersAsked: 2, papersTotal: 3 },
    ];
    const pick = (b: ContentBundle) => topicIndex(b, "CCSE-IV").map(({ topicId, papersAsked, papersTotal }) => ({ topicId, papersAsked, papersTotal }));
    expect(pick(threePapers(undefined))).toEqual(expected);
    expect(pick(threePapers([]))).toEqual(expected);
    expect(topicIndex(threePapers(undefined))).toEqual(topicIndex(threePapers([])));
  });
});

describe("questions that need a figure", () => {
  const withFigure = (): ContentBundle => {
    const b = twoPapers();
    return { ...b, questions: b.questions.map((x) => (x.id === "ccse4_2024_q101" ? { ...x, figure: true as const } : x)) };
  };

  it("are not servable; everything else is", () => {
    const b = withFigure();
    expect(b.questions.filter((x) => !isServable(x)).map((x) => x.id)).toEqual(["ccse4_2024_q101"]);
    expect(servableQuestions(b).map((x) => x.id)).toEqual(["ccse4_2024_q001", "ccse4_2024_q102", "ccse4_2023_q001", "ccse4_2023_q101"]);
    expect(servableQuestions(twoPapers())).toEqual(twoPapers().questions);
  });

  it("are left out of a section walk-through", () => {
    expect(sectionQuestionIds(withFigure(), "ccse4_2024", "gs_apt")).toEqual(["ccse4_2024_q102"]);
  });

  it("still count towards how often a topic is asked (ranking is about the exam, not the app)", () => {
    expect(topicIndex(withFigure(), "CCSE-IV")).toEqual(topicIndex(twoPapers(), "CCSE-IV"));
  });
});
