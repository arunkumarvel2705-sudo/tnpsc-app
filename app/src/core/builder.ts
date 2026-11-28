// Practice builder: AK picks what to drill (subject, unit, topic, papers, which questions) and how many.
// Pure: the caller passes the seed, so the same choices and seed always give the same set.
import { isServable } from "./content";
import { learningOutcome } from "./scoring";
import type { MistakeState } from "./mistakes";
import type { AnswerGiven, ContentBundle, Question } from "./types";

export type Subject = "tamil" | "gs" | "apt";
export type BuilderStatus = "any" | "new" | "wrong" | "unsure" | "mistakes";

export interface BuilderSpec {
  subject: Subject | "all";
  unitId: string | null; // null = every unit of the subject
  topicId: string | null; // null = every topic of the unit; only set together with unitId
  paperIds: string[]; // empty = every paper
  status: BuilderStatus;
  count: number;
}

export const BUILDER_COUNTS = [10, 20, 50] as const;

export const DEFAULT_SPEC: BuilderSpec = { subject: "all", unitId: null, topicId: null, paperIds: [], status: "any", count: 20 };

export const SUBJECTS: { id: Subject; label: string }[] = [
  { id: "tamil", label: "Tamil" },
  { id: "gs", label: "General Studies" },
  { id: "apt", label: "Aptitude" },
];

/** Subject of a unit id like "ccse4.gs.u4"; a question with no unit falls back to its section. */
export function subjectOf(unitId: string | undefined | null, section?: Question["section"]): Subject {
  const part = unitId?.split(".")[1];
  if (part === "ta" || part === "gs" || part === "apt") return part === "ta" ? "tamil" : part;
  return section === "tamil" ? "tamil" : "gs";
}

/** Latest answer per question, by log order (answers arrive ordered). */
function latestByQuestion(answers: AnswerGiven[]): Map<string, AnswerGiven> {
  const latest = new Map<string, AnswerGiven>();
  for (const a of answers) latest.set(a.questionId, a);
  return latest;
}

/**
 * Where a question stands for AK, from his latest answer to it:
 * new (never answered), wrong (latest answer wrong, "Answer not known" included), unsure (latest answer a guess
 * or no idea, right or wrong). A wrong guess is both wrong and unsure.
 */
export function questionStatus(q: Question, latest: AnswerGiven | undefined): { isNew: boolean; wrong: boolean; unsure: boolean } {
  if (!latest) return { isNew: true, wrong: false, unsure: false };
  const out = learningOutcome(q, latest.chosen);
  return { isNew: false, wrong: out === "wrong", unsure: out !== "unscored" && latest.confidence !== "sure" };
}

/** Questions the builder can use at all: servable and not deleted. */
function usable(bundle: ContentBundle): Question[] {
  return bundle.questions.filter((q) => isServable(q) && q.status === "active");
}

function inScope(q: Question, spec: BuilderSpec): boolean {
  if (spec.subject !== "all" && subjectOf(q.unitId, q.section) !== spec.subject) return false;
  if (spec.unitId && q.unitId !== spec.unitId) return false;
  if (spec.topicId && q.topicId !== spec.topicId) return false;
  if (spec.paperIds.length && !spec.paperIds.includes(q.paperId)) return false;
  return true;
}

/**
 * Questions missed in a mistake that is not fixed yet (core/mistakes, the same list Progress shows). Unlike
 * "wrong", a question stays here after one right answer, until its mistake is fixed.
 */
export function openMistakeQuestionIds(mistakes: Iterable<MistakeState>): Set<string> {
  const ids = new Set<string>();
  for (const m of mistakes) if (m.stage !== "fixed") for (const id of m.wrongQuestionIds) ids.add(id);
  return ids;
}

/** How many questions each status choice would match with the rest of the spec as it is. */
export function statusCounts(
  bundle: ContentBundle, answers: AnswerGiven[], spec: BuilderSpec, openMistakeIds: Set<string> = new Set(),
): Record<BuilderStatus, number> {
  const latest = latestByQuestion(answers);
  const c: Record<BuilderStatus, number> = { any: 0, new: 0, wrong: 0, unsure: 0, mistakes: 0 };
  for (const q of usable(bundle)) {
    if (!inScope(q, spec)) continue;
    const s = questionStatus(q, latest.get(q.id));
    c.any++;
    if (s.isNew) c.new++;
    if (s.wrong) c.wrong++;
    if (s.unsure) c.unsure++;
    if (openMistakeIds.has(q.id)) c.mistakes++;
  }
  return c;
}

/** Every question the spec matches, in bundle order. */
export function builderPool(
  bundle: ContentBundle, answers: AnswerGiven[], spec: BuilderSpec, openMistakeIds: Set<string> = new Set(),
): Question[] {
  const latest = latestByQuestion(answers);
  return usable(bundle).filter((q) => {
    if (!inScope(q, spec)) return false;
    if (spec.status === "any") return true;
    if (spec.status === "mistakes") return openMistakeIds.has(q.id);
    const s = questionStatus(q, latest.get(q.id));
    return spec.status === "new" ? s.isNew : spec.status === "wrong" ? s.wrong : s.unsure;
  });
}

/** A small seeded PRNG (mulberry32) over a string seed, so picks are repeatable in tests. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick up to `count` questions in a shuffled order. Questions that share a comprehension passage stay
 * together and in paper order, so a passage is read once and its questions follow it.
 */
export function pickSet(pool: Question[], count: number, seed: string): string[] {
  // A follower's passageRef is the id of the question that carries the passage, so this one key groups both.
  const groups = new Map<string, Question[]>();
  for (const q of pool) {
    const key = q.passageRef ?? q.id;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const list = [...groups.values()].map((qs) => qs.slice().sort((a, b) => a.n - b.n));
  const rand = seededRandom(seed);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.flat().slice(0, Math.max(0, count)).map((q) => q.id);
}

/** A stored spec checked against the bundle in hand: anything it no longer has goes back to the default. */
export function sanitizeSpec(raw: unknown, bundle: ContentBundle): BuilderSpec {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<BuilderSpec>;
  const subject = s.subject === "all" || SUBJECTS.some((x) => x.id === s.subject) ? (s.subject as BuilderSpec["subject"]) : "all";
  const unit = bundle.units.find((u) => u.id === s.unitId);
  const unitId = unit && (subject === "all" || subjectOf(unit.id) === subject) ? unit.id : null;
  const topic = (bundle.topics ?? []).find((t) => t.id === s.topicId);
  const topicId = unitId && topic && topic.unitId === unitId ? topic.id : null;
  const paperIds = Array.isArray(s.paperIds) ? s.paperIds.filter((id) => bundle.papers.some((p) => p.id === id)) : [];
  const status = (["any", "new", "wrong", "unsure", "mistakes"] as const).find((x) => x === s.status) ?? "any";
  const count = (BUILDER_COUNTS as readonly number[]).includes(s.count as number) ? (s.count as number) : DEFAULT_SPEC.count;
  return { subject, unitId, topicId, paperIds: paperIds.length === bundle.papers.length ? [] : paperIds, status, count };
}
