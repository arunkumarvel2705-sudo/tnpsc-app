// Calendar days in India Standard Time. core/ never reads the system clock: callers pass times in.
// A "day" is a YYYY-MM-DD string in IST (UTC+05:30, no daylight saving).

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The IST calendar day of an ISO timestamp, e.g. "2026-11-21T20:00:00Z" -> "2026-11-22". */
export function localDay(at: string): string {
  const t = Date.parse(at);
  if (Number.isNaN(t)) throw new Error(`Bad timestamp: ${at}`);
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function dayToUtcMs(day: string): number {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Bad day: ${day}`);
  return t;
}

/** Whole days from a to b (b - a). daysBetween("2026-11-01", "2026-11-15") === 14. */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayToUtcMs(b) - dayToUtcMs(a)) / DAY_MS);
}

/** addDays("2026-11-30", 1) === "2026-12-01". */
export function addDays(day: string, n: number): string {
  return new Date(dayToUtcMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}
