// Turns the single-line question text from the bundle into readable lines. Presentation only.

/** Break before list markers: (i) (ii) (1) (a) [A] [R], "1. " items and Assertion/Reason labels. */
export function stemLines(stem: string): string[] {
  const marked = stem
    .replace(/\s+(?=(Assertion|Reason|Statement \d?|கூற்று|காரணம்)\s*(\[[AR]\])?\s*:)/g, "\n")
    .replace(/\s+(?=\((?:i{1,3}|iv|v|\d)\)\s)/g, "\n")
    .replace(/\s+(?=\d\.\s+[A-Z஀-௿])/g, "\n");
  return marked.split("\n").map((l) => l.trim()).filter(Boolean);
}

export interface MatchTable {
  intro: string;
  left: string[]; // (a)..(d)
  right: string[]; // 1..4
}

/** "intro (a) x (b) y … | 1. p 2. q …" → two columns. Returns null if the text does not split cleanly. */
export function matchTable(stem: string): MatchTable | null {
  const [lhs, rhs] = stem.split(" | ");
  if (!rhs) return null;
  const leftParts = lhs.split(/\s*\(([a-d])\)\s*/);
  const right = rhs.split(/\s*\d\.\s+/).map((s) => s.trim()).filter(Boolean);
  const left: string[] = [];
  for (let i = 2; i < leftParts.length; i += 2) left.push(leftParts[i].trim());
  if (left.length < 2 || right.length !== left.length) return null;
  return { intro: leftParts[0].trim(), left, right };
}

/** Language the learner reads General Studies in. Part A (Tamil) is always shown in Tamil. */
export type GsLang = "en" | "ta";

/**
 * Which language a question is shown in, and whether the learner can switch it. Part A is Tamil only.
 * Part B follows the learner's choice when the question has text in that language (2025 Part B has English
 * only), else the language it does have.
 */
export function questionLang(q: { section: "tamil" | "gs_apt"; en?: unknown; ta?: unknown }, pref: GsLang): { lang: GsLang; canSwitch: boolean } {
  if (q.section === "tamil") return { lang: q.ta ? "ta" : "en", canSwitch: false };
  const canSwitch = Boolean(q.en && q.ta);
  if (pref === "ta" && q.ta) return { lang: "ta", canSwitch };
  return { lang: q.en ? "en" : "ta", canSwitch };
}

/** Label for the switch button: names the language it switches to, in that language. */
export const switchLabel = (shown: GsLang) => (shown === "en" ? "தமிழில் படி" : "Read in English");
