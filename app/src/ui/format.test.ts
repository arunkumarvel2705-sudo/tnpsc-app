import { describe, expect, it } from "vitest";
import { matchTable, questionLang, stemLines, switchLabel } from "./format";

describe("stemLines", () => {
  it("splits assertion/reason and numbered statements", () => {
    expect(stemLines("Assertion [A] : X is true. Reason [R] : Y.")).toEqual(["Assertion [A] : X is true.", "Reason [R] : Y."]);
    expect(stemLines("Which are true? (i) one. (ii) two. (iii) three.")).toEqual(["Which are true?", "(i) one.", "(ii) two.", "(iii) three."]);
  });
});

describe("matchTable", () => {
  it("builds two columns", () => {
    const t = matchTable("Match : (a) Dengue (b) Polio (c) Measles (d) Pox | 1. Intestine 2. Skin 3. Lungs 4. Nerves");
    expect(t).toEqual({ intro: "Match :", left: ["Dengue", "Polio", "Measles", "Pox"], right: ["Intestine", "Skin", "Lungs", "Nerves"] });
  });
  it("returns null when it cannot split", () => {
    expect(matchTable("Arrange in order 1. A 2. B")).toBeNull();
  });
});

describe("questionLang", () => {
  const both = { section: "gs_apt" as const, en: {}, ta: {} };
  it("Part A is always Tamil and cannot switch", () => {
    expect(questionLang({ section: "tamil", ta: {} }, "en")).toEqual({ lang: "ta", canSwitch: false });
  });
  it("Part B follows the learner's choice when both languages exist", () => {
    expect(questionLang(both, "en")).toEqual({ lang: "en", canSwitch: true });
    expect(questionLang(both, "ta")).toEqual({ lang: "ta", canSwitch: true });
  });
  it("falls back to the language the question has", () => {
    expect(questionLang({ section: "gs_apt", en: {} }, "ta")).toEqual({ lang: "en", canSwitch: false });
    expect(questionLang({ section: "gs_apt", ta: {} }, "en")).toEqual({ lang: "ta", canSwitch: false });
  });
  it("labels the switch in the target language", () => {
    expect(switchLabel("en")).toBe("தமிழில் படி");
    expect(switchLabel("ta")).toBe("Read in English");
  });
});
