// Read-only helpers over the content bundle.
import type { ContentBundle, Question } from "./types";

/** The key mistakes are tracked under: concept if tagged, else topic, else the question itself. */
export function conceptKey(q: Question): string {
  return q.conceptId ?? q.topicId ?? q.id;
}

export function indexQuestions(bundle: ContentBundle): Map<string, Question> {
  return new Map(bundle.questions.map((q) => [q.id, q]));
}

/** What the planner needs to know about a topic. Built from the bundle, so it grows as papers are added. */
export interface TopicInfo {
  topicId: string;
  unitId: string;
  nameEn: string; // falls back to the topic id until the bundle carries names
  nameTa: string | null;
  papersAsked: number; // of the counted papers, how many asked this topic
  papersTotal: number; // counted papers: the path's most recent PATH_PAPER_WINDOW (all papers if no path)
  exams: string[]; // exam codes whose papers asked it, sorted, e.g. ["CCSE-IV"]
}

/** Spec: frequency is the share of the last 10 years' papers that asked the topic. */
export const PATH_PAPER_WINDOW = 10;

const paperKey = (q: Question) => `${q.source.exam}|${q.source.year}|${q.source.paper}`;

/**
 * Topic frequency counts only the learner's own exam path (review finding 3): a topic Group 2 asks often
 * must not outrank one every Group 4 paper asks. With no pathExam, every paper counts.
 */
export function topicIndex(bundle: ContentBundle, pathExam?: string): TopicInfo[] {
  const papers = new Map<string, { exam: string; year: number }>();
  for (const q of bundle.questions) papers.set(paperKey(q), { exam: q.source.exam, year: q.source.year });
  const counted = new Set(
    [...papers.entries()]
      .filter(([, p]) => pathExam === undefined || p.exam === pathExam)
      .sort((a, b) => b[1].year - a[1].year || (a[0] < b[0] ? 1 : -1))
      .slice(0, pathExam === undefined ? undefined : PATH_PAPER_WINDOW)
      .map(([k]) => k),
  );
  const names = new Map((bundle.topics ?? []).map((t) => [t.id, t]));
  const byTopic = new Map<string, { unitId: string; papers: Set<string>; exams: Set<string> }>();
  for (const q of bundle.questions) {
    if (!q.topicId || !q.unitId) continue;
    const t = byTopic.get(q.topicId) ?? { unitId: q.unitId, papers: new Set(), exams: new Set() };
    if (counted.has(paperKey(q))) t.papers.add(paperKey(q));
    t.exams.add(q.source.exam);
    byTopic.set(q.topicId, t);
  }
  return [...byTopic.entries()]
    .map(([topicId, t]) => ({
      topicId,
      unitId: t.unitId,
      nameEn: names.get(topicId)?.nameEn ?? topicId,
      nameTa: names.get(topicId)?.nameTa ?? null,
      papersAsked: t.papers.size,
      papersTotal: counted.size,
      exams: [...t.exams].sort(),
    }))
    .sort((a, b) => (a.topicId < b.topicId ? -1 : 1));
}
