// Data contracts (spec: "Data contracts"). Content is read-only; events are immutable and append-only.

export type Option = "A" | "B" | "C" | "D" | "E"; // E = Answer not known
export type Confidence = "sure" | "guess" | "none";

export interface QuestionText {
  stem: string;
  options: Record<Option, string>;
}

export interface Question {
  id: string; // globally unique across papers, e.g. ccse4_2024_q101
  paperId: string; // one of ContentBundle.papers[].id; a bundle holds every paper of one exam path
  n: number;
  section: "tamil" | "gs_apt";
  en?: QuestionText;
  ta?: QuestionText;
  passage?: { en?: string; ta?: string };
  passageRef?: string;
  accepted: Exclude<Option, "E">[] | "ALL"; // final key; ALL = everyone scores
  keyStatus: "final" | "tentative" | "none";
  status: "active" | "deleted";
  format?: "match";
  hasFigure?: boolean;
  figure?: true; // needs a diagram from the PDF that the app cannot show yet: never served (content.isServable)
  conceptId?: string; // finest tag; when absent the topic stands in for the concept (see conceptKey)
  topicId?: string;
  unitId?: string;
  tagConfidence?: number; // how sure the tagger was of topicId (0-1); below TAG_REVIEW_BELOW it waits for AK's review
  tagReviewed?: TagVerdict; // set in the app from AK's TagReviewed events (content.applyTagReviews)
  source: { exam: string; year: number; paper: string; qNo: number; pdfRef: string; page: number };
}

export interface Paper {
  id: string;
  title: string;
  date: string;
  sections: { id: Question["section"]; title: string; questions: number }[];
  // Sections set on an older syllabus (e.g. the 2024 and 2022 Tamil parts, mostly poets and literature):
  // still practised and mocked, but left out of how often a topic is asked (content.topicIndex).
  rankingExcludedSections?: Question["section"][];
}

export interface ContentBundle {
  version: string;
  builtAt: string;
  papers: Paper[]; // newest first
  units: { id: string; nameEn: string; nameTa: string | null; questions: number }[];
  topics?: { id: string; unitId: string; nameEn: string; nameTa: string | null }[]; // optional until the pipeline emits it
  questions: Question[];
  terms?: Term[]; // Term Bridge, optional until the pipeline emits it
}

/** One English-Tamil technical term pair (Term Bridge), with the past questions it appears in. */
export interface Term {
  en: string;
  ta: string;
  unitId: string;
  questionIds: string[];
}

export interface EventBase {
  eventId: string;
  deviceId: string;
  at: string; // ISO 8601
  schemaVersion: 1;
  sessionId: string;
}

export interface AnswerGiven extends EventBase {
  type: "answer";
  questionId: string;
  chosen: Option;
  confidence: Confidence;
  timeMs: number;
  mode: "diagnostic" | "practice" | "review" | "mock";
  contentVersion: string;
}

/** Why a miss happened, tagged at session close (minutes after the answer, so it is its own event). */
export type ErrorReason = "concept" | "careless" | "misread" | "time" | "memory" | "other";

export interface ErrorTagged extends EventBase {
  type: "errorTag";
  answerEventId: string; // the AnswerGiven being explained
  questionId: string;
  reason: ErrorReason;
}

/** AK's check of a question's topic tag: right as it is, moved to another topic, or no syllabus topic fits. */
export type TagVerdict = "confirm" | "change" | "nofit";

export interface TagReviewed extends EventBase {
  type: "tagReview";
  questionId: string;
  verdict: TagVerdict;
  topicId: string; // the question's topic after the review (the same topic for confirm and nofit)
}

export type LearningEvent = AnswerGiven | ErrorTagged | TagReviewed;
