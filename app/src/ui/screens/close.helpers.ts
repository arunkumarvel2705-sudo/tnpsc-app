// Session close: what this session's answers add up to, and which misses can be tagged. Pure.
import { answersOf, errorTagsByAnswer } from "../../core/events";
import { latestAnswers, outcome, summarise, type Summary } from "../../core/scoring";
import type { AnswerGiven, ContentBundle, ErrorReason, LearningEvent, Option, Question } from "../../core/types";

export const REASONS: { reason: ErrorReason; label: string }[] = [
  { reason: "concept", label: "Didn't know it" },
  { reason: "careless", label: "Careless" },
  { reason: "misread", label: "Misread" },
  { reason: "time", label: "Ran out of time" },
  { reason: "memory", label: "Forgot" },
  { reason: "other", label: "Other" },
];

export interface SlipRow {
  answerEventId: string;
  questionId: string;
  n: number;
  lang: "ta" | "en";
  snippet: string; // one line of the stem
  chosen: Option;
  key: string; // e.g. "C" or "A / C"
  sure: boolean; // wrong while sure = misconception
  tag: ErrorReason | null; // latest tag already given, if any
}

export interface CloseView {
  summary: Summary;
  slips: SlipRow[]; // wrong while sure first, then in session order
}

const SNIPPET_MAX = 140;

/** One readable line of a stem: whitespace collapsed, a match table's right column dropped, long text cut at a word. */
export function snippet(stem: string, max = SNIPPET_MAX): string {
  const line = stem.split(" | ")[0].replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function closeView(sessionId: string, questionIds: string[], bundle: ContentBundle, log: LearningEvent[]): CloseView {
  const questions = new Map<string, Question>(bundle.questions.map((q) => [q.id, q]));
  const mine: AnswerGiven[] = answersOf(log).filter((e) => e.sessionId === sessionId);
  const summary = summarise(mine, questions);
  const tags = errorTagsByAnswer(log);
  const order = new Map(questionIds.map((id, i) => [id, i]));

  const slips: SlipRow[] = [];
  for (const e of latestAnswers(mine).values()) {
    const q = questions.get(e.questionId);
    if (!q || outcome(q, e.chosen) !== "wrong") continue;
    const lang = q.section === "tamil" ? "ta" : "en";
    const text = q[lang] ?? q.en ?? q.ta;
    slips.push({
      answerEventId: e.eventId,
      questionId: q.id,
      n: q.n,
      lang: q[lang] ? lang : q.en ? "en" : "ta",
      snippet: text ? snippet(text.stem) : "",
      chosen: e.chosen,
      key: q.accepted === "ALL" ? "any" : q.accepted.join(" / "),
      sure: e.confidence === "sure",
      tag: tags.get(e.eventId)?.reason ?? null,
    });
  }
  const pos = (r: SlipRow) => order.get(r.questionId) ?? Number.MAX_SAFE_INTEGER;
  slips.sort((a, b) => Number(b.sure) - Number(a.sure) || pos(a) - pos(b) || a.n - b.n);
  return { summary, slips };
}

/** "These come back…" line. Wording only; the planner decides the actual schedule. */
export function nextLine(v: CloseView): string {
  if (v.summary.answered === 0) return "Nothing was answered in this session.";
  if (v.slips.length === 0) return "No misses this time. Right answers come back now and then to keep them fresh.";
  const these = v.slips.length === 1 ? "This one comes" : "These come";
  return `${these} back for a retest tomorrow.`;
}
