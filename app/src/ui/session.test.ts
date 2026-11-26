import { describe, expect, it } from "vitest";
import { LEGACY_PAPER_ID, migrateProgress, migrateSession, newSession, progressKey, qualifyProgressKey } from "./session";

describe("progress keys", () => {
  it("are per paper and section", () => {
    expect(progressKey("ccse4_2024", "gs_apt")).toBe("ccse4_2024:gs_apt");
    expect(progressKey("ccse4_2024", "tamil")).not.toBe(progressKey("ccse4_2025", "tamil"));
  });

  it("a bare section key from before multi-paper bundles belongs to the 2025 paper", () => {
    expect(LEGACY_PAPER_ID).toBe("ccse4_2025");
    expect(qualifyProgressKey("tamil")).toBe("ccse4_2025:tamil");
    expect(qualifyProgressKey("ccse4_2024:tamil")).toBe("ccse4_2024:tamil");
  });
});

describe("migrateProgress", () => {
  it("moves bare keys to the 2025 paper and keeps per-paper keys", () => {
    expect(migrateProgress({ tamil: 12, gs_apt: 40, "ccse4_2024:tamil": 3 })).toEqual({
      "ccse4_2025:tamil": 12,
      "ccse4_2025:gs_apt": 40,
      "ccse4_2024:tamil": 3,
    });
  });

  it("prefers an existing per-paper key over a stale bare one", () => {
    expect(migrateProgress({ "ccse4_2025:tamil": 50, tamil: 12 })).toEqual({ "ccse4_2025:tamil": 50 });
    expect(migrateProgress({ tamil: 12, "ccse4_2025:tamil": 50 })).toEqual({ "ccse4_2025:tamil": 50 });
  });

  it("is a no-op on migrated or empty progress", () => {
    const done = { "ccse4_2025:tamil": 12, "ccse4_2024:gs_apt": 7 };
    expect(migrateProgress(done)).toEqual(done);
    expect(migrateProgress(migrateProgress({ tamil: 1 }))).toEqual({ "ccse4_2025:tamil": 1 });
    expect(migrateProgress({})).toEqual({});
  });
});

describe("migrateSession", () => {
  const at = "2026-11-22T10:00:00.000Z";
  it("qualifies a stored paper session's bare section so resuming updates the 2025 key", () => {
    const old = { ...newSession("paper", "Tamil", ["q1", "q2"], at, "s1", "tamil"), index: 1 };
    expect(migrateSession(old)).toEqual({ ...old, paperSection: "ccse4_2025:tamil" });
  });

  it("leaves new paper sessions and other kinds alone", () => {
    const fresh = newSession("paper", "Group 4 2024: Tamil", ["q1"], at, "s2", progressKey("ccse4_2024", "tamil"));
    expect(migrateSession(fresh)).toBe(fresh);
    const quick = newSession("quick", "Quick", ["q1"], at, "s3");
    expect(migrateSession(quick)).toBe(quick);
  });
});
