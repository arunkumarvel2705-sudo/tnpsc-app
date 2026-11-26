import { describe, expect, it } from "vitest";
import type { TopicInfo } from "./content";
import type { CardState } from "./fsrs";
import type { MistakeStage, MistakeState } from "./mistakes";
import { DIAGNOSTIC_SIZE, MAX_REVIEW_MINUTES, PRACTICE_SIZE, QUICK_SIZE, planDay, type PlannerInput } from "./planner";
import { WEAKNESS, type Box, type SkillState } from "./skillmap";
import type { AnswerGiven, Question } from "./types";

// Fixtures are built by hand: fsrs, mistakes and skillmap are separate modules and are not called here.
const TODAY = "2026-11-24";

const q = (
  id: string,
  topicId: string,
  unitId: string,
  opts: { status?: Question["status"]; conceptId?: string; accepted?: Question["accepted"] } = {},
): Question => ({
  id, n: 1, section: "gs_apt", accepted: opts.accepted ?? ["A"], keyStatus: "final", status: opts.status ?? "active",
  conceptId: opts.conceptId, topicId, unitId,
  paperId: "P", source: { exam: "CCSE-IV", year: 2025, paper: "P", qNo: 1, pdfRef: "x.pdf", page: 1 },
});

let seq = 0;
const ans = (questionId: string, chosen: AnswerGiven["chosen"], confidence: AnswerGiven["confidence"], at: string): AnswerGiven => ({
  type: "answer", eventId: `e${String(seq++).padStart(4, "0")}`, deviceId: "phone", at, schemaVersion: 1, sessionId: "s1",
  questionId, chosen, confidence, timeMs: 1000, mode: "practice", contentVersion: "v1",
});
const right = (qid: string, at: string, confidence: AnswerGiven["confidence"] = "sure") => ans(qid, "A", confidence, at);
const wrong = (qid: string, at: string, confidence: AnswerGiven["confidence"] = "sure") => ans(qid, "B", confidence, at);

const topic = (topicId: string, unitId: string, papersAsked: number, papersTotal: number, exams = ["CCSE-IV"], unitWeight = 10): TopicInfo => ({
  topicId, unitId, nameEn: topicId, nameTa: null, papersAsked, papersTotal, exams, unitWeight,
});

const EVIDENCE: Record<Box, string> = {
  misconception: "2 sure-but-wrong answers not fixed yet",
  weak: "5 of 10 correct (50%)",
  shaky: "7 of 10 correct (70%)",
  strong: "9 of 10 correct (90%), 8 of 9 sure",
  insufficient: "6 of 10 answers so far",
};
const skill = (unitId: string, box: Box): SkillState => ({
  unitId, box, scored: 10, correct: 5, accuracy: 0.5, sureShare: 1, unresolvedMisconceptions: 0,
  weakness: WEAKNESS[box], evidence: EVIDENCE[box],
});
const skillsOf = (...s: SkillState[]) => new Map(s.map((x) => [x.unitId, x]));

const mistake = (conceptId: string, topicId: string | null, stage: MistakeStage, retestDay: string, wrongQuestionIds: string[] = []): MistakeState => ({
  conceptId, topicId, unitId: null, stage, misconception: false, streak: 0, streakStartDay: null, transferDone: false,
  wrongQuestionIds, sureWrongQuestionIds: [], transferPossible: true, loggedDay: retestDay, retestDay, lastWrongAt: `${retestDay}T00:00:00Z`, lastWrongEventId: "x",
  reason: null, fixedAt: null, episodes: 1,
});
const mistakesOf = (...m: MistakeState[]) => new Map(m.map((x) => [x.conceptId, x]));

const card = (cardId: string, dueDay: string, due = `${dueDay}T03:00:00Z`): CardState => ({
  cardId, kind: cardId.startsWith("q:") ? "question" : "fact", due, dueDay, stability: 1, difficulty: 5, reps: 1, lapses: 0,
  lastReviewAt: "2026-11-01T00:00:00Z",
});
const cardsOf = (...c: CardState[]) => new Map(c.map((x) => [x.cardId, x]));

const base = (over: Partial<PlannerInput>): PlannerInput => ({
  today: TODAY, pathExam: "CCSE-IV", topics: [], questions: [], answers: [], skills: new Map(), mistakes: new Map(), cards: new Map(),
  ...over,
});

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, "0")}`);

describe("AT-C9: focus = highest weakness x frequency x relevance", () => {
  it("picks the weakest frequent on-path topic and names every factor in why", () => {
    const plan = planDay(base({
      topics: [topic("T1", "U1", 1, 1), topic("T2", "U2", 1, 1)],
      questions: [q("a1", "T1", "U1"), q("b1", "T2", "U2")],
      skills: skillsOf(skill("U1", "weak"), skill("U2", "shaky")),
    }));
    expect(plan.focus).toEqual({
      topicId: "T1", unitId: "U1", box: "weak", weakness: 0.75, frequency: 1, relevance: 1, score: 0.75,
      why: "Weak: 5 of 10 correct (50%) · asked in 1 of 1 papers · on your CCSE-IV path",
    });
  });

  it("a weaker topic loses on frequency", () => {
    const plan = planDay(base({
      topics: [topic("T1", "U1", 1, 4), topic("T2", "U2", 4, 4)],
      questions: [q("a1", "T1", "U1"), q("b1", "T2", "U2")],
      skills: skillsOf(skill("U1", "misconception"), skill("U2", "shaky")),
    }));
    // T1: 1 * 0.25 = 0.25; T2: 0.5 * 1 = 0.5
    expect(plan.focus?.topicId).toBe("T2");
    expect(plan.focus?.score).toBe(0.5);
    expect(plan.focus?.why).toBe("Shaky: 7 of 10 correct (70%) · asked in 4 of 4 papers · on your CCSE-IV path");
  });

  it("an off-path topic (relevance 0) is never picked, however weak and frequent", () => {
    const plan = planDay(base({
      topics: [topic("T1", "U1", 4, 4, ["CCSE-II"]), topic("T2", "U2", 1, 4)],
      questions: [q("a1", "T1", "U1"), q("b1", "T2", "U2")],
      skills: skillsOf(skill("U1", "misconception"), skill("U2", "shaky")),
    }));
    expect(plan.focus?.topicId).toBe("T2");
    expect(plan.focus?.score).toBe(0.125);

    const offOnly = planDay(base({
      topics: [topic("T1", "U1", 4, 4, ["CCSE-II"])],
      questions: [q("a1", "T1", "U1")],
      skills: skillsOf(skill("U1", "misconception")),
    }));
    expect(offOnly.focus).toBeNull();
  });

  it("a unit with no skill state counts as insufficient and says so", () => {
    const plan = planDay(base({
      topics: [topic("T1", "U1", 2, 4)],
      questions: [q("a1", "T1", "U1")],
    }));
    expect(plan.focus).toMatchObject({ box: "insufficient", weakness: WEAKNESS.insufficient, frequency: 0.5, score: 0.3 });
    expect(plan.focus?.why).toBe("Not diagnosed yet · asked in 2 of 4 papers · on your CCSE-IV path");

    const withState = planDay(base({
      topics: [topic("T1", "U1", 2, 4)],
      questions: [q("a1", "T1", "U1")],
      skills: skillsOf(skill("U1", "insufficient")),
    }));
    expect(withState.focus?.why).toBe("Not diagnosed yet: 6 of 10 answers so far · asked in 2 of 4 papers · on your CCSE-IV path");
  });

  it("skips topics with no active question", () => {
    const plan = planDay(base({
      topics: [topic("T1", "U1", 1, 1), topic("T2", "U2", 1, 1), topic("T3", "U3", 1, 1)],
      questions: [q("a1", "T1", "U1", { status: "deleted" }), q("b1", "T2", "U2")],
      skills: skillsOf(skill("U1", "misconception"), skill("U2", "shaky"), skill("U3", "misconception")),
    }));
    expect(plan.focus?.topicId).toBe("T2");
  });
});

describe("focus tie-breaks and null focus", () => {
  const topics = [topic("T2", "U2", 1, 1), topic("T1", "U1", 1, 1)];
  const questions = [q("a1", "T1", "U1"), q("b1", "T2", "U2")];
  const skills = skillsOf(skill("U1", "weak"), skill("U2", "weak"));

  it("equal scores: more open mistakes wins", () => {
    const plan = planDay(base({
      topics, questions, skills,
      mistakes: mistakesOf(
        mistake("c1", "T1", "fixed", "2026-11-01"),
        mistake("c2", "T1", "fixed", "2026-11-01"),
        mistake("c3", "T2", "spaced", "2026-11-01"),
      ),
    }));
    expect(plan.focus?.topicId).toBe("T2");
  });

  it("equal scores and mistakes: topicId ascending", () => {
    expect(planDay(base({ topics, questions, skills })).focus?.topicId).toBe("T1");
  });

  it("no topic scores above 0: focus null, empty practice set", () => {
    const plan = planDay(base({
      topics: [topic("T1", "U1", 1, 1), topic("T2", "U2", 0, 0)],
      questions: [q("a1", "T1", "U1"), q("b1", "T2", "U2")],
      skills: skillsOf(skill("U1", "strong")),
      cards: cardsOf(card("q:a1", "2026-11-20")),
    }));
    expect(plan.focus).toBeNull();
    expect(plan.mode).toBe("practice");
    expect(plan.practiceSet).toEqual([]);
    expect(plan.olderTopicQuestionIds).toEqual([]);
    expect(plan.review.cardIds).toEqual(["q:a1"]);
    expect(plan.quick).toEqual(["a1"]);
    expect(planDay(base({})).focus).toBeNull();
  });
});

describe("diagnostic mode", () => {
  it("serves up to 20 never-answered active questions from the focus unit, by id", () => {
    const ids = range("u", 25);
    const questions = [
      ...ids.map((id, i) => q(id, i % 2 ? "T1" : "T1b", "U1")),
      q("u99", "T1", "U1", { status: "deleted" }),
      q("aa-other-unit", "T9", "U9"),
    ];
    const answers = [wrong("u00", "2026-11-20T05:00:00Z"), right("u03", "2026-11-24T05:00:00Z")];
    const plan = planDay(base({
      topics: [topic("T1", "U1", 1, 1), topic("T1b", "U1", 1, 2), topic("T9", "U9", 1, 2)],
      questions, answers,
      skills: skillsOf(skill("U9", "shaky")),
    }));
    expect(plan.focus?.topicId).toBe("T1");
    expect(plan.mode).toBe("diagnostic");
    const expected = ids.filter((id) => id !== "u00" && id !== "u03").slice(0, DIAGNOSTIC_SIZE);
    expect(plan.practiceSet).toEqual(expected);
    expect(plan.practiceSet).toHaveLength(20);
    expect(plan.practiceSet).not.toContain("u99");
    expect(plan.olderTopicQuestionIds).toEqual([]);
  });
});

describe("AT-C11: practice set interleaves 2-3 older-topic questions", () => {
  const YESTERDAY = "2026-11-23T05:00:00Z";
  const setup = (focusCount: number, olderCount: number) => {
    const focusIds = range("f", focusCount);
    const olderIds = range("o", olderCount);
    const questions = [
      ...focusIds.map((id) => q(id, "F", "UF")),
      ...olderIds.map((id) => q(id, "O", "UO")),
      q("o-deleted", "O", "UO", { status: "deleted" }),
    ];
    // Topic O is "older" only through its answered questions (and the deleted one, which never gets picked).
    const answers = [...olderIds.map((id) => right(id, YESTERDAY)), right("o-deleted", YESTERDAY)];
    return planDay(base({
      topics: [topic("F", "UF", 1, 1), topic("O", "UO", 1, 1)],
      questions, answers,
      skills: skillsOf(skill("UF", "weak"), skill("UO", "strong")),
    }));
  };

  for (const [available, expectedOlder] of [[0, 0], [1, 1], [2, 2], [5, 3]]) {
    it(`${available} older available -> ${expectedOlder} older questions, set of ${PRACTICE_SIZE}`, () => {
      const plan = setup(20, available);
      expect(plan.mode).toBe("practice");
      expect(plan.olderTopicQuestionIds).toHaveLength(expectedOlder);
      expect(plan.practiceSet).toHaveLength(PRACTICE_SIZE);
      expect(plan.practiceSet.slice(PRACTICE_SIZE - expectedOlder)).toEqual(plan.olderTopicQuestionIds);
      expect(plan.practiceSet.slice(0, PRACTICE_SIZE - expectedOlder)).toEqual(range("f", PRACTICE_SIZE - expectedOlder));
      expect(plan.practiceSet).not.toContain("o-deleted");
    });
  }

  it("never pads with extra older questions when the focus topic runs short", () => {
    const plan = setup(4, 5);
    expect(plan.olderTopicQuestionIds).toHaveLength(3);
    expect(plan.practiceSet).toEqual([...range("f", 4), ...plan.olderTopicQuestionIds]);
  });

  it("orders older picks: open mistake, then latest wrong, then longest-ago answered, then id", () => {
    const questions = [
      q("f1", "F", "UF"),
      q("o-old", "O", "UO"), q("o-new", "O", "UO"), q("o-wrong", "O", "UO"),
      q("o-mist", "O2", "UO", { conceptId: "cM" }), q("o-never", "O", "UO"), q("o-new2", "O", "UO"),
      q("t-today", "T", "UT"),
    ];
    const answers = [
      right("o-old", "2026-11-01T05:00:00Z"),
      right("o-new", "2026-11-23T05:00:00Z"),
      right("o-new2", "2026-11-23T05:00:00Z"),
      wrong("o-wrong", "2026-11-22T05:00:00Z"),
      right("o-mist", "2026-11-23T06:00:00Z"),
      right("t-today", "2026-11-24T05:00:00Z"), // topic T was only answered today: not an older topic
    ];
    const input = base({
      topics: [topic("F", "UF", 1, 1)], questions, answers,
      skills: skillsOf(skill("UF", "weak")),
      mistakes: mistakesOf(mistake("cM", "O2", "spaced", "2026-11-20")),
    });
    const plan = planDay(input);
    expect(plan.olderTopicQuestionIds).toEqual(["o-mist", "o-wrong", "o-old"]);
    expect(plan.practiceSet).toEqual(["f1", "o-mist", "o-wrong", "o-old"]);

    // Remove the open mistake and the wrong one: longest-ago first, then id, never-answered last.
    const plan2 = planDay({ ...input, mistakes: new Map(), answers: answers.filter((a) => a.questionId !== "o-wrong") });
    expect(plan2.olderTopicQuestionIds).toEqual(["o-old", "o-new", "o-new2"]);
  });

  it("orders focus picks: never answered, latest wrong, correct but not sure; skips correct and sure", () => {
    const questions = ["fa", "fb", "fc", "fd", "fe", "ff"].map((id) => q(id, "F", "UF"));
    const answers = [
      right("fa", "2026-11-20T05:00:00Z", "guess"),
      wrong("fb", "2026-11-20T05:00:00Z"),
      right("fc", "2026-11-20T05:00:00Z", "sure"),
      wrong("fd", "2026-11-19T05:00:00Z"), right("fd", "2026-11-20T05:00:00Z", "none"),
      right("fe", "2026-11-19T05:00:00Z"), wrong("fe", "2026-11-20T05:00:00Z", "guess"),
    ];
    const plan = planDay(base({
      topics: [topic("F", "UF", 1, 1)], questions, answers,
      skills: skillsOf(skill("UF", "shaky")),
    }));
    expect(plan.practiceSet).toEqual(["ff", "fb", "fe", "fa", "fd"]);
    expect(plan.olderTopicQuestionIds).toEqual([]);
  });
});

describe("AT-C10: review queue fits after missed days", () => {
  it("60 due cards and 15 retests -> 20 items, retests first, estMinutes <= 10", () => {
    const cards = range("c", 60).map((id, i) => card(`q:${id}`, `2026-11-${String(10 + (i % 11)).padStart(2, "0")}`));
    const questions = range("c", 60).map((id) => q(id, "X", "UX"));
    const retests = range("m", 15).map((id, i) => mistake(id, "X", "logged", `2026-11-${String(21 + (i % 3)).padStart(2, "0")}`, [`${id}-q`]));
    const plan = planDay(base({
      questions: [...questions, ...range("m", 15).map((id) => q(`${id}-q`, "X", "UX"))],
      cards: cardsOf(...cards, card("q:c-future", "2026-11-25")),
      mistakes: mistakesOf(
        ...retests,
        mistake("not-yet", "X", "logged", "2026-11-25"),
        mistake("spaced", "X", "spaced", "2026-11-20"),
        mistake("fixed", "X", "fixed", "2026-11-20"),
      ),
    }));
    const { retestConceptIds, cardIds, estMinutes, questionIds } = plan.review;
    expect(retestConceptIds.length + cardIds.length).toBe(20);
    expect(questionIds).toHaveLength(20);
    expect(estMinutes).toBe(10);
    expect(estMinutes).toBeLessThanOrEqual(MAX_REVIEW_MINUTES);
    expect(retestConceptIds).toHaveLength(15);
    const expectedRetests = [...retests].sort((a, b) => (a.retestDay + a.conceptId < b.retestDay + b.conceptId ? -1 : 1)).map((m) => m.conceptId);
    expect(retestConceptIds).toEqual(expectedRetests);
    // Most overdue first: dueDay 2026-11-10 holds c00, c11, c22, c33, c44, c55.
    expect(cardIds).toEqual(["q:c00", "q:c11", "q:c22", "q:c33", "q:c44"]);
    expect(plan.quick).toEqual(expectedRetests.slice(0, 5).map((id) => `${id}-q`)); // retest questions come first
  });

  it("retests alone can fill the cap", () => {
    const plan = planDay(base({
      questions: range("m", 25).map((id) => q(`${id}-q`, "X", "UX")),
      mistakes: mistakesOf(...range("m", 25).map((id) => mistake(id, "X", "logged", "2026-11-20", [`${id}-q`]))),
      cards: cardsOf(card("f:1", "2026-11-01")),
    }));
    expect(plan.review.retestConceptIds).toEqual(range("m", 20));
    expect(plan.review.cardIds).toEqual([]);
    expect(plan.review.estMinutes).toBe(10);
  });

  it("orders due cards by dueDay, then due, then cardId; rounds estMinutes up", () => {
    const plan = planDay(base({
      questions: [q("a", "X", "UX"), q("b", "X", "UX"), q("c", "X", "UX")],
      cards: cardsOf(
        card("q:c", "2026-11-24", "2026-11-23T20:00:00Z"),
        card("q:b", "2026-11-23", "2026-11-23T05:00:00Z"),
        card("q:a", "2026-11-23", "2026-11-23T05:00:00Z"),
        card("f:z", "2026-11-23", "2026-11-23T01:00:00Z"),
      ),
    }));
    expect(plan.review.cardIds).toEqual(["f:z", "q:a", "q:b", "q:c"]);
    expect(plan.review.estMinutes).toBe(2);
    expect(planDay(base({ questions: [q("a", "X", "UX")], mistakes: mistakesOf(mistake("m", null, "logged", TODAY, ["a"])) })).review.estMinutes).toBe(1);
    // a retest whose questions are gone has nothing to serve and is not queued
    expect(planDay(base({ mistakes: mistakesOf(mistake("m", null, "logged", TODAY, ["gone"])) })).review.retestConceptIds).toEqual([]);
    expect(planDay(base({})).review).toEqual({ retestConceptIds: [], cardIds: [], questionIds: [], estMinutes: 0 });
  });
});

describe("quick session", () => {
  it("takes card questions first, then practice order, de-duplicated, capped at 5", () => {
    const questions = [...range("f", 6).map((id) => q(id, "F", "UF")), q("x", "X", "UX")];
    const plan = planDay(base({
      topics: [topic("F", "UF", 1, 1)], questions,
      skills: skillsOf(skill("UF", "weak")),
      cards: cardsOf(card("q:f01", "2026-11-20"), card("f:fact", "2026-11-19"), card("q:x", "2026-11-21")),
    }));
    expect(plan.practiceSet).toEqual(range("f", 6));
    expect(plan.review.cardIds).toEqual(["f:fact", "q:f01", "q:x"]);
    expect(plan.quick).toEqual(["f01", "x", "f00", "f02", "f03"]);
    expect(plan.quick).toHaveLength(QUICK_SIZE);
  });
});

describe("deleted questions are never chosen", () => {
  it("not in focus picks, older picks, review cards or quick", () => {
    const questions = [
      q("f1", "F", "UF"), q("f2", "F", "UF", { status: "deleted" }),
      q("o1", "O", "UO"), q("o2", "O", "UO", { status: "deleted", conceptId: "cO" }),
    ];
    const plan = planDay(base({
      topics: [topic("F", "UF", 1, 1)], questions,
      answers: [right("o1", "2026-11-23T05:00:00Z"), wrong("o2", "2026-11-23T05:00:00Z")],
      skills: skillsOf(skill("UF", "weak")),
      mistakes: mistakesOf(mistake("cO", "O", "spaced", "2026-11-24")),
      cards: cardsOf(card("q:o2", "2026-11-20"), card("q:gone", "2026-11-20"), card("q:o1", "2026-11-21")),
    }));
    expect(plan.practiceSet).toEqual(["f1", "o1"]);
    expect(plan.review.cardIds).toEqual(["q:o1"]);
    expect(plan.quick).toEqual(["o1", "f1"]);
  });
});

describe("AT-C2: deterministic replay", () => {
  it("same input -> deep-equal plan, whatever the event order", () => {
    const questions = [...range("f", 15).map((id) => q(id, "F", "UF")), ...range("o", 6).map((id) => q(id, "O", "UO"))];
    const answers = [
      wrong("f00", "2026-11-20T05:00:00Z"), right("f01", "2026-11-21T05:00:00Z", "guess"),
      right("o00", "2026-11-19T05:00:00Z"), wrong("o01", "2026-11-22T05:00:00Z"), right("o02", "2026-11-18T05:00:00Z"),
    ];
    const make = (a: AnswerGiven[]) => base({
      topics: [topic("F", "UF", 2, 3), topic("O", "UO", 3, 3)], questions, answers: a,
      skills: skillsOf(skill("UF", "weak"), skill("UO", "shaky")),
      mistakes: mistakesOf(mistake("O", "O", "logged", "2026-11-23"), mistake("F", "F", "logged", "2026-11-21")),
      cards: cardsOf(card("q:f00", "2026-11-22"), card("q:o01", "2026-11-23")),
    });
    const first = planDay(make(answers));
    expect(planDay(make([...answers].reverse()))).toEqual(first);
    expect(planDay(structuredClone(make(answers)))).toEqual(first);
    expect(first.date).toBe(TODAY);
  });
});
