import { describe, expect, it, vi } from "vitest";
import { MOCK_SECONDS } from "../../core/mock";
import { newDraft, remainingMs, type MockDraft } from "../mock";
import {
  choose, counts, formatClock, gridCells, isLowTime, move, setConfidence, spend, submitOnce, toggleFlag, type Carry,
} from "./mockrunner.helpers";

const ids = Array.from({ length: 200 }, (_, i) => `p_q${String(i + 1).padStart(3, "0")}`);
const START = "2026-11-22T04:00:00.000Z";
const t0 = Date.parse(START);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}
const fresh = (): MockDraft => deepFreeze(newDraft("m1", "p", ids, START));

describe("timer", () => {
  it("formats h:mm:ss", () => {
    expect(formatClock(MOCK_SECONDS * 1000)).toBe("3:00:00");
    expect(formatClock(9 * 60_000 + 59_000)).toBe("0:09:59");
    expect(formatClock(0)).toBe("0:00:00");
    expect(formatClock(-5000)).toBe("0:00:00");
    expect(formatClock(3 * 3600_000 - 1000)).toBe("2:59:59");
  });
  it("starts at 3:00:00 and reaches 0:00:00", () => {
    const d = fresh();
    expect(formatClock(remainingMs(d, t0))).toBe("3:00:00");
    expect(formatClock(remainingMs(d, t0 + MOCK_SECONDS * 1000 + 5000))).toBe("0:00:00");
  });
  it("turns amber under 10 minutes", () => {
    expect(isLowTime(10 * 60_000)).toBe(false);
    expect(isLowTime(10 * 60_000 - 1)).toBe(true);
    expect(isLowTime(0)).toBe(true);
  });
});

describe("choose and confidence", () => {
  it("defaults to guess and never mutates", () => {
    const d = fresh();
    const a = choose(d, ids[0], "B");
    expect(a).not.toBe(d);
    expect(d.answers).toEqual({});
    expect(a.answers[ids[0]]).toEqual({ chosen: "B", confidence: "guess", timeMs: 0 });
  });
  it("choosing the shaded option again changes nothing", () => {
    const a = choose(fresh(), ids[0], "B");
    expect(choose(a, ids[0], "B")).toBe(a);
  });
  it("E forces none and ignores confidence taps", () => {
    const a = deepFreeze(setConfidence(choose(fresh(), ids[0], "A"), ids[0], "sure"));
    const e = choose(a, ids[0], "E");
    expect(e.answers[ids[0]].confidence).toBe("none");
    expect(setConfidence(e, ids[0], "sure")).toBe(e);
  });
  it("can be changed like an OMR sheet; A–D keeps the given confidence, E→A resets to guess", () => {
    const a = deepFreeze(setConfidence(choose(fresh(), ids[0], "A"), ids[0], "sure"));
    expect(choose(a, ids[0], "C").answers[ids[0]]).toMatchObject({ chosen: "C", confidence: "sure" });
    const e = deepFreeze(choose(a, ids[0], "E"));
    expect(choose(e, ids[0], "D").answers[ids[0]]).toMatchObject({ chosen: "D", confidence: "guess" });
  });
  it("confidence needs an answer", () => {
    const d = fresh();
    expect(setConfidence(d, ids[0], "sure")).toBe(d);
  });
});

describe("flags", () => {
  it("toggles and keeps paper order", () => {
    let d = fresh();
    d = deepFreeze(toggleFlag(d, ids[50]));
    d = deepFreeze(toggleFlag(d, ids[3]));
    d = deepFreeze(toggleFlag(d, ids[120]));
    expect(d.marked).toEqual([ids[3], ids[50], ids[120]]);
    d = toggleFlag(d, ids[50]);
    expect(d.marked).toEqual([ids[3], ids[120]]);
    expect(counts(d).flagged).toBe(2);
  });
});

describe("time accounting", () => {
  it("accumulates across revisits", () => {
    let d: MockDraft = fresh();
    let carry: Carry = {};
    d = deepFreeze(choose(d, ids[0], "A"));
    ({ draft: d, carry } = move(d, carry, 1, 5000)); // 5 s on q1
    ({ draft: d, carry } = move(d, carry, 0, 3000)); // 3 s on q2, unanswered
    ({ draft: d, carry } = move(d, carry, 1, 4000)); // 4 s more on q1
    expect(d.answers[ids[0]].timeMs).toBe(9000);
    expect(d.index).toBe(1);
    // q2 answered on the second visit: the earlier 3 s count too
    d = choose(d, ids[1], "E");
    ({ draft: d, carry } = move(d, carry, 2, 2000));
    expect(d.answers[ids[1]].timeMs).toBe(5000);
    expect(carry).toEqual({});
  });
  it("clamps the index and ignores negative time", () => {
    const d = choose(fresh(), ids[0], "A");
    expect(move(d, {}, -1, 10).draft.index).toBe(0);
    expect(move(d, {}, 999, 10).draft.index).toBe(199);
    expect(spend(d, {}, ids[0], -50).draft).toBe(d);
  });
});

describe("grid", () => {
  it("marks answered, flagged and current", () => {
    let d = choose(fresh(), ids[2], "C");
    d = toggleFlag(d, ids[4]);
    d = { ...d, index: 7 };
    const cells = gridCells(d);
    expect(cells).toHaveLength(200);
    expect(cells[2]).toMatchObject({ n: 3, answered: true, flagged: false, current: false });
    expect(cells[4]).toMatchObject({ answered: false, flagged: true });
    expect(cells[7].current).toBe(true);
    expect(counts(d)).toEqual({ total: 200, answered: 1, unanswered: 199, flagged: 1 });
  });
});

describe("auto-submit", () => {
  it("fires once at zero, even when already at zero, and blocks a later manual submit", () => {
    const onSubmit = vi.fn();
    const submit = submitOnce(onSubmit);
    const d = fresh();
    const late = t0 + MOCK_SECONDS * 1000 + 60_000; // screen opened after time ran out
    for (const now of [late, late + 1000, late + 2000]) {
      if (remainingMs(d, now) === 0) submit(d, "timeout");
    }
    expect(submit(d, "manual")).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(d, "timeout");
  });
  it("does not fire before zero", () => {
    const onSubmit = vi.fn();
    const submit = submitOnce(onSubmit);
    const d = fresh();
    for (const now of [t0, t0 + 1000, t0 + MOCK_SECONDS * 1000 - 1]) {
      if (remainingMs(d, now) === 0) submit(d, "timeout");
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("review fix: countdown rounds up (AT-U6)", () => {
  it("shows 3:00:00 a few ms after the start and 0:00:01 just before zero", () => {
    expect(formatClock(10_800_000 - 7)).toBe("3:00:00");
    expect(formatClock(1)).toBe("0:00:01");
    expect(formatClock(0)).toBe("0:00:00");
  });
});
