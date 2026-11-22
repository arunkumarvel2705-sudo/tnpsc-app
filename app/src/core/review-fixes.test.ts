// Regression tests for the independent review of v1 core (commit 2b94f36). Each test is one finding's repro.
import { describe, expect, it } from "vitest";
import { topicIndex } from "./content";
import { computeState } from "./engine";
import { validateEvent } from "./events";
import { mistakeStates } from "./mistakes";
import type { AnswerGiven, ContentBundle, LearningEvent, Option, Question } from "./types";

const mkQ = (id: string, unitId: string, topicId: string, extra: Partial<Question> = {}): Question => ({
  id, n: 1, section: "gs_apt", accepted: ["A"], keyStatus: "final", status: "active", unitId, topicId,
  source: { exam: "CCSE-IV", year: 2025, paper: "P1", qNo: 1, pdfRef: "x.pdf", page: 1 },
  ...extra,
});
const mkBundle = (questions: Question[], units: string[]): ContentBundle => ({
  version: "t", builtAt: "2026-11-22T00:00:00Z", papers: [], questions,
  units: units.map((id) => ({ id, nameEn: id, nameTa: null, questions: 0 })),
});
let seq = 0;
const ans = (questionId: string, chosen: Option, confidence: AnswerGiven["confidence"], at: string, eventId = `e${String(seq++).padStart(4, "0")}`): AnswerGiven => ({
  type: "answer", eventId, deviceId: "phone", at, schemaVersion: 1, sessionId: "s", questionId, chosen, confidence,
  timeMs: 1, mode: "practice", contentVersion: "t",
});
const day = (n: number) => `2026-11-${String(1 + n).padStart(2, "0")}T04:00:00.000Z`; // day 0 = 1 Nov, IST morning

describe("finding 1: the planner never locks onto a topic with nothing to serve", () => {
  it("repro A: a 6-question unit, all answered, is judged rather than stuck as undiagnosed", () => {
    const small = [0, 1, 2, 3, 4, 5].map((i) => mkQ(`s${i}`, "S", "S.t"));
    const big = Array.from({ length: 12 }, (_, i) => mkQ(`b${i}`, "B", "B.t"));
    const log = small.map((q, i) => ans(q.id, i < 4 ? "A" : "B", "guess", day(0)));
    const s = computeState(log, mkBundle([...small, ...big], ["S", "B"]), "2026-11-05", "CCSE-IV");
    expect(s.skills.get("S")!.box).not.toBe("insufficient");
    expect(s.plan.practiceSet.length).toBeGreaterThan(0);
  });
  it("repro B: a focus topic whose questions are all correct and sure is not picked", () => {
    const tf = Array.from({ length: 4 }, (_, i) => mkQ(`f${i}`, "W", "W.tf"));
    const tg = Array.from({ length: 8 }, (_, i) => mkQ(`g${i}`, "W", "W.tg"));
    // unit W: 4 right+sure on TF, 8 wrong+guess on TG -> weak; TF has nothing left to practise
    const log = [...tf.map((q) => ans(q.id, "A", "sure", day(0))), ...tg.map((q) => ans(q.id, "B", "guess", day(0)))];
    const s = computeState(log, mkBundle([...tf, ...tg], ["W"]), "2026-11-05", "CCSE-IV");
    expect(s.plan.focus?.topicId).toBe("W.tg");
    expect(s.plan.practiceSet.some((id) => id.startsWith("g"))).toBe(true);
  });
});

describe("finding 2: unresolved misconceptions follow the open episode", () => {
  const qs = ["k1", "k2", "k3", "k4", "k5"].map((id) => mkQ(id, "U", "U.k", { conceptId: "K" }));
  const pad = Array.from({ length: 10 }, (_, i) => mkQ(`p${i}`, "U", "U.p"));
  const bundle = mkBundle([...qs, ...pad], ["U"]);
  const fixedLog = (): LearningEvent[] => [
    ans("k1", "B", "sure", day(0)), ans("k2", "B", "sure", day(0)),
    ans("k3", "A", "sure", day(1)), ans("k4", "A", "sure", day(8)), ans("k3", "A", "sure", day(15)),
    ...pad.map((q) => ans(q.id, "A", "sure", day(15))),
  ];
  it("repro P3: a careless miss after a fix does not revive the old sure-but-wrong answers", () => {
    const before = computeState(fixedLog(), bundle, "2026-11-17", "CCSE-IV");
    expect(before.mistakes.get("K")!.stage).toBe("fixed");
    const after = computeState([...fixedLog(), ans("k5", "B", "guess", day(16))], bundle, "2026-11-18", "CCSE-IV");
    expect(after.skills.get("U")!.unresolvedMisconceptions).toBe(0);
    expect(after.skills.get("U")!.box).not.toBe("misconception");
  });
  it("repro P4: re-answering correctly the next day does not clear a misconception early", () => {
    const log = [ans("k1", "B", "sure", day(0)), ans("k2", "B", "sure", day(0)), ans("k1", "A", "sure", day(1)), ans("k2", "A", "sure", day(1)),
      ...pad.map((q) => ans(q.id, "A", "sure", day(1)))];
    const s = computeState(log, bundle, "2026-11-03", "CCSE-IV");
    expect(s.mistakes.get("K")!.stage).toBe("spaced");
    expect(s.skills.get("U")!.box).toBe("misconception");
  });
});

describe("finding 3: topic frequency counts only the learner's path papers", () => {
  it("repro P2: a topic Group 2 asks often does not outrank one every Group 4 paper asks", () => {
    const qs: Question[] = [];
    for (let y = 0; y < 5; y++) {
      qs.push(mkQ(`g4-${y}`, "U", "Tpath", { source: { exam: "G4", year: 2020 + y, paper: `G4-${y}`, qNo: 1, pdfRef: "x", page: 1 } }));
      qs.push(mkQ(`g2-${y}`, "U", "Tother", { source: { exam: "G2", year: 2020 + y, paper: `G2-${y}`, qNo: 1, pdfRef: "x", page: 1 } }));
    }
    qs.push(mkQ("g4-o", "U", "Tother", { source: { exam: "G4", year: 2024, paper: "G4-4", qNo: 2, pdfRef: "x", page: 1 } }));
    const t = new Map(topicIndex(mkBundle(qs, ["U"]), "G4").map((x) => [x.topicId, x]));
    expect(t.get("Tpath")).toMatchObject({ papersAsked: 5, papersTotal: 5 });
    expect(t.get("Tother")).toMatchObject({ papersAsked: 1, papersTotal: 5 });
  });
  it("only the most recent 10 path papers count", () => {
    const qs = Array.from({ length: 12 }, (_, y) => mkQ(`q${y}`, "U", y < 2 ? "Old" : "New", { source: { exam: "G4", year: 2010 + y, paper: `P${y}`, qNo: 1, pdfRef: "x", page: 1 } }));
    const t = new Map(topicIndex(mkBundle(qs, ["U"]), "G4").map((x) => [x.topicId, x]));
    expect(t.get("Old")).toMatchObject({ papersAsked: 0, papersTotal: 10 });
    expect(t.get("New")).toMatchObject({ papersAsked: 10, papersTotal: 10 });
  });
});

describe("finding 4: timestamps must carry a zone", () => {
  it("repro P7: a zoneless or non-ISO time is rejected", () => {
    const base = { type: "answer", schemaVersion: 1, eventId: "x", deviceId: "d", sessionId: "s", questionId: "q", chosen: "A", confidence: "sure", timeMs: 1, mode: "practice", contentVersion: "v" };
    expect(validateEvent({ ...base, at: "2026-11-22T10:00:00" })).toMatch(/^bad at/);
    expect(validateEvent({ ...base, at: "Nov 22 2026" })).toMatch(/^bad at/);
    expect(validateEvent({ ...base, at: "2026-11-22T10:00:00+05:30" })).toMatchObject({ at: "2026-11-22T04:30:00.000Z" });
  });
});

describe("finding 6: the engine de-duplicates its own input (AT-C1)", () => {
  it("repro P6: a repeated eventId is counted once", () => {
    const qs = [mkQ("a", "U", "U.t"), mkQ("b", "U", "U.t")];
    const once = ans("a", "A", "sure", day(1), "dup");
    const log = [ans("a", "B", "guess", day(0)), once, once, ans("a", "A", "sure", day(15))];
    const s = computeState(log, mkBundle(qs, ["U"]), "2026-11-17", "CCSE-IV");
    expect(s.mistakes.get("U.t")!.streak).toBe(2);
    expect(s.mistakes.get("U.t")!.stage).toBe("spaced");
  });
});

describe("findings 7 and 8: no-evidence questions and single-question concepts", () => {
  it("an ALL-keyed question cannot serve as the transfer that fixes a misconception", () => {
    const qs = new Map([mkQ("a", "U", "T"), mkQ("all", "U", "T", { accepted: "ALL" }), mkQ("b", "U", "T")].map((q) => [q.id, q]));
    const log = [ans("a", "B", "sure", day(0)), ans("a", "A", "sure", day(1)), ans("a", "A", "sure", day(8)), ans("a", "A", "sure", day(15)), ans("all", "C", "sure", day(16))];
    expect(mistakeStates(log, qs).get("T")!).toMatchObject({ stage: "spaced", transferDone: false });
    expect(mistakeStates([...log, ans("b", "A", "sure", day(17))], qs).get("T")!.stage).toBe("fixed");
  });
  it("a misconception on a concept with one question can still be fixed", () => {
    const qs = new Map([mkQ("solo", "U", "T", { conceptId: "solo-c" }), mkQ("other", "U", "T")].map((q) => [q.id, q]));
    const log = [ans("solo", "B", "sure", day(0)), ans("solo", "A", "sure", day(1)), ans("solo", "A", "sure", day(8)), ans("solo", "A", "sure", day(15))];
    expect(mistakeStates(log, qs).get("solo-c")!).toMatchObject({ misconception: true, transferPossible: false, stage: "fixed" });
  });
});

describe("tie-break by exam weight (found in the phone run with one paper loaded)", () => {
  it("when every topic scores the same, the unit worth more marks goes first", () => {
    const apt = Array.from({ length: 15 }, (_, i) => mkQ(`a${i}`, "ccse4.apt.u1", "ccse4.apt.u1.t1"));
    const gram = Array.from({ length: 25 }, (_, i) => mkQ(`g${i}`, "ccse4.ta.u1", "ccse4.ta.u1.e_split"));
    const b = mkBundle([...apt, ...gram], ["ccse4.apt.u1", "ccse4.ta.u1"]);
    b.units = [{ id: "ccse4.apt.u1", nameEn: "Aptitude", nameTa: null, questions: 15 }, { id: "ccse4.ta.u1", nameEn: "Grammar", nameTa: null, questions: 25 }];
    const s = computeState([], b, "2026-11-22", "CCSE-IV");
    expect(s.plan.focus!.unitId).toBe("ccse4.ta.u1"); // alphabetical order alone would pick Aptitude
  });
});
