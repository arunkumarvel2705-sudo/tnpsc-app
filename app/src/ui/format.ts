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
