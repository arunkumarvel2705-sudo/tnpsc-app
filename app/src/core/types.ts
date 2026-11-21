// Data contracts (spec: "Data contracts"). Content is read-only; events are immutable and append-only.

export type Option = "A" | "B" | "C" | "D" | "E"; // E = Answer not known
export type Confidence = "sure" | "guess" | "none";

export interface QuestionText {
  stem: string;
  options: Record<Option, string>;
}

export interface Question {
  id: string;
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
  topicId?: string;
  unitId?: string;
  source: { exam: string; year: number; paper: string; qNo: number; pdfRef: string; page: number };
}

export interface Paper {
  id: string;
  title: string;
  date: string;
  sections: { id: Question["section"]; title: string; questions: number }[];
}

export interface ContentBundle {
  version: string;
  builtAt: string;
  papers: Paper[];
  units: { id: string; nameEn: string; nameTa: string | null; questions: number }[];
  questions: Question[];
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

export type LearningEvent = AnswerGiven;
