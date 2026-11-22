import { describe, expect, it } from "vitest";
import type { AnswerGiven, ContentBundle, ErrorTagged, Question } from "../../core/types";
import { closeView, nextLine, REASONS, snippet } from "./close.helpers";

const q = (n: number, section: Question["section"], extra: Partial<Question> = {}): Question => ({
  id: `p_q${n}`, n, section,
  en: { stem: `English stem ${n}`, options: { A: "a", B: "b", C: "c", D: "d", E: "Answer not known" } },
  ta: section === "tamil" ? { stem: `தமிழ் வினா ${n}`, options: { A: "a", B: "b", C: "c", D: "d", E: "விடை தெரியவில்லை" } } : undefined,
  accepted: ["A"], keyStatus: "final", status: "active",
  source: { exam: "X", year: 2025, paper: "P", qNo: n, pdfRef: "p.pdf", page: 1 },
  ...extra,
});

const bundle: ContentBundle = {
  version: "v1", builtAt: "2025-01-01", papers: [], units: [],
  questions: [
    q(1, "tamil"), q(2, "tamil"), q(101, "gs_apt"), q(102, "gs_apt"), q(103, "gs_apt", { accepted: ["B", "C"] }),
    q(104, "gs_apt", { status: "deleted" }), q(105, "gs_apt", { accepted: "ALL" }),
  ],
};

let seq = 0;
const ans = (qn: number, chosen: AnswerGiven["chosen"], confidence: AnswerGiven["confidence"], sessionId = "s1"): AnswerGiven => {
  seq++;
  return {
    type: "answer", eventId: `e${String(seq).padStart(3, "0")}`, deviceId: "d", at: `2025-01-01T10:${String(seq).padStart(2, "0")}:00.000Z`,
    schemaVersion: 1, sessionId, questionId: `p_q${qn}`, chosen, confidence, timeMs: 1000, mode: "practice", contentVersion: "v1",
  };
};
const tag = (a: AnswerGiven, reason: ErrorTagged["reason"], minute: number): ErrorTagged => ({
  type: "errorTag", eventId: `t${minute}`, deviceId: "d", at: `2025-01-01T11:${String(minute).padStart(2, "0")}:00.000Z`,
  schemaVersion: 1, sessionId: "s1", answerEventId: a.eventId, questionId: a.questionId, reason,
});

const ids = ["p_q1", "p_q2", "p_q101", "p_q102", "p_q103", "p_q104", "p_q105"];

describe("closeView", () => {
  it("counts only this session's latest answers, using the current key", () => {
    const other = ans(101, "B", "sure", "s0"); // another session: ignored
    const first = ans(1, "B", "sure"); // superseded by the retry below
    const log = [
      other, first,
      ans(1, "A", "sure"), // correct, sure
      ans(2, "A", "guess"), // correct, guessed
      ans(101, "C", "sure"), // wrong while sure
      ans(102, "E", "none"), // wrong, not known
      ans(103, "C", "guess"), // correct (multiple accepted)
      ans(104, "B", "sure"), // deleted: unscored
      ans(105, "D", "guess"), // ALL: correct
    ];
    const v = closeView("s1", ids, bundle, log);
    expect(v.summary).toMatchObject({ answered: 7, scored: 6, correct: 4, sureCorrect: 1, luckyGuesses: 3, misconceptions: 1 });
    expect(v.slips.map((s) => s.questionId)).toEqual(["p_q101", "p_q102"]);
  });

  it("puts wrong-while-sure first, then keeps session order", () => {
    const log = [ans(1, "B", "guess"), ans(2, "C", "none"), ans(101, "B", "sure"), ans(102, "D", "guess"), ans(103, "A", "sure")];
    const v = closeView("s1", ids, bundle, log);
    expect(v.slips.map((s) => [s.n, s.sure])).toEqual([[101, true], [103, true], [1, false], [2, false], [102, false]]);
  });

  it("describes each slip: Tamil snippet for Tamil questions, chosen vs key", () => {
    const log = [ans(1, "C", "guess"), ans(103, "E", "none")];
    const [t, g] = closeView("s1", ids, bundle, log).slips;
    expect(t).toMatchObject({ n: 1, lang: "ta", snippet: "தமிழ் வினா 1", chosen: "C", key: "A", sure: false, tag: null });
    expect(g).toMatchObject({ n: 103, lang: "en", snippet: "English stem 103", chosen: "E", key: "B / C" });
  });

  it("shows the latest tag for the latest answer only", () => {
    const old = ans(101, "B", "guess");
    const now = ans(101, "C", "sure");
    const log = [old, now, tag(old, "time", 1), tag(now, "careless", 2), tag(now, "concept", 3)];
    const [row] = closeView("s1", ids, bundle, log).slips;
    expect(row).toMatchObject({ answerEventId: now.eventId, tag: "concept", sure: true });
  });

  it("handles a session with no answers", () => {
    const v = closeView("empty", ids, bundle, [ans(1, "B", "sure")]);
    expect(v.summary.answered).toBe(0);
    expect(v.slips).toEqual([]);
    expect(nextLine(v)).toMatch(/Nothing was answered/);
  });
});

describe("nextLine", () => {
  it("says the misses come back tomorrow, or that there are none", () => {
    expect(nextLine(closeView("s1", ids, bundle, [ans(1, "B", "sure"), ans(2, "B", "sure")]))).toBe("These come back for a retest tomorrow.");
    expect(nextLine(closeView("s1", ids, bundle, [ans(1, "B", "sure")]))).toBe("This one comes back for a retest tomorrow.");
    expect(nextLine(closeView("s1", ids, bundle, [ans(1, "A", "sure")]))).toMatch(/No misses/);
  });
});

describe("snippet", () => {
  it("keeps one line, drops a match table's right column, and cuts long text at a word", () => {
    expect(snippet("Match  the\n following (a) x (b) y | 1. p 2. q")).toBe("Match the following (a) x (b) y");
    const long = "word ".repeat(60).trim();
    const s = snippet(long, 40);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(41);
    expect(s).not.toMatch(/ …$/);
  });
});

describe("REASONS", () => {
  it("offers the six reasons in order", () => {
    expect(REASONS.map((r) => r.reason)).toEqual(["concept", "careless", "misread", "time", "memory", "other"]);
  });
});
