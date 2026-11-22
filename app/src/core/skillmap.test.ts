import { describe, expect, it } from "vitest";
import { mistakeStates, type MistakeState } from "./mistakes";
import { MIN_ANSWERS, skillStates, WEAKNESS, type SkillState } from "./skillmap";
import type { AnswerGiven, Confidence, Option, Question } from "./types";

const q = (id: string, unitId: string | undefined, extra: Partial<Question> = {}): Question => ({
  id, n: 1, section: "gs_apt", accepted: ["A"], keyStatus: "final", status: "active",
  unitId, topicId: unitId ? `${unitId}.t` : undefined, conceptId: `c-${id}`,
  source: { exam: "CCSE-IV", year: 2025, paper: "P", qNo: 1, pdfRef: "x.pdf", page: 1 },
  ...extra,
});

let seq = 0;
const ans = (questionId: string, chosen: Option, confidence: Confidence): AnswerGiven => {
  const n = seq++;
  return {
    type: "answer", eventId: `e${String(n).padStart(5, "0")}`, deviceId: "phone",
    at: `2026-11-22T10:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}Z`,
    schemaVersion: 1, sessionId: "s1", questionId, chosen, confidence, timeMs: 1000, mode: "practice", contentVersion: "v1",
  };
};

const mistake = (conceptId: string, stage: MistakeState["stage"], sureWrong: string[] = []): MistakeState => ({
  conceptId, topicId: null, unitId: null, stage, misconception: true, streak: 0, streakStartDay: null,
  transferDone: false, wrongQuestionIds: sureWrong, sureWrongQuestionIds: sureWrong, transferPossible: true, loggedDay: "2026-11-22", retestDay: "2026-11-23",
  lastWrongAt: "2026-11-22T10:00:00Z", lastWrongEventId: "e0", reason: null, fixedAt: null, episodes: 1,
});

/**
 * Builds a unit of questions and one answer each: "cs" correct+sure, "cg" correct+guess, "ws" wrong+sure,
 * "wg" wrong+guess. Ten unanswered padding questions keep the unit at 10+ questions, so the 10-answer
 * minimum applies (a smaller unit is judged once all its questions are answered).
 */
type Kind = "cs" | "cg" | "ws" | "wg";
function unit(unitId: string, kinds: Kind[]) {
  const questions: Question[] = [];
  const answers: AnswerGiven[] = [];
  kinds.forEach((k, i) => {
    const id = `${unitId}-q${i}`;
    questions.push(q(id, unitId));
    answers.push(ans(id, k[0] === "c" ? "A" : "B", k[1] === "s" ? "sure" : "guess"));
  });
  for (let i = 0; i < 10; i++) questions.push(q(`${unitId}-pad${i}`, unitId));
  return { questions, answers };
}
const rep = (k: Kind, n: number): Kind[] => Array<Kind>(n).fill(k);
const index = (qs: Question[]) => new Map(qs.map((x) => [x.id, x]));

/** Mistake states from the real module, as the engine computes them. */
const real = (answers: AnswerGiven[], qs: Map<string, Question>) => mistakeStates(answers, qs);

function one(unitId: string, kinds: Kind[], mistakes?: Map<string, MistakeState>): SkillState {
  const { questions, answers } = unit(unitId, kinds);
  const qs = index(questions);
  return skillStates([unitId], answers, qs, mistakes ?? real(answers, qs)).get(unitId)!;
}

describe("AT-C8: boxes", () => {
  it("9 scored answers is insufficient, even when all correct and sure", () => {
    const s = one("U", rep("cs", 9));
    expect(s.box).toBe("insufficient");
    expect(s.scored).toBe(9);
    expect(s.evidence).toBe("9 of 10 answers so far");
  });
  it("10 answers at 50% is weak", () => {
    const s = one("U", [...rep("cs", 5), ...rep("wg", 5)]);
    expect(s).toMatchObject({ box: "weak", scored: 10, correct: 5, accuracy: 0.5 });
    expect(s.evidence).toBe("5 of 10 correct (50%)");
  });
  it("2 unresolved wrong+sure answers is misconception, even at high accuracy", () => {
    const s = one("U", [...rep("cs", 18), ...rep("ws", 2)]);
    expect(s.accuracy).toBe(0.9);
    expect(s).toMatchObject({ box: "misconception", unresolvedMisconceptions: 2 });
    expect(s.evidence).toBe("2 sure-but-wrong answers not fixed yet");
  });
  it("2 unresolved wrong+sure answers is misconception with fewer than 10 answers", () => {
    const s = one("U", [...rep("cs", 3), ...rep("ws", 2)]);
    expect(s.scored).toBeLessThan(MIN_ANSWERS);
    expect(s.box).toBe("misconception");
  });
  it("1 unresolved wrong+sure answer is not enough for misconception", () => {
    const s = one("U", [...rep("cs", 9), "ws"]);
    expect(s).toMatchObject({ box: "strong", unresolvedMisconceptions: 1 });
  });
});

describe("AT-C4: deleted questions", () => {
  it("answers to deleted questions are excluded from counts and boxes", () => {
    const { questions, answers } = unit("U", [...rep("cs", 9), ...rep("ws", 2)]);
    // delete the two sure-but-wrong questions: 9 scored, no misconceptions
    const qs = index(questions.map((x, i) => (i === 9 || i === 10 ? { ...x, status: "deleted" as const } : x)));
    const s = skillStates(["U"], answers, qs, real(answers, qs)).get("U")!;
    expect(s).toMatchObject({ box: "insufficient", scored: 9, correct: 9, unresolvedMisconceptions: 0 });
    // without deletion it would have been a misconception
    const all = index(questions);
    expect(skillStates(["U"], answers, all, real(answers, all)).get("U")!.box).toBe("misconception");
  });
  it("a deleted question does not count towards the 10-answer minimum", () => {
    const { questions, answers } = unit("U", rep("cs", 10));
    const qs = index(questions.map((x, i) => (i === 0 ? { ...x, status: "deleted" as const } : x)));
    expect(skillStates(["U"], answers, qs, new Map()).get("U")!).toMatchObject({ box: "insufficient", scored: 9 });
  });
});

describe("boundaries", () => {
  it("accuracy exactly 0.6 is shaky", () => {
    const s = one("U", [...rep("cs", 6), ...rep("wg", 4)]);
    expect(s).toMatchObject({ box: "shaky", accuracy: 0.6, sureShare: 1 });
    expect(s.evidence).toBe("6 of 10 correct (60%), 6 of 6 sure");
  });
  it("accuracy just below 0.6 is weak", () => {
    const s = one("U", [...rep("cs", 11), ...rep("wg", 9)]);
    expect(s.accuracy).toBeCloseTo(0.55);
    expect(s.box).toBe("weak");
  });
  it("accuracy exactly 0.8 with sureShare exactly 0.7 is strong", () => {
    // 25 answers: 20 correct (0.8), 14 of them sure (0.7)
    const s = one("U", [...rep("cs", 14), ...rep("cg", 6), ...rep("wg", 5)]);
    expect(s.accuracy).toBe(0.8);
    expect(s.sureShare).toBe(0.7);
    expect(s.box).toBe("strong");
    expect(s.evidence).toBe("20 of 25 correct (80%), 14 of 20 sure");
  });
  it("accuracy 0.8 with sureShare below 0.7 is shaky", () => {
    const s = one("U", [...rep("cs", 5), ...rep("cg", 3), ...rep("wg", 2)]);
    expect(s.accuracy).toBe(0.8);
    expect(s.sureShare).toBeCloseTo(0.625);
    expect(s.box).toBe("shaky");
    expect(s.evidence).toBe("8 of 10 correct (80%), 5 of 8 sure");
  });
  it("accuracy just below 0.8 is shaky even when all sure", () => {
    const s = one("U", [...rep("cs", 15), ...rep("wg", 5)]);
    expect(s.accuracy).toBe(0.75);
    expect(s.box).toBe("shaky");
  });
  it("strong evidence reads plainly", () => {
    const s = one("U", [...rep("cs", 8), "cg", "wg"]);
    expect(s).toMatchObject({ box: "strong", weakness: 0 });
    expect(s.evidence).toBe("9 of 10 correct (90%), 8 of 9 sure");
  });
  it("sureShare is 1 when nothing is correct", () => {
    const s = one("U", rep("wg", 10));
    expect(s).toMatchObject({ box: "weak", correct: 0, accuracy: 0, sureShare: 1 });
    expect(s.evidence).toBe("0 of 10 correct (0%)");
  });
});

describe("rules", () => {
  it("the latest answer per question wins", () => {
    const { questions, answers } = unit("U", rep("wg", 10));
    // re-answer every question correctly and surely, later
    const later = questions.slice(0, 10).map((x) => ans(x.id, "A", "sure"));
    const s = skillStates(["U"], [...later.reverse(), ...answers], index(questions), new Map()).get("U")!;
    expect(s).toMatchObject({ box: "strong", scored: 10, correct: 10 });
  });
  it("a wrong+sure answer re-answered correctly still counts until its mistake is fixed (review P4)", () => {
    const { questions, answers } = unit("U", [...rep("cs", 8), ...rep("ws", 2)]);
    const fix = ans(questions[9].id, "A", "sure");
    const qs = index(questions);
    const s = skillStates(["U"], [...answers, fix], qs, real([...answers, fix], qs)).get("U")!;
    expect(s).toMatchObject({ box: "misconception", unresolvedMisconceptions: 2, correct: 9 });
  });
  it("a wrong+sure whose concept MistakeState is fixed does not count", () => {
    const { questions, answers } = unit("U", [...rep("cs", 8), ...rep("ws", 2)]);
    const fixed = new Map([
      [`c-${questions[8].id}`, mistake(`c-${questions[8].id}`, "fixed", [questions[8].id])],
      [`c-${questions[9].id}`, mistake(`c-${questions[9].id}`, "logged", [questions[9].id])],
    ]);
    const s = skillStates(["U"], answers, index(questions), fixed).get("U")!;
    expect(s).toMatchObject({ box: "strong", unresolvedMisconceptions: 1 });
  });
  it("an open (logged or spaced) MistakeState counts as unresolved", () => {
    const { questions, answers } = unit("U", [...rep("cs", 8), ...rep("ws", 2)]);
    const open = new Map([
      [`c-${questions[8].id}`, mistake(`c-${questions[8].id}`, "logged", [questions[8].id])],
      [`c-${questions[9].id}`, mistake(`c-${questions[9].id}`, "spaced", [questions[9].id])],
    ]);
    expect(skillStates(["U"], answers, index(questions), open).get("U")!.unresolvedMisconceptions).toBe(2);
  });
  it("each sure-but-wrong question counts in its own unit", () => {
    const a = unit("A", rep("cs", 10));
    const b = unit("B", rep("cs", 10));
    const qs = index([...a.questions, ...b.questions]);
    // one open misconception whose two sure-wrong questions sit in different units
    const m = new Map([["k", mistake("k", "spaced", [a.questions[0].id, b.questions[0].id])]]);
    const s = skillStates(["A", "B"], [...a.answers, ...b.answers], qs, m);
    expect(s.get("A")!.unresolvedMisconceptions).toBe(1);
    expect(s.get("B")!.unresolvedMisconceptions).toBe(1);
  });
  it("only open misconceptions count; an ordinary open mistake does not", () => {
    const { questions, answers } = unit("U", rep("cs", 10));
    const ordinary = { ...mistake("k", "logged", [questions[0].id, questions[1].id]), misconception: false };
    expect(skillStates(["U"], answers, index(questions), new Map([["k", ordinary]])).get("U")!.unresolvedMisconceptions).toBe(0);
  });
  it("a unit with fewer than 10 questions is judged once all are answered (review finding 1)", () => {
    const qs6 = [0, 1, 2, 3, 4, 5].map((i) => q(`S-${i}`, "S"));
    const as6 = qs6.map((x, i) => ans(x.id, i < 3 ? "A" : "B", "guess"));
    const m = index(qs6);
    expect(skillStates(["S"], as6.slice(0, 5), m, real(as6.slice(0, 5), m)).get("S")!).toMatchObject({ box: "insufficient", evidence: "5 of 6 answers so far" });
    expect(skillStates(["S"], as6, m, real(as6, m)).get("S")!.box).toBe("weak");
  });
  it("a raw E marked sure still counts as no idea (AT-C5, review finding 5)", () => {
    const { questions, answers } = unit("U", rep("cs", 8));
    const extra = [q("U-e1", "U", { accepted: "ALL" }), q("U-e2", "U")];
    const raw = [ans("U-e1", "E", "sure"), ans("U-e2", "E", "sure")];
    const qs = index([...questions, ...extra]);
    const s = skillStates(["U"], [...answers, ...raw], qs, real([...answers, ...raw], qs)).get("U")!;
    expect(s.unresolvedMisconceptions).toBe(0);
    expect(s.scored).toBe(9); // the ALL-keyed answer is no evidence either way (review finding 7)
  });
  it("wrong+guess and wrong with E never count as misconceptions", () => {
    const { questions, answers } = unit("U", rep("wg", 2));
    const extra = [q("U-e1", "U"), q("U-e2", "U")];
    const es = [ans("U-e1", "E", "none"), ans("U-e2", "E", "none")];
    const qs = index([...questions, ...extra]);
    const s = skillStates(["U"], [...answers, ...es], qs, real([...answers, ...es], qs)).get("U")!;
    expect(s).toMatchObject({ box: "insufficient", scored: 4, unresolvedMisconceptions: 0 });
  });
  it("units with no answers still get a state", () => {
    const { questions, answers } = unit("A", rep("cs", 10));
    const m = skillStates(["A", "B"], answers, index(questions), new Map());
    expect([...m.keys()]).toEqual(["A", "B"]);
    expect(m.get("B")).toEqual({
      unitId: "B", box: "insufficient", scored: 0, correct: 0, accuracy: 0, sureShare: 1,
      unresolvedMisconceptions: 0, weakness: WEAKNESS.insufficient, evidence: "No questions on this unit yet",
    });
  });
  it("questions without unitId, unknown questions and units not asked for are ignored", () => {
    const { questions, answers } = unit("U", rep("cs", 9));
    const loose = [q("x1", undefined), q("x2", undefined), q("o1", "OTHER")];
    const extra = [ans("x1", "B", "sure"), ans("x2", "B", "sure"), ans("o1", "A", "sure"), ans("ghost", "A", "sure")];
    const m = skillStates(["U"], [...answers, ...extra], index([...questions, ...loose]), new Map());
    expect([...m.keys()]).toEqual(["U"]);
    expect(m.get("U")).toMatchObject({ box: "insufficient", scored: 9, unresolvedMisconceptions: 0 });
  });
  it("answers are counted per unit", () => {
    const a = unit("A", rep("cs", 10));
    const b = unit("B", [...rep("cs", 5), ...rep("wg", 5)]);
    const m = skillStates(["A", "B"], [...a.answers, ...b.answers], index([...a.questions, ...b.questions]), new Map());
    expect(m.get("A")!.box).toBe("strong");
    expect(m.get("B")!.box).toBe("weak");
  });
  it("weakness matches WEAKNESS for every box", () => {
    const cases: [Kind[], string][] = [
      [[...rep("cs", 3), ...rep("ws", 2)], "misconception"],
      [rep("cs", 3), "insufficient"],
      [rep("wg", 10), "weak"],
      [[...rep("cs", 7), ...rep("wg", 3)], "shaky"],
      [rep("cs", 10), "strong"],
    ];
    for (const [kinds, box] of cases) {
      const s = one("U", kinds);
      expect(s.box).toBe(box);
      expect(s.weakness).toBe(WEAKNESS[s.box]);
    }
  });
  it("is deterministic: replaying the same input gives deep-equal output", () => {
    const a = unit("A", [...rep("cs", 7), ...rep("cg", 2), ...rep("ws", 2)]);
    const b = unit("B", [...rep("cs", 6), ...rep("wg", 4)]);
    const answers = [...a.answers, ...b.answers];
    const qs = index([...a.questions, ...b.questions]);
    const first = skillStates(["A", "B", "C"], answers, qs, new Map());
    const replay = skillStates(["A", "B", "C"], [...answers].reverse(), new Map(qs), new Map());
    expect(replay).toEqual(first);
    expect([...replay.entries()]).toEqual([...first.entries()]);
  });
});
