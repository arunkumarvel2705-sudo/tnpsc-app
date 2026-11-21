import { describe, expect, it } from "vitest";
import { addDays, daysBetween, localDay } from "./time";

describe("IST days", () => {
  it("rolls over at 18:30 UTC", () => {
    expect(localDay("2026-11-21T18:29:59Z")).toBe("2026-11-21");
    expect(localDay("2026-11-21T18:30:00Z")).toBe("2026-11-22");
  });
  it("counts whole days and adds across months", () => {
    expect(daysBetween("2026-11-01", "2026-11-15")).toBe(14);
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
});
