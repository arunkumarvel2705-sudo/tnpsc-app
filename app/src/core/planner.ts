// core/planner — skill, mistake and card states + date -> DailyPlan. (Agent: planner)
// Contract is fixed; implement the bodies. Tests: AT-C9, AT-C10, AT-C11 and the rules below.
//
// Focus topic: among topics with at least one active question in `questions`,
//   weakness  = skills.get(unitId)?.weakness ?? WEAKNESS.insufficient
//   frequency = papersAsked / papersTotal (0 when papersTotal is 0)
//   relevance = exams includes pathExam ? 1 : 0
//   score     = weakness * frequency * relevance
// Highest score wins; ties -> more open mistakes in the topic, then topicId ascending. No topic with
// score > 0 -> focus null and an empty practice set.
// why names every factor in one line, e.g.
//   "Weak: 5 of 10 correct (50%) · asked in 1 of 1 papers · on your CCSE-IV path"
//   (box label + skill evidence · frequency · relevance)
//
// Mode: "diagnostic" when the focus unit's box is insufficient: practiceSet = up to DIAGNOSTIC_SIZE active
// questions from the focus UNIT never answered, ordered by id; olderTopicQuestionIds empty.
// Otherwise "practice": PRACTICE_SIZE questions:
//   older = min(3, available older-topic questions) where an older topic is any topic other than the focus
//           topic with at least one answer before `today`; pick questions whose concept has an open mistake,
//           then latest answer wrong, then the longest-ago answered; ties by id
//   focus = fill the rest from the focus topic: never answered, then latest wrong, then correct-but-not-sure,
//           ties by id; if the topic runs out, the set is shorter (never pad with more older questions)
//   practiceSet = focus picks then older picks; olderTopicQuestionIds = the older picks
// Review (must fit MAX_REVIEW_MINUTES even after missed days, AT-C10):
//   candidates = open mistakes in stage logged with retestDay <= today (as retestConceptIds, ordered by
//   retestDay then conceptId), then due cards (fsrs.dueCards order); total capped at
//   floor(MAX_REVIEW_MINUTES * 60 / REVIEW_SECONDS_PER_ITEM); estMinutes = ceil(count * REVIEW_SECONDS_PER_ITEM / 60).
//   Retests come first because a next-day retest is the step that most often lapses.
// quick: up to QUICK_SIZE question ids — question ids behind review.cardIds ("q:<id>"), then practiceSet
// order, de-duplicated.
// Deterministic: no clock, no randomness; `today` is an IST day (core/time).
import { conceptKey, type TopicInfo } from "./content";
import type { CardState } from "./fsrs";
import type { MistakeState } from "./mistakes";
import { latestAnswers, outcome } from "./scoring";
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
  review: { retestConceptIds: string[]; cardIds: string[]; estMinutes: number };
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
  const active = questions.filter((q) => q.status === "active");
  const byId = new Map(questions.map((q) => [q.id, q]));
  const latest = latestAnswers(answers);
  const isOpen = (m: MistakeState | undefined): boolean => m !== undefined && m.stage !== "fixed";

  const focus = pickFocus(input, active);

  // Practice or diagnostic set.
  let mode: DailyPlan["mode"] = "practice";
  let practiceSet: string[] = [];
  let olderTopicQuestionIds: string[] = [];
  if (focus && focus.box === "insufficient") {
    mode = "diagnostic";
    practiceSet = active
      .filter((q) => q.unitId === focus.unitId && !latest.has(q.id))
      .map((q) => q.id)
      .sort(cmp)
      .slice(0, DIAGNOSTIC_SIZE);
  } else if (focus) {
    const olderTopics = new Set<string>();
    for (const a of answers) {
      const t = byId.get(a.questionId)?.topicId;
      if (t && t !== focus.topicId && localDay(a.at) < today) olderTopics.add(t);
    }
    const olderPool = active
      .filter((q) => q.topicId !== undefined && olderTopics.has(q.topicId))
      .map((q) => {
        const l = latest.get(q.id);
        return {
          id: q.id,
          openMistake: isOpen(mistakes.get(conceptKey(q))),
          wrong: l !== undefined && outcome(q, l.chosen) === "wrong",
          lastAt: l?.at ?? null,
        };
      })
      .sort(
        (a, b) =>
          Number(b.openMistake) - Number(a.openMistake) ||
          Number(b.wrong) - Number(a.wrong) ||
          (a.lastAt === b.lastAt ? 0 : a.lastAt === null ? 1 : b.lastAt === null ? -1 : cmp(a.lastAt, b.lastAt)) ||
          cmp(a.id, b.id),
      );
    olderTopicQuestionIds = olderPool.slice(0, Math.min(3, olderPool.length)).map((x) => x.id);

    // 0 never answered, 1 latest wrong, 2 correct but not sure; correct + sure is not practised.
    const focusPool: { id: string; rank: number }[] = [];
    for (const q of active) {
      if (q.topicId !== focus.topicId) continue;
      const l = latest.get(q.id);
      if (!l) focusPool.push({ id: q.id, rank: 0 });
      else if (outcome(q, l.chosen) === "wrong") focusPool.push({ id: q.id, rank: 1 });
      else if (l.confidence !== "sure") focusPool.push({ id: q.id, rank: 2 });
    }
    focusPool.sort((a, b) => a.rank - b.rank || cmp(a.id, b.id));
    const focusPicks = focusPool.slice(0, PRACTICE_SIZE - olderTopicQuestionIds.length).map((x) => x.id);
    practiceSet = [...focusPicks, ...olderTopicQuestionIds];
  }

  // Review queue: retests first, then due cards, capped to fit MAX_REVIEW_MINUTES.
  const cap = Math.floor((MAX_REVIEW_MINUTES * 60) / REVIEW_SECONDS_PER_ITEM);
  const retests = [...mistakes.values()]
    .filter((m) => m.stage === "logged" && m.retestDay <= today)
    .sort((a, b) => cmp(a.retestDay, b.retestDay) || cmp(a.conceptId, b.conceptId))
    .map((m) => m.conceptId)
    .slice(0, cap);
  const due = [...input.cards.values()]
    .filter((c) => c.dueDay <= today && !isDeadQuestionCard(c, byId))
    .sort((a, b) => cmp(a.dueDay, b.dueDay) || cmp(a.due, b.due) || cmp(a.cardId, b.cardId))
    .map((c) => c.cardId)
    .slice(0, cap - retests.length);
  const count = retests.length + due.length;
  const review = {
    retestConceptIds: retests,
    cardIds: due,
    estMinutes: Math.ceil((count * REVIEW_SECONDS_PER_ITEM) / 60),
  };

  // Quick session.
  const quick: string[] = [];
  const seen = new Set<string>();
  const cardQuestionIds = due.filter((id) => id.startsWith(QUESTION_CARD_PREFIX)).map((id) => id.slice(QUESTION_CARD_PREFIX.length));
  for (const id of [...cardQuestionIds, ...practiceSet]) {
    if (quick.length >= QUICK_SIZE) break;
    if (seen.has(id)) continue;
    seen.add(id);
    quick.push(id);
  }

  return { date: today, focus, mode, practiceSet, olderTopicQuestionIds, review, quick };
}

/** A question card whose question is deleted or missing from the bundle cannot be shown, so it is never queued. */
function isDeadQuestionCard(c: CardState, byId: Map<string, Question>): boolean {
  if (!c.cardId.startsWith(QUESTION_CARD_PREFIX)) return false;
  return byId.get(c.cardId.slice(QUESTION_CARD_PREFIX.length))?.status !== "active";
}

function pickFocus(input: PlannerInput, active: Question[]): FocusPick | null {
  const { pathExam, skills, mistakes } = input;
  const topicsWithQuestions = new Set(active.map((q) => q.topicId).filter((t): t is string => t !== undefined));
  const openByTopic = new Map<string, number>();
  for (const m of mistakes.values()) {
    if (m.stage === "fixed" || m.topicId === null) continue;
    openByTopic.set(m.topicId, (openByTopic.get(m.topicId) ?? 0) + 1);
  }

  let best: { pick: FocusPick; open: number } | null = null;
  for (const t of input.topics) {
    if (!topicsWithQuestions.has(t.topicId)) continue;
    const skill = skills.get(t.unitId);
    const box: Box = skill?.box ?? "insufficient";
    const weakness = skill?.weakness ?? WEAKNESS.insufficient;
    const frequency = t.papersTotal > 0 ? t.papersAsked / t.papersTotal : 0;
    const relevance = t.exams.includes(pathExam) ? 1 : 0;
    const score = weakness * frequency * relevance;
    if (!(score > 0)) continue;
    const open = openByTopic.get(t.topicId) ?? 0;
    if (
      best &&
      (score < best.pick.score ||
        (score === best.pick.score && (open < best.open || (open === best.open && t.topicId >= best.pick.topicId))))
    ) {
      continue;
    }
    const label = skill ? `${BOX_LABEL[box]}: ${skill.evidence}` : BOX_LABEL[box];
    const path = relevance ? `on your ${pathExam} path` : `not on your ${pathExam} path`;
    const why = `${label} · asked in ${t.papersAsked} of ${t.papersTotal} papers · ${path}`;
    best = { pick: { topicId: t.topicId, unitId: t.unitId, box, weakness, frequency, relevance, score, why }, open };
  }
  return best?.pick ?? null;
}
