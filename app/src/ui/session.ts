// A study session: an ordered list of questions worked through one at a time.
// Stored after every answer so the app resumes at the same question after being closed (AT-U2).
import type { AnswerGiven } from "../core/types";

export type SessionKind = "focus" | "quick" | "diagnostic" | "paper";

export interface Session {
  id: string; // also the sessionId on every AnswerGiven in it
  kind: SessionKind;
  mode: AnswerGiven["mode"];
  title: string; // shown in the header, e.g. "Focus: Technical terms"
  questionIds: string[];
  index: number; // next question to show
  startedAt: string; // ISO
  paperSection?: string; // kind "paper": which section's resume pointer to keep in step
}

export function newSession(kind: SessionKind, title: string, questionIds: string[], at: string, id: string, paperSection?: string): Session {
  const mode: AnswerGiven["mode"] = kind === "diagnostic" ? "diagnostic" : kind === "quick" ? "review" : "practice";
  return { id, kind, mode, title, questionIds, index: 0, startedAt: at, paperSection };
}
