import { describe, expect, it } from "vitest";
import type { ContentBundle, Term } from "../../core/types";
import { filterTerms, fromPapers, termsByUnit, termsForQuestion } from "./terms.helpers";

// Invented placeholder terms only.
const terms: Term[] = [
  { en: "Alpha angle", ta: "ஆல்பா", unitId: "u2", questionIds: ["q1"] },
  { en: "beta value", ta: "பீட்டா", unitId: "u1", questionIds: ["q1", "q2"] },
  { en: "gamma word", ta: "காமா", unitId: "u1", questionIds: [], meaning: "a made-up word", seenIn: ["Class 6 Science: One"] },
];
const bundle = { units: [{ id: "u1", nameEn: "One", nameTa: null, questions: 1 }, { id: "u2", nameEn: "Two", nameTa: null, questions: 1 }, { id: "u3", nameEn: "Three", nameTa: null, questions: 1 }] } as ContentBundle;

describe("Term Bridge helpers", () => {
  it("filters by English (any case) or Tamil", () => {
    expect(filterTerms(terms, "ALPHA").map((t) => t.en)).toEqual(["Alpha angle"]);
    expect(filterTerms(terms, "பீட்").map((t) => t.en)).toEqual(["beta value"]);
    expect(filterTerms(terms, "  ")).toHaveLength(3);
  });
  it("groups by unit in bundle order and drops empty units", () => {
    expect(termsByUnit(bundle, terms).map((g) => g.unitId)).toEqual(["u1", "u2"]);
  });
  it("keeps only the terms from question papers", () => {
    expect(fromPapers(terms).map((t) => t.en)).toEqual(["Alpha angle", "beta value"]);
  });
  it("finds a question's terms", () => {
    expect(termsForQuestion(terms, "q2").map((t) => t.en)).toEqual(["beta value"]);
    expect(termsForQuestion(undefined, "q1")).toEqual([]);
  });
});
