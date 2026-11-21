import { describe, expect, it } from "vitest";
import { matchTable, stemLines } from "./format";

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
