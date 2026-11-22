import { describe, expect, it } from "vitest";
import { mistakeStates, openMistakes } from "./mistakes";
import type { AnswerGiven, ErrorTagged, LearningEvent, Question } from "./types";

const q = (
  id: string,
  accepted: Question["accepted"],
  opts: { conceptId?: string; topicId?: string; unitId?: string; status?: Question["status"] } = {},
): Question => ({
  id, n: 1, section: "gs_apt", accepted, keyStatus: "final", status: opts.status ?? "active",
  conceptId: opts.conceptId, topicId: opts.topicId, unitId: opts.unitId,
  paperId: "P", source: { exam: "CCSE-IV", year: 2025, paper: "P", qNo: 1, pdfRef: "x.pdf", page: 1 },
});
const qmap = (...qs: Question[]) => new Map(qs.map((x) => [x.id, x]));

/** Day n after 2026-11-01, at 10:00 IST (04:30 UTC). */
const at = (n: number, time = "04:30:00") => {
  const d = new Date(Date.UTC(2026, 10, 1 + n));
  return `${d.toISOString().slice(0, 10)}T${time}Z`;
};

let seq = 0;
const ans = (questionId: string, chosen: AnswerGiven["chosen"], confidence: AnswerGiven["confidence"], when: string): AnswerGiven => ({
  type: "answer", eventId: `e${String(seq++).padStart(4, "0")}`, deviceId: "phone", at: when, schemaVersion: 1, sessionId: "s1",
  questionId, chosen, confidence, timeMs: 1000, mode: "practice", contentVersion: "v1",
});
const tag = (answer: AnswerGiven, reason: ErrorTagged["reason"], when: string): ErrorTagged => ({
  type: "errorTag", eventId: `e${String(seq++).padStart(4, "0")}`, deviceId: "phone", at: when, schemaVersion: 1, sessionId: "s1",
  answerEventId: answer.eventId, questionId: answer.questionId, reason,
});

// Two questions on the same concept, one on another, one deleted.
const Q = qmap(
  q("q1", ["A"], { conceptId: "c1", topicId: "t1", unitId: "u1" }),
  q("q2", ["A"], { conceptId: "c1", topicId: "t1", unitId: "u1" }),
  q("q3", ["A"], { conceptId: "c2", topicId: "t2", unitId: "u1" }),
  q("qd", ["A"], { conceptId: "c3", status: "deleted" }),
);
const state = (log: LearningEvent[], key = "c1", qs = Q) => mistakeStates(log, qs).get(key);

describe("AT-C5: choosing E", () => {
  it("logs a mistake but never sets misconception", () => {
    const s = state([ans("q1", "E", "none", at(0)), ans("q2", "E", "none", at(1))]);
    expect(s).toMatchObject({ stage: "logged", misconception: false, episodes: 1 });
  });
  it("holds even if a raw E event carries 'sure'", () => {
    const s = state([ans("q1", "E", "sure", at(0))]);
    expect(s).toMatchObject({ stage: "logged", misconception: false });
  });
});

describe("AT-C6: misconceptions need a transfer", () => {
  it("same-question streak over 14+ days stays unfixed; a different question fixes it", () => {
    const log = [
      ans("q1", "B", "sure", at(0)),
      ans("q1", "A", "sure", at(1)),
      ans("q1", "A", "sure", at(8)),
      ans("q1", "A", "sure", at(15)),
    ];
    const before = state(log)!;
    expect(before).toMatchObject({
      stage: "spaced", misconception: true, streak: 3, streakStartDay: "2026-11-02", transferDone: false, fixedAt: null,
    });
    const transfer = ans("q2", "A", "sure", at(16));
    const after = state([...log, transfer])!;
    expect(after).toMatchObject({ stage: "fixed", streak: 4, transferDone: true, fixedAt: transfer.at });
  });
  it("wrong + sure sets misconception", () => {
    expect(state([ans("q1", "C", "sure", at(0))])!.misconception).toBe(true);
  });
  it("an open episode keeps misconception once set (||=)", () => {
    const s = state([ans("q1", "C", "sure", at(0)), ans("q2", "C", "guess", at(1))])!;
    expect(s).toMatchObject({ misconception: true, wrongQuestionIds: ["q1", "q2"], episodes: 1 });
  });
});

describe("AT-C7: wrong at the spaced stage", () => {
  it("resets to logged with streak 0", () => {
    const wrong = ans("q2", "B", "guess", at(5));
    const s = state([ans("q1", "B", "guess", at(0)), ans("q1", "A", "sure", at(1)), ans("q1", "A", "sure", at(3)), wrong])!;
    expect(s).toMatchObject({
      stage: "logged", streak: 0, streakStartDay: null, transferDone: false,
      loggedDay: "2026-11-06", retestDay: "2026-11-07", lastWrongAt: wrong.at, lastWrongEventId: wrong.eventId,
      wrongQuestionIds: ["q1", "q2"], episodes: 1,
    });
  });
});

describe("retest timing", () => {
  it("ignores correct + sure on the logged day", () => {
    const s = state([ans("q1", "B", "guess", at(0)), ans("q1", "A", "sure", at(0, "10:00:00"))])!;
    expect(s).toMatchObject({ stage: "logged", streak: 0, streakStartDay: null });
  });
  it("counts from the next IST day: 18:30 UTC is IST midnight", () => {
    // 18:29 UTC on 1 Nov is 23:59 IST on 1 Nov; 18:30 UTC is 00:00 IST on 2 Nov.
    const s = state([ans("q1", "B", "guess", "2026-11-01T18:29:00Z"), ans("q1", "A", "sure", "2026-11-01T18:30:00Z")])!;
    expect(s).toMatchObject({ loggedDay: "2026-11-01", retestDay: "2026-11-02", stage: "spaced", streak: 1, streakStartDay: "2026-11-02" });
  });
  it("a wrong at 18:30 UTC belongs to the next IST day", () => {
    const s = state([ans("q1", "B", "guess", "2026-11-01T18:30:00Z"), ans("q1", "A", "sure", "2026-11-02T18:29:00Z")])!;
    expect(s).toMatchObject({ loggedDay: "2026-11-02", retestDay: "2026-11-03", stage: "logged", streak: 0 });
  });
});

describe("spacing and fixing", () => {
  it("three sure answers spanning only 13 days stay spaced", () => {
    const s = state([ans("q1", "B", "guess", at(0)), ans("q1", "A", "sure", at(1)), ans("q1", "A", "sure", at(7)), ans("q1", "A", "sure", at(14))])!;
    expect(s).toMatchObject({ stage: "spaced", streak: 3, fixedAt: null });
  });
  it("a non-misconception mistake is fixed without a transfer", () => {
    const last = ans("q1", "A", "sure", at(15));
    const s = state([ans("q1", "B", "guess", at(0)), ans("q1", "A", "sure", at(1)), ans("q1", "A", "sure", at(8)), last])!;
    expect(s).toMatchObject({ stage: "fixed", misconception: false, transferDone: false, streak: 3, fixedAt: last.at });
  });
  it("correct + guess resets the streak but not the stage", () => {
    const s = state([ans("q1", "B", "guess", at(0)), ans("q1", "A", "sure", at(1)), ans("q1", "A", "sure", at(2)), ans("q1", "A", "guess", at(3))])!;
    expect(s).toMatchObject({ stage: "spaced", streak: 0, streakStartDay: null });
    // The streak restarts from the next sure answer.
    const s2 = state([ans("q1", "B", "guess", at(0)), ans("q1", "A", "sure", at(1)), ans("q1", "A", "none", at(2)), ans("q1", "A", "sure", at(4))])!;
    expect(s2).toMatchObject({ stage: "spaced", streak: 1, streakStartDay: "2026-11-05" });
  });
  it("correct answers with no open mistake do nothing", () => {
    expect(mistakeStates([ans("q1", "A", "sure", at(0)), ans("q3", "A", "guess", at(1))], Q).size).toBe(0);
  });
  it("wrong after fixed opens a new episode", () => {
    const fixedLog = [ans("q1", "B", "sure", at(0)), ans("q2", "A", "sure", at(1)), ans("q1", "A", "sure", at(8)), ans("q1", "A", "sure", at(15))];
    expect(state(fixedLog)!.stage).toBe("fixed");
    const s = state([...fixedLog, ans("q1", "A", "sure", at(16)), ans("q2", "E", "none", at(20))])!;
    expect(s).toMatchObject({
      stage: "logged", episodes: 2, misconception: false, streak: 0, streakStartDay: null,
      transferDone: false, wrongQuestionIds: ["q2"], fixedAt: null, loggedDay: "2026-11-21",
    });
  });
});

describe("content", () => {
  it("ignores deleted questions and questions missing from content", () => {
    const states = mistakeStates([ans("qd", "B", "sure", at(0)), ans("gone", "B", "sure", at(0))], Q);
    expect(states.size).toBe(0);
  });
  it("re-scores when the key changes (AT-C3 spirit)", () => {
    const log = [ans("q3", "A", "sure", at(0))];
    expect(mistakeStates(log, Q).size).toBe(0);
    const rekeyed = qmap(q("q3", ["B"], { conceptId: "c2", topicId: "t2", unitId: "u1" }));
    expect(mistakeStates(log, rekeyed).get("c2")).toMatchObject({ stage: "logged", misconception: true });
    const all = qmap(q("q3", "ALL", { conceptId: "c2" }));
    expect(mistakeStates([ans("q3", "E", "none", at(0))], all).size).toBe(0);
  });
  it("keys by concept, then topic, then question id, and carries topic and unit", () => {
    const qs = qmap(q("x", ["A"], { topicId: "tx", unitId: "ux" }), q("y", ["A"]));
    const states = mistakeStates([ans("x", "B", "guess", at(0)), ans("y", "B", "guess", at(0))], qs);
    expect([...states.keys()].sort()).toEqual(["tx", "y"]);
    expect(states.get("tx")).toMatchObject({ conceptId: "tx", topicId: "tx", unitId: "ux" });
    expect(states.get("y")).toMatchObject({ topicId: null, unitId: null });
    expect(state([ans("q1", "B", "guess", at(0))])).toMatchObject({ conceptId: "c1", topicId: "t1", unitId: "u1" });
  });
});

describe("reason", () => {
  it("comes from the latest ErrorTagged on lastWrongEventId", () => {
    const w1 = ans("q1", "B", "guess", at(0));
    const w2 = ans("q2", "B", "guess", at(2));
    const log = [w1, tag(w1, "careless", at(0, "05:00:00")), w2];
    expect(state(log)!.reason).toBeNull(); // the tag explains an older miss
    expect(state([...log, tag(w2, "misread", at(2, "05:00:00")), tag(w2, "concept", at(2, "06:00:00"))])!.reason).toBe("concept");
  });
});

describe("openMistakes", () => {
  it("orders misconceptions first, then retestDay, then conceptId, and drops fixed", () => {
    const qs = qmap(
      q("a", ["A"], { conceptId: "ca" }), q("b", ["A"], { conceptId: "cb" }), q("c", ["A"], { conceptId: "cc" }),
      q("d", ["A"], { conceptId: "cd" }), q("f", ["A"], { conceptId: "cf" }),
    );
    const log = [
      ans("f", "B", "guess", at(0)), ans("f", "A", "sure", at(1)), ans("f", "A", "sure", at(8)), ans("f", "A", "sure", at(15)),
      ans("b", "B", "guess", at(3)),
      ans("a", "B", "guess", at(3)),
      ans("c", "B", "sure", at(5)),
      ans("d", "B", "guess", at(1)),
    ];
    const open = openMistakes(mistakeStates(log, qs));
    expect(open.map((s) => s.conceptId)).toEqual(["cc", "cd", "ca", "cb"]);
  });
});

describe("AT-C2: replay", () => {
  it("gives deep-equal output whatever the input order", () => {
    const w = ans("q1", "B", "sure", at(0));
    const log: LearningEvent[] = [
      w, tag(w, "concept", at(0, "05:00:00")), ans("q1", "A", "sure", at(1)), ans("q3", "E", "none", at(2)),
      ans("q2", "A", "sure", at(8)), ans("q1", "A", "guess", at(9)), ans("q3", "A", "sure", at(4)),
    ];
    const a = mistakeStates(log, Q);
    const b = mistakeStates([...log].reverse(), Q);
    expect(b).toEqual(a);
    expect([...b.entries()]).toEqual([...a.entries()]);
    expect(mistakeStates(log, Q)).toEqual(a);
  });
});
