// Pure display helpers for the Progress tab. No rules live here: lifecycle and box numbers come from core state.
import { conceptKey } from "../../core/content";
import type { MistakeState } from "../../core/mistakes";
import type { Box, SkillState } from "../../core/skillmap";
import { addDays, daysBetween, localDay } from "../../core/time";
import type { ContentBundle, ErrorReason, Question } from "../../core/types";

export const EXAM_QUESTIONS = 200;
/** Days a sure streak must span before a mistake counts as fixed (core/mistakes). Display only. */
export const FIX_DAYS = 14;
/** Sure answers in a row a mistake needs (core/mistakes). Display only. */
export const FIX_STREAK = 3;

export type Part = "Tamil" | "General Studies" | "Aptitude" | "Other";
const PART_ORDER: Part[] = ["Tamil", "General Studies", "Aptitude", "Other"];

export function partOf(unitId: string): Part {
  if (unitId.startsWith("ccse4.ta")) return "Tamil";
  if (unitId.startsWith("ccse4.gs")) return "General Studies";
  if (unitId.startsWith("ccse4.apt")) return "Aptitude";
  return "Other";
}

type Unit = ContentBundle["units"][number];

/** Units grouped by part in a fixed part order; bundle order is kept inside a part. Empty parts are dropped. */
export function groupUnits(units: Unit[]): { part: Part; weight: number; units: Unit[] }[] {
  return PART_ORDER.map((part) => {
    const us = units.filter((u) => partOf(u.id) === part);
    return { part, weight: us.reduce((n, u) => n + u.questions, 0), units: us };
  }).filter((g) => g.units.length > 0);
}

export const BOX_LABEL: Record<Box, string> = {
  misconception: "Misconception",
  weak: "Weak",
  shaky: "Shaky",
  strong: "Strong",
  insufficient: "Not enough data",
};

/** "12 answered · 50% correct · 4 of 6 right answers were sure". */
export function skillNumbers(s: SkillState): string {
  if (s.scored === 0) return "Not answered yet";
  const parts = [`${s.scored} answered`, `${Math.round(s.accuracy * 100)}% correct`];
  if (s.correct > 0) {
    const sure = Math.round(s.sureShare * s.correct);
    parts.push(`${sure} of ${s.correct} right ${s.correct === 1 ? "answer was" : "answers were"} sure`);
  }
  if (s.unresolvedMisconceptions > 0)
    parts.push(`${s.unresolvedMisconceptions} sure but wrong`);
  return parts.join(" · ");
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-24" -> "Tue 24 Nov". Days are calendar days, so no time zone is involved. */
export function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "today" / "tomorrow" / "Tue 24 Nov". A day already passed reads as today: it is due now. */
export function relativeDay(day: string, today: string): string {
  if (day <= today) return "today";
  if (day === addDays(today, 1)) return "tomorrow";
  return shortDay(day);
}

export function retestText(m: MistakeState, today: string): string {
  return `Retest from ${relativeDay(m.retestDay, today)}`;
}

/** Days the current sure streak has run, 0..14. */
export function streakDays(m: MistakeState, today: string): number {
  if (!m.streakStartDay) return 0;
  return Math.max(0, Math.min(FIX_DAYS, daysBetween(m.streakStartDay, today)));
}

export interface MistakeStatus {
  main: string; // one line
  parts: string[]; // main, split at " · " so the screen can wrap between parts
  streak?: number; // 0..3, spaced only
  days?: number; // 0..14, spaced only
  needsTransfer: boolean;
}

/** Plain status from MistakeState; numbers are read, never re-derived. */
export function mistakeStatus(m: MistakeState, today: string): MistakeStatus {
  const needsTransfer = m.misconception && !m.transferDone;
  if (m.stage === "spaced") {
    const days = streakDays(m, today);
    const parts = [`${m.streak} of ${FIX_STREAK} sure answers`, `${days} of ${FIX_DAYS} days`];
    return {
      main: parts.join(" · "),
      parts,
      streak: m.streak,
      days,
      needsTransfer,
    };
  }
  if (m.stage === "fixed") {
    const main = `Fixed${m.fixedAt ? ` on ${shortDay(localDay(m.fixedAt))}` : ""}`;
    return { main, parts: [main], needsTransfer: false };
  }
  const main = retestText(m, today);
  return { main, parts: [main], needsTransfer };
}

export const TRANSFER_NOTE = "needs one different question on this topic";

export const REASON_LABEL: Record<ErrorReason, string> = {
  concept: "Didn't know the idea",
  careless: "Careless slip",
  misread: "Misread the question",
  time: "Ran short of time",
  memory: "Forgot it",
  other: "Other reason",
};

/** "k_terms" -> "K terms". */
export function readableSegment(id: string): string {
  const last = id.split(".").pop() ?? id;
  const words = last.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

/** Topic name from the bundle when present, else "<unit name>: <readable topic>". Untagged: "Question <n>". */
export function mistakeName(m: MistakeState, bundle: ContentBundle, questions: Map<string, Question>): string {
  const topic = m.topicId ? bundle.topics?.find((t) => t.id === m.topicId) : undefined;
  if (topic) return topic.nameEn;
  const unit = m.unitId ? bundle.units.find((u) => u.id === m.unitId) : undefined;
  if (m.topicId) return unit ? `${unit.nameEn}: ${readableSegment(m.topicId)}` : readableSegment(m.topicId);
  if (unit) return unit.nameEn;
  const q = questions.get(m.wrongQuestionIds[0] ?? m.conceptId);
  return q ? `Question ${q.n}` : m.conceptId;
}

/** One line of the stem, Tamil text for Tamil questions. */
export function snippet(q: Question, max = 80): string {
  const text = q.section === "tamil" ? (q.ta ?? q.en) : (q.en ?? q.ta);
  const one = (text?.stem ?? "").replace(/\s+/g, " ").trim();
  if (!one) return q.hasFigure ? "(figure question)" : "";
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/** The questions to retest now: the missed ones, plus up to 3 other active questions on the same concept
 *  when a misconception still needs an answer on a different question. */
export function practiseIds(m: MistakeState, questions: Question[]): string[] {
  const ids = [...m.wrongQuestionIds];
  if (m.misconception && !m.transferDone && m.stage !== "fixed") {
    const missed = new Set(ids);
    const extra = questions
      .filter((q) => q.status === "active" && !missed.has(q.id) && conceptKey(q) === m.conceptId)
      .slice(0, 3)
      .map((q) => q.id);
    ids.push(...extra);
  }
  return ids;
}

export function fixedLine(n: number): string {
  if (n === 0) return "Nothing fixed yet. A mistake is fixed after 3 sure right answers spread over 2 weeks.";
  return `${n} ${n === 1 ? "mistake" : "mistakes"} fixed for good`;
}

export function weightText(questions: number): string {
  return `${questions} of ${EXAM_QUESTIONS} Qs`;
}
