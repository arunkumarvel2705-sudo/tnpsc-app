// Read-only helpers over the content bundle.
import type { ContentBundle, Question } from "./types";

/** The key mistakes are tracked under: concept if tagged, else topic, else the question itself. */
export function conceptKey(q: Question): string {
  return q.conceptId ?? q.topicId ?? q.id;
}

/** A bundle as it may arrive: bundles cached before multi-paper content have no paperId on questions. */
export type RawBundle = Omit<ContentBundle, "questions"> & { questions: (Omit<Question, "paperId"> & { paperId?: string })[] };

/**
 * Every bundle entering the app goes through here (fetched or read from the local cache). Bundles from
 * before multi-paper content held exactly one paper per file, so a question with no paperId belongs to
 * papers[0]. Returns the input unchanged when nothing is missing, so a normal bundle costs one scan.
 */
export function normalizeBundle(b: RawBundle): ContentBundle {
  if (b.questions.every((q) => typeof q.paperId === "string")) return b as ContentBundle;
  const fallback = b.papers[0]?.id ?? "";
  return { ...b, questions: b.questions.map((q) => (typeof q.paperId === "string" ? q : { ...q, paperId: fallback })) as Question[] };
}

/**
 * Whether the app can put this question in front of the learner. A question that needs a diagram (figure)
 * only describes it in words, which is not a fair question, so it stays hidden until the app can show
 * figures. This is the one rule every selection goes through: planner sets, section walk-throughs, mocks,
 * retests. Old answers to a hidden question stay in the log; they are just never asked for again.
 */
export function isServable(q: Question): boolean {
  return q.figure !== true;
}

/** The bundle's questions the app can serve, in bundle order. */
export function servableQuestions(bundle: ContentBundle): Question[] {
  return bundle.questions.filter(isServable);
}

/** One section of one paper, in bundle (paper) order: what "work through a section" serves. */
export function sectionQuestionIds(bundle: ContentBundle, paperId: string, section: Question["section"]): string[] {
  return servableQuestions(bundle).filter((q) => q.paperId === paperId && q.section === section).map((q) => q.id);
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
  papersAsked: number; // of the counted papers, how many asked this topic in a section that counts for ranking
  // Counted papers (the path's most recent PATH_PAPER_WINDOW, all papers if no path) in which the topic's
  // section counts for ranking (Paper.rankingExcludedSections). Can be 0: the planner treats that as frequency 0.
  papersTotal: number;
  exams: string[]; // exam codes whose papers asked it, sorted, e.g. ["CCSE-IV"]
  unitWeight: number; // the unit's official question count in the exam (bundle.units), 0 if unknown
}

/** Spec: frequency is the share of the last 10 years' papers that asked the topic. */
export const PATH_PAPER_WINDOW = 10;

const paperKey = (q: Question) => `${q.source.exam}|${q.source.year}|${q.source.paper}`;

/**
 * Topic frequency counts only the learner's own exam path (review finding 3): a topic Group 2 asks often
 * must not outrank one every Group 4 paper asks. With no pathExam, every paper counts.
 *
 * A section a paper lists in rankingExcludedSections (an old-pattern Tamil part) says nothing about how often a
 * topic is asked today, so it is left out of both sides of the share: its questions add nothing to papersAsked,
 * and that paper adds nothing to papersTotal for topics of that section. The topic still gets an entry (practice
 * needs it), possibly 0 of 0. Without the field every paper counts in full, as before.
 */
export function topicIndex(bundle: ContentBundle, pathExam?: string): TopicInfo[] {
  const excludedByPaperId = new Map(bundle.papers.map((p) => [p.id, new Set(p.rankingExcludedSections ?? [])]));
  const papers = new Map<string, { exam: string; year: number; excluded: Set<Question["section"]> }>();
  for (const q of bundle.questions) {
    papers.set(paperKey(q), { exam: q.source.exam, year: q.source.year, excluded: excludedByPaperId.get(q.paperId) ?? new Set() });
  }
  const ranks = (q: Question) => !papers.get(paperKey(q))?.excluded.has(q.section);
  const counted = new Set(
    [...papers.entries()]
      .filter(([, p]) => pathExam === undefined || p.exam === pathExam)
      .sort((a, b) => b[1].year - a[1].year || (a[0] < b[0] ? 1 : -1))
      .slice(0, pathExam === undefined ? undefined : PATH_PAPER_WINDOW)
      .map(([k]) => k),
  );
  const names = new Map((bundle.topics ?? []).map((t) => [t.id, t]));
  const unitWeights = new Map(bundle.units.map((u) => [u.id, u.questions]));
  const byTopic = new Map<string, { unitId: string; papers: Set<string>; exams: Set<string>; sections: Set<Question["section"]> }>();
  for (const q of bundle.questions) {
    if (!q.topicId || !q.unitId) continue;
    const t = byTopic.get(q.topicId) ?? { unitId: q.unitId, papers: new Set(), exams: new Set(), sections: new Set() };
    if (counted.has(paperKey(q)) && ranks(q)) t.papers.add(paperKey(q));
    t.exams.add(q.source.exam);
    t.sections.add(q.section);
    byTopic.set(q.topicId, t);
  }
  // A topic lives in one section in practice; were it in both, a paper counts if either of its sections does,
  // which keeps papersAsked <= papersTotal.
  const papersTotal = (sections: Set<Question["section"]>) =>
    [...counted].filter((k) => [...sections].some((s) => !papers.get(k)?.excluded.has(s))).length;
  return [...byTopic.entries()]
    .map(([topicId, t]) => ({
      topicId,
      unitId: t.unitId,
      nameEn: names.get(topicId)?.nameEn ?? topicId,
      nameTa: names.get(topicId)?.nameTa ?? null,
      papersAsked: t.papers.size,
      papersTotal: papersTotal(t.sections),
      exams: [...t.exams].sort(),
      unitWeight: unitWeights.get(t.unitId) ?? 0,
    }))
    .sort((a, b) => (a.topicId < b.topicId ? -1 : 1));
}
