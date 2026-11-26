// Syllabus browser: every unit and topic of the path with its past questions and AK's record on them.
import { servableQuestions, topicIndex } from "../../core/content";
import { outcome } from "../../core/scoring";
import type { AnswerGiven, ContentBundle } from "../../core/types";

export interface TopicRow {
  topicId: string;
  nameEn: string;
  nameTa: string | null;
  questionIds: string[]; // servable questions tagged to the topic, newest paper first
  papersAsked: number; // of papersTotal counted papers (old-pattern sections left out, as in ranking)
  papersTotal: number;
  answered: number; // distinct questions AK has answered at least once
  correct: number; // of those, how many his latest answer got right
}

export interface UnitRow {
  unitId: string;
  nameEn: string;
  nameTa: string | null;
  officialQuestions: number;
  questionCount: number;
  topics: TopicRow[]; // most asked first, then by name; topics with no past questions included
}

/** At most this many questions per "Practise" session from the browser. */
export const PRACTISE_MAX = 20;

export function syllabusRows(bundle: ContentBundle, answers: AnswerGiven[], pathExam: string): UnitRow[] {
  const freq = new Map(topicIndex(bundle, pathExam).map((t) => [t.topicId, t]));
  const order = new Map(bundle.papers.map((p, i) => [p.id, i]));
  const byTopic = new Map<string, string[]>();
  const questions = servableQuestions(bundle)
    .slice()
    .sort((a, b) => (order.get(a.paperId) ?? 99) - (order.get(b.paperId) ?? 99) || a.n - b.n);
  for (const q of questions) if (q.topicId) byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), q.id]);
  const qById = new Map(bundle.questions.map((q) => [q.id, q]));
  const latest = new Map<string, AnswerGiven>();
  for (const a of answers) latest.set(a.questionId, a); // answers are in log order: the last one wins
  return bundle.units.map((u) => {
    const topics = (bundle.topics ?? []).filter((t) => t.unitId === u.id).map((t): TopicRow => {
      const ids = byTopic.get(t.id) ?? [];
      const done = ids.filter((id) => latest.has(id));
      const f = freq.get(t.id);
      return {
        topicId: t.id, nameEn: t.nameEn, nameTa: t.nameTa, questionIds: ids,
        papersAsked: f?.papersAsked ?? 0, papersTotal: f?.papersTotal ?? 0,
        answered: done.length,
        correct: done.filter((id) => outcome(qById.get(id)!, latest.get(id)!.chosen) === "correct").length,
      };
    }).sort((a, b) => b.papersAsked - a.papersAsked || b.questionIds.length - a.questionIds.length || a.nameEn.localeCompare(b.nameEn));
    return { unitId: u.id, nameEn: u.nameEn, nameTa: u.nameTa, officialQuestions: u.questions,
      questionCount: topics.reduce((n, t) => n + t.questionIds.length, 0), topics };
  });
}

/** Questions for a topic session: ones not answered yet first (newest paper first), then the rest; capped. */
export function topicPractiseIds(row: TopicRow, answeredIds: Set<string>, max = PRACTISE_MAX): string[] {
  const fresh = row.questionIds.filter((id) => !answeredIds.has(id));
  const seen = row.questionIds.filter((id) => answeredIds.has(id));
  return [...fresh, ...seen].slice(0, max);
}

/** "asked in 3 of 5 papers" / "not asked in the papers counted" / "old-pattern papers only". */
export function askedText(row: TopicRow): string {
  if (row.papersTotal === 0) return row.questionIds.length ? "old-pattern papers only" : "no past questions yet";
  const papers = row.papersTotal === 1 ? "paper" : "papers";
  if (row.papersAsked === 0) return `not asked in the last ${row.papersTotal} ${papers}`;
  return `asked in ${row.papersAsked} of ${row.papersTotal} ${papers}`;
}
