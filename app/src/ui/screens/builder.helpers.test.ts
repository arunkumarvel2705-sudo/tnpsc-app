import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC } from "../../core/builder";
import type { ContentBundle } from "../../core/types";
import { builderTitle, paperYear, topicsOf, unitGroups } from "./builder.helpers";

// Invented placeholder content only.
const b: ContentBundle = {
  version: "t", builtAt: "x",
  papers: [{ id: "p", title: "P", date: "2025-07-12", sections: [] }],
  units: [
    { id: "x.ta.u1", nameEn: "Grammar", nameTa: null, questions: 0 },
    { id: "x.gs.u4", nameEn: "Polity", nameTa: null, questions: 0 },
    { id: "x.gs.u5", nameEn: "Economy", nameTa: null, questions: 0 },
  ],
  topics: [{ id: "t.parl", unitId: "x.gs.u4", nameEn: "Parliament", nameTa: null }],
  questions: [],
};

describe("builder helpers", () => {
  it("titles by the narrowest scope and the status", () => {
    expect(builderTitle(b, DEFAULT_SPEC)).toBe("Practice: Mixed");
    expect(builderTitle(b, { ...DEFAULT_SPEC, subject: "gs" })).toBe("Practice: General Studies");
    expect(builderTitle(b, { ...DEFAULT_SPEC, subject: "gs", unitId: "x.gs.u4", status: "wrong" })).toBe("Practice: Polity · got wrong");
    expect(builderTitle(b, { ...DEFAULT_SPEC, unitId: "x.gs.u4", topicId: "t.parl", status: "unsure" })).toBe("Practice: Parliament · not sure");
    expect(builderTitle(b, { ...DEFAULT_SPEC, status: "mistakes" })).toBe("Practice: Mixed · open mistakes");
  });

  it("groups units by subject, leaving out empty subjects", () => {
    expect(unitGroups(b, "all").map((g) => [g.id, g.units.length])).toEqual([["tamil", 1], ["gs", 2]]);
    expect(unitGroups(b, "gs").map((g) => g.id)).toEqual(["gs"]);
    expect(unitGroups(b, "apt")).toEqual([]);
  });

  it("lists a unit's topics and the paper year", () => {
    expect(topicsOf(b, "x.gs.u4").map((t) => t.id)).toEqual(["t.parl"]);
    expect(topicsOf(b, null)).toEqual([]);
    expect(paperYear(b.papers[0])).toBe("2025");
  });
});
