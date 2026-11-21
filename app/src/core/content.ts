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
  papersAsked: number; // papers in the bundle with at least one question on this topic
  papersTotal: number; // papers in the bundle
  exams: string[]; // exam codes whose papers asked it, sorted, e.g. ["CCSE-IV"]
}

export function topicIndex(bundle: ContentBundle): TopicInfo[] {
  const papers = new Set(bundle.questions.map((q) => `${q.source.exam}|${q.source.year}|${q.source.paper}`));
  const names = new Map((bundle.topics ?? []).map((t) => [t.id, t]));
  const byTopic = new Map<string, { unitId: string; papers: Set<string>; exams: Set<string> }>();
  for (const q of bundle.questions) {
    if (!q.topicId || !q.unitId) continue;
    const t = byTopic.get(q.topicId) ?? { unitId: q.unitId, papers: new Set(), exams: new Set() };
    t.papers.add(`${q.source.exam}|${q.source.year}|${q.source.paper}`);
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
      papersTotal: papers.size,
      exams: [...t.exams].sort(),
    }))
    .sort((a, b) => (a.topicId < b.topicId ? -1 : 1));
}
