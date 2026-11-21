// Pure formatting for the Today tab. No React, no storage, no clock: everything comes in as arguments.
import type { TopicInfo } from "../../core/content";
import type { DailyPlan, FocusPick } from "../../core/planner";
import { REVIEW_SECONDS_PER_ITEM } from "../../core/planner";
import { MIN_ANSWERS, type Box, type SkillState } from "../../core/skillmap";
import { addDays, localDay } from "../../core/time";
import type { ContentBundle, LearningEvent } from "../../core/types";

/** Seconds per question in a focus or diagnostic session ("about 1 min per question"). */
export const SECONDS_PER_QUESTION = 60;

const PATH_LABEL: Record<string, string> = { "CCSE-IV": "Group 4" };

/** Exam code -> the name AK uses for it. Unknown codes are shown as they are. */
export function pathLabel(exam: string): string {
  return PATH_LABEL[exam] ?? exam;
}

/** "ccse4.ta.u4.k_terms" -> "K terms". */
export function readableId(id: string): string {
  const last = id.split(".").pop() ?? id;
  const words = last.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

export function unitName(bundle: ContentBundle, unitId: string): string {
  return bundle.units.find((u) => u.id === unitId)?.nameEn ?? readableId(unitId);
}

/** bundle.topics name when present, else "<unit name> · <readable topic id>". */
export function topicName(bundle: ContentBundle, topicId: string, unitId: string): string {
  const named = bundle.topics?.find((t) => t.id === topicId)?.nameEn;
  if (named) return named;
  return `${unitName(bundle, unitId)} · ${readableId(topicId)}`;
}

/**
 * The exam path the planner used. The props do not carry it, so read it from the planner's own `why`
 * ("on your CCSE-IV path"), else from the topic's exams when it was asked by exactly one exam.
 */
export function pathExamOf(focus: FocusPick, topic: TopicInfo | undefined): string | null {
  const m = /on your (.+?) path/.exec(focus.why);
  if (m) return m[1];
  if (topic && topic.exams.length === 1) return topic.exams[0];
  return null;
}

export const BOX_LABEL: Record<Box, string> = {
  misconception: "Misconception",
  weak: "Weak",
  shaky: "Shaky",
  strong: "Strong",
  insufficient: "Not diagnosed yet",
};

/** Box colour class: red only for misconceptions, amber for weak and shaky, calm otherwise. */
export function boxTone(box: Box): "bad" | "miss" | "good" | "plain" {
  if (box === "misconception") return "bad";
  if (box === "weak" || box === "shaky") return "miss";
  if (box === "strong") return "good";
  return "plain";
}

/** Short weakness phrase for the one-liner: "Weak: 5 of 10 correct", "Not diagnosed yet". */
export function weaknessShort(box: Box, skill: SkillState | undefined): string {
  if (box === "insufficient" || !skill) return BOX_LABEL[box];
  if (box === "misconception") {
    const n = skill.unresolvedMisconceptions;
    return `${BOX_LABEL.misconception}: ${n} sure-but-wrong ${n === 1 ? "answer" : "answers"} to fix`;
  }
  return `${BOX_LABEL[box]}: ${skill.correct} of ${skill.scored} correct`;
}

function papersPhrase(topic: TopicInfo | undefined, frequency: number): string {
  if (topic) return `asked in ${topic.papersAsked} of ${topic.papersTotal} papers`;
  return `asked in ${Math.round(frequency * 100)}% of papers`;
}

function pathPhrase(relevance: number, exam: string | null): string {
  const name = exam ? pathLabel(exam) : "exam";
  return relevance > 0 ? `on your ${name} path` : `not on your ${name} path`;
}

/** The focus card's one-line reason, built from the pick's fields (never the raw planner string). */
export function focusLine(focus: FocusPick, skill: SkillState | undefined, topic: TopicInfo | undefined): string {
  return focusLineParts(focus, skill, topic).join(" · ");
}

/** The one-liner's three parts (weakness, frequency, path), so the screen can colour the first. */
export function focusLineParts(focus: FocusPick, skill: SkillState | undefined, topic: TopicInfo | undefined): [string, string, string] {
  return [
    weaknessShort(focus.box, skill),
    papersPhrase(topic, focus.frequency),
    pathPhrase(focus.relevance, pathExamOf(focus, topic)),
  ];
}

export interface WhyFactor {
  key: "weakness" | "frequency" | "path";
  title: string;
  detail: string;
  value: string; // the factor as a number, e.g. "0.60"
  tone: ReturnType<typeof boxTone>;
}

const n2 = (x: number): string => x.toFixed(2);

/** The three factors behind the pick, each with its evidence, plus the score sentence. */
export function whyFactors(
  focus: FocusPick,
  skill: SkillState | undefined,
  topic: TopicInfo | undefined,
  unit: string,
): { factors: WhyFactor[]; score: string } {
  let weakDetail: string;
  if (focus.box === "insufficient") {
    const have = skill?.scored ?? 0;
    weakDetail = `${unit}: ${have} of ${MIN_ANSWERS} answers so far. A short check places it.`;
  } else if (skill) {
    weakDetail = `${unit}: ${skill.evidence}.`;
  } else {
    weakDetail = `${unit}.`;
  }
  const exam = pathExamOf(focus, topic);
  const papers = papersPhrase(topic, focus.frequency);
  const path = pathPhrase(focus.relevance, exam);
  const factors: WhyFactor[] = [
    { key: "weakness", title: BOX_LABEL[focus.box], detail: weakDetail, value: n2(focus.weakness), tone: boxTone(focus.box) },
    { key: "frequency", title: "How often it is asked", detail: papers[0].toUpperCase() + papers.slice(1) + ".", value: n2(focus.frequency), tone: "plain" },
    { key: "path", title: "Your path", detail: path[0].toUpperCase() + path.slice(1) + ".", value: String(focus.relevance), tone: "plain" },
  ];
  const score = `Priority ${n2(focus.score)} = ${n2(focus.weakness)} × ${n2(focus.frequency)} × ${focus.relevance}. Highest of all topics today.`;
  return { factors, score };
}

/** "Focus: <topic>" or "Diagnostic: <unit>". */
export function sessionTitle(plan: DailyPlan, bundle: ContentBundle): string | null {
  const f = plan.focus;
  if (!f) return null;
  return plan.mode === "diagnostic" ? `Diagnostic: ${unitName(bundle, f.unitId)}` : `Focus: ${topicName(bundle, f.topicId, f.unitId)}`;
}

export function minutesFor(items: number, secondsEach: number): number {
  return items > 0 ? Math.max(1, Math.ceil((items * secondsEach) / 60)) : 0;
}

export const quickMinutes = (items: number): number => minutesFor(items, REVIEW_SECONDS_PER_ITEM);

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Answers given on an IST day. */
export function answeredOn(log: LearningEvent[], day: string): number {
  let n = 0;
  for (const e of log) if (e.type === "answer" && localDay(e.at) === day) n++;
  return n;
}

/** Today's planned total: the practice (or diagnostic) set plus every review item. */
export function plannedTotal(plan: DailyPlan): number {
  return plan.practiceSet.length + plan.review.retestConceptIds.length + plan.review.cardIds.length;
}

/** Ring fill 0..1. Nothing planned but something answered counts as full. */
export function ringFraction(done: number, total: number): number {
  if (total <= 0) return done > 0 ? 1 : 0;
  return Math.min(1, done / total);
}

export interface WeekDay {
  day: string;
  label: string; // "M".."S"
  name: string; // "Monday"
  active: boolean; // at least one answer
  isToday: boolean;
  future: boolean;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Monday..Sunday of the IST week containing `today`, marked with whether anything was answered. */
export function weekDays(today: string, log: LearningEvent[]): WeekDay[] {
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const monday = addDays(today, -dow);
  const days = new Set<string>();
  for (const e of log) if (e.type === "answer") days.add(localDay(e.at));
  return DAY_NAMES.map((name, i) => {
    const day = addDays(monday, i);
    return { day, label: name[0], name, active: days.has(day), isToday: day === today, future: day > today };
  });
}
