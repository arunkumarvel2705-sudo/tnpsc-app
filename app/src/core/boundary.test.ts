import { describe, expect, it } from "vitest";

// Spec rule: core/ imports nothing from ui/ or sync/, never reads the clock, and has no randomness.
const files = import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("core boundary", () => {
  for (const [path, src] of Object.entries(files)) {
    if (path.endsWith(".test.ts")) continue;
    it(`${path} stays pure`, () => {
      expect(src).not.toMatch(/from\s+["']\.\.\/(ui|sync)/);
      expect(src).not.toMatch(/Date\.now\(|new Date\(\)|Math\.random\(/);
      expect(src).not.toMatch(/\bfetch\(|localStorage/);
    });
  }
});
