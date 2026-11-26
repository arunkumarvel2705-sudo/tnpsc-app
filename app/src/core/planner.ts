// core/planner — skill, mistake and card states + date -> DailyPlan.
// Tests: AT-C9, AT-C10, AT-C11 and the rules below. (Revised after independent review, findings 1, 5, 7, 10.)
//
// Learnable questions: active, not keyed ALL, and servable (content.isServable: no figure the app can't show).
// Confidence is read through scoring.effectiveConfidence.
// Focus topic: among topics with at least one learnable question,
//   weakness  = skills.get(unitId)?.weakness ?? WEAKNESS.insufficient
//   frequency = papersAsked / papersTotal (0 when papersTotal is 0) — content.topicIndex counts only the
//               learner's path papers, the most recent 10, and leaves out old-pattern sections
//               (Paper.rankingExcludedSections), so papersTotal can be 0
//   relevance = exams includes pathExam ? 1 : 0
//   score     = weakness * frequency * relevance
// A topic is skipped when its mode has nothing to serve (diagnostic: no never-answered learnable question in
// the unit; practice: no focus-pool question), so the plan never locks onto an exhausted topic.
// Highest score wins; ties -> more open mistakes in the topic, then the unit worth more marks (unitWeight),
// then topicId ascending. (With few papers loaded most scores tie, so exam weight decides.) Nothing eligible ->
// focus null, mode practice, empty practice set.
// why names every factor in one line, e.g.
//   "Weak: 5 of 10 correct (50%) · asked in 1 of 1 papers · on your CCSE-IV path"
//
// Mode: "diagnostic" when the focus unit's box is insufficient: practiceSet = up to DIAGNOSTIC_SIZE
// never-answered learnable questions from the focus UNIT, by id; olderTopicQuestionIds empty.
// Otherwise "practice": PRACTICE_SIZE questions:
//   older = min(3, available older-topic questions) where an older topic is any topic other than the focus
//           topic with at least one answer before `today`; pick questions whose concept has an open mistake,
//           then latest answer wrong, then the longest-ago answered, then never answered; ties by id
//   focus = fill the rest from the focus topic: never answered, then latest wrong, then correct-but-not-sure,
//           ties by id; if the topic runs out, the set is shorter (never pad with more older questions)
//   practiceSet = focus picks then older picks; olderTopicQuestionIds = the older picks
// Review, counted in questions (must fit MAX_REVIEW_MINUTES even after missed days, AT-C10):
//   retests = open mistakes in stage logged with retestDay <= today, misconceptions first, then retestDay,
//   then conceptId; each serves its active, servable wrongQuestionIds. Then due cards (fsrs.dueCards order)
//   whose question is not already queued; a question card whose question is deleted, missing or not
//   servable never comes due (its state is kept, so it resumes if the question can be shown again). Total capped at floor(MAX_REVIEW_MINUTES * 60 / REVIEW_SECONDS_PER_ITEM)
//   items; review.questionIds is the ordered list to serve; estMinutes = ceil(items * seconds / 60).
// quick: up to QUICK_SIZE question ids — review.questionIds, then practiceSet order, de-duplicated.
// Deterministic: no clock, no randomness; `today` is an IST day (core/time).
import { conceptKey, isServable, type TopicInfo } from "./content";
import type { CardState } from "./fsrs";
import type { MistakeState } from "./mistakes";
import { effectiveConfidence, latestAnswers, learningOutcome } from "./scoring";
import { WEAKNESS, type Box, type SkillState } from "./skillmap";
import { localDay } from "./time";
import type { AnswerGiven, Question } from "./types";

export const PRACTICE_SIZE = 12;
export const DIAGNOSTIC_SIZE = 20;
export const QUICK_SIZE = 5;
export const REVIEW_SECONDS_PER_ITEM = 30;
export const MAX_REVIEW_MINUTES = 10;

export interface PlannerInput {
  today: string;
  pathExam: string; // e.g. "CCSE-IV"
  topics: TopicInfo[];
  questions: Question[];
  answers: AnswerGiven[];
  skills: Map<string, SkillState>;
  mistakes: Map<string, MistakeState>;
  cards: Map<string, CardState>;
}

export interface FocusPick {
  topicId: string;
  unitId: string;
  box: Box;
  weakness: number;
  frequency: number;
  relevance: number;
  score: number;
  why: string;
}

export interface DailyPlan {
  date: string;
  focus: FocusPick | null;
  mode: "diagnostic" | "practice";
  practiceSet: string[];
  olderTopicQuestionIds: string[];
  review: { retestConceptIds: string[]; cardIds: string[]; questionIds: string[]; estMinutes: number };
  quick: string[];
}

const BOX_LABEL: Record<Box, string> = {
  misconception: "Misconception",
  weak: "Weak",
  shaky: "Shaky",
  strong: "Strong",
  insufficient: "Not diagnosed yet",
};

const QUESTION_CARD_PREFIX = "q:"; // fsrs.questionCardId, inlined: core modules are built in parallel

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function planDay(input: PlannerInput): DailyPlan {
  const { today, questions, answers, mistakes } = input;
  // Learnable = active and not keyed ALL (an ALL question is no evidence either way), and servable: a
  // question needing a figure is never put in a set, so the plan never shows a question it cannot show.
  const learnable = questions.filter((q) => q.status === "active" && q.accepted !== "ALL" && isServable(q));
  const byId = new Map(questions.map((q) => [q.id, q]));
  const latest = latestAnswers(answers);
  const isOpen = (m: MistakeState | undefined): boolean => m !== undefined && m.stage !== "fixed";
  const wrong = (q: Question, l: AnswerGiven | undefined) => l !== undefined && learningOutcome(q, l.chosen) === "wrong";

  // Diagnostic pool: never-answered learnable questions in a unit, by id.
  const diagnosticPool = (unitId: string): string[] =>
    learnable.filter((q) => q.unitId === unitId && !latest.has(q.id)).map((q) => q.id).sort(cmp);
  // Focus pool: 0 never answered, 1 latest wrong, 2 correct but not sure; correct + sure is not practised.
  const focusPool = (topicId: string): string[] => {
    const pool: { id: string; rank: number }[] = [];
    for (const q of learnable) {
      if (q.topicId !== topicId) continue;
      const l = latest.get(q.id);
      if (!l) pool.push({ id: q.id, rank: 0 });
      else if (wrong(q, l)) pool.push({ id: q.id, rank: 1 });
      else if (effectiveConfidence(l.chosen, l.confidence) !== "sure") pool.push({ id: q.id, rank: 2 });
    }
    return pool.sort((a, b) => a.rank - b.rank || cmp(a.id, b.id)).map((x) => x.id);
  };
  // A topic is only worth picking if its mode has something to serve (review finding 1).
  const hasWork = (topicId: string, unitId: string, box: Box): boolean =>
    box === "insufficient" ? diagnosticPool(unitId).length > 0 : focusPool(topicId).length > 0;

  const focus = pickFocus(input, learnable, hasWork);

  // Practice or diagnostic set.
  let mode: DailyPlan["mode"] = "practice";
  let practiceSet: string[] = [];
  let olderTopicQuestionIds: string[] = [];
  if (focus && focus.box === "insufficient") {
    mode = "diagnostic";
    practiceSet = diagnosticPool(focus.unitId).slice(0, DIAGNOSTIC_SIZE);
  } else if (focus) {
    const olderTopics = new Set<string>();
    for (const a of answers) {
      const t = byId.get(a.questionId)?.topicId;
      if (t && t !== focus.topicId && localDay(a.at) < today) olderTopics.add(t);
    }
    const olderPool = learnable
      .filter((q) => q.topicId !== undefined && olderTopics.has(q.topicId))
      .map((q) => {
        const l = latest.get(q.id);
        return { id: q.id, openMistake: isOpen(mistakes.get(conceptKey(q))), wrong: wrong(q, l), lastAt: l?.at ?? null };
      })
      .sort(
        (a, b) =>
          Number(b.openMistake) - Number(a.openMistake) ||
          Number(b.wrong) - Number(a.wrong) ||
          (a.lastAt === b.lastAt ? 0 : a.lastAt === null ? 1 : b.lastAt === null ? -1 : cmp(a.lastAt, b.lastAt)) ||
          cmp(a.id, b.id),
      );
    olderTopicQuestionIds = olderPool.slice(0, Math.min(3, olderPool.length)).map((x) => x.id);
    const focusPicks = focusPool(focus.topicId).slice(0, PRACTICE_SIZE - olderTopicQuestionIds.length);
    practiceSet = [...focusPicks, ...olderTopicQuestionIds];
  }

  // Review queue, counted in questions so nothing is spent twice (review finding 10):
  // retests first (misconceptions first), each serving its concept's missed questions; then due cards
  // whose question is not already queued. Capped to fit MAX_REVIEW_MINUTES (AT-C10).
  const cap = Math.floor((MAX_REVIEW_MINUTES * 60) / REVIEW_SECONDS_PER_ITEM);
  const reviewQuestionIds: string[] = [];
  let items = 0; // questions queued plus non-question cards (facts, terms)
  const queued = new Set<string>();
  const retestConceptIds: string[] = [];
  const retestCandidates = [...mistakes.values()]
    .filter((m) => m.stage === "logged" && m.retestDay <= today)
    .sort((a, b) => Number(b.misconception) - Number(a.misconception) || cmp(a.retestDay, b.retestDay) || cmp(a.conceptId, b.conceptId));
  for (const m of retestCandidates) {
    const ids = m.wrongQuestionIds.filter((id) => canShow(byId.get(id)) && !queued.has(id));
    if (!ids.length || items >= cap) continue;
    retestConceptIds.push(m.conceptId);
    for (const id of ids.slice(0, cap - items)) { reviewQuestionIds.push(id); queued.add(id); items++; }
  }
  const cardIds: string[] = [];
  const dueCards = [...input.cards.values()]
    .filter((c) => c.dueDay <= today && !isDeadQuestionCard(c, byId))
    .sort((a, b) => cmp(a.dueDay, b.dueDay) || cmp(a.due, b.due) || cmp(a.cardId, b.cardId));
  for (const c of dueCards) {
    if (items >= cap) break;
    const qid = c.cardId.startsWith(QUESTION_CARD_PREFIX) ? c.cardId.slice(QUESTION_CARD_PREFIX.length) : null;
    if (qid !== null && queued.has(qid)) continue;
    cardIds.push(c.cardId);
    items++;
    if (qid !== null) { reviewQuestionIds.push(qid); queued.add(qid); }
  }
  const review = {
    retestConceptIds,
    cardIds,
    questionIds: reviewQuestionIds,
    estMinutes: Math.ceil((items * REVIEW_SECONDS_PER_ITEM) / 60),
  };

  // Quick session: review questions first, then the practice set.
  const quick: string[] = [];
  const seen = new Set<string>();
  for (const id of [...reviewQuestionIds, ...practiceSet]) {
    if (quick.length >= QUICK_SIZE) break;
    if (seen.has(id)) continue;
    seen.add(id);
    quick.push(id);
  }

  return { date: today, focus, mode, practiceSet, olderTopicQuestionIds, review, quick };
}

/** Whether a review may serve this question: in the bundle, active, and servable. */
function canShow(q: Question | undefined): boolean {
  return q !== undefined && q.status === "active" && isServable(q);
}

/** A question card whose question is deleted, missing or not servable cannot be shown, so it is never queued. */
function isDeadQuestionCard(c: CardState, byId: Map<string, Question>): boolean {
  if (!c.cardId.startsWith(QUESTION_CARD_PREFIX)) return false;
  return !canShow(byId.get(c.cardId.slice(QUESTION_CARD_PREFIX.length)));
}

function pickFocus(
  input: PlannerInput,
  learnable: Question[],
  hasWork: (topicId: string, unitId: string, box: Box) => boolean,
): FocusPick | null {
  const { pathExam, skills, mistakes } = input;
  const topicsWithQuestions = new Set(learnable.map((q) => q.topicId).filter((t): t is string => t !== undefined));
  const openByTopic = new Map<string, number>();
  for (const m of mistakes.values()) {
    if (m.stage === "fixed" || m.topicId === null) continue;
    openByTopic.set(m.topicId, (openByTopic.get(m.topicId) ?? 0) + 1);
  }

  let best: { pick: FocusPick; open: number; weight: number } | null = null;
  for (const t of input.topics) {
    if (!topicsWithQuestions.has(t.topicId)) continue;
    const skill = skills.get(t.unitId);
    const box: Box = skill?.box ?? "insufficient";
    const weakness = skill?.weakness ?? WEAKNESS.insufficient;
    const frequency = t.papersTotal > 0 ? t.papersAsked / t.papersTotal : 0;
    const relevance = t.exams.includes(pathExam) ? 1 : 0;
    const score = weakness * frequency * relevance;
    if (!(score > 0)) continue;
    if (!hasWork(t.topicId, t.unitId, box)) continue;
    const open = openByTopic.get(t.topicId) ?? 0;
    if (best) {
      const b = best;
      const worse =
        score !== b.pick.score ? score < b.pick.score
        : open !== b.open ? open < b.open
        : t.unitWeight !== b.weight ? t.unitWeight < b.weight
        : t.topicId >= b.pick.topicId;
      if (worse) continue;
    }
    const label = skill ? `${BOX_LABEL[box]}: ${skill.evidence}` : BOX_LABEL[box];
    const path = relevance ? `on your ${pathExam} path` : `not on your ${pathExam} path`;
    const why = `${label} · asked in ${t.papersAsked} of ${t.papersTotal} papers · ${path}`;
    best = { pick: { topicId: t.topicId, unitId: t.unitId, box, weakness, frequency, relevance, score, why }, open, weight: t.unitWeight };
  }
  return best?.pick ?? null;
}
