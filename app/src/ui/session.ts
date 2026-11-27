// A study session: an ordered list of questions worked through one at a time.
// Stored after every answer so the app resumes at the same question after being closed (AT-U2).
import type { AnswerGiven, Question } from "../core/types";

export type SessionKind = "focus" | "quick" | "diagnostic" | "paper" | "custom"; // custom: a Practice builder set

export interface Session {
  id: string; // also the sessionId on every AnswerGiven in it
  kind: SessionKind;
  mode: AnswerGiven["mode"];
  title: string; // shown in the header, e.g. "Focus: Technical terms"
  questionIds: string[];
  index: number; // next question to show
  startedAt: string; // ISO
  // kind "paper": the resume pointer to keep in step, a progressKey ("<paperId>:<section>"). The name is
  // kept from when it held just the section, so sessions saved by older versions still load (migrateSession).
  paperSection?: string;
}

export function newSession(kind: SessionKind, title: string, questionIds: string[], at: string, id: string, paperSection?: string): Session {
  const mode: AnswerGiven["mode"] = kind === "diagnostic" ? "diagnostic" : kind === "quick" ? "review" : "practice";
  return { id, kind, mode, title, questionIds, index: 0, startedAt: at, paperSection };
}

// "Work through a section" progress (localStorage tj.progress) is per paper and section, since every paper
// has its own Tamil and GS sections. Before multi-paper bundles it was keyed by bare section ("tamil"),
// and the only paper then was Group 4 2025, so a bare key belongs to it.
export const LEGACY_PAPER_ID = "ccse4_2025";

export function progressKey(paperId: string, section: Question["section"]): string {
  return `${paperId}:${section}`;
}

/** A progress key from any version: a bare section becomes LEGACY_PAPER_ID's. */
export function qualifyProgressKey(key: string): string {
  return key.includes(":") ? key : `${LEGACY_PAPER_ID}:${key}`;
}

/** Stored progress -> per-paper keys. If both a bare and a qualified key exist, the qualified one is newer and wins. */
export function migrateProgress(raw: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.includes(":")) out[qualifyProgressKey(k)] = v;
  for (const [k, v] of Object.entries(raw)) if (k.includes(":")) out[k] = v;
  return out;
}

/** A stored paper session from before multi-paper bundles points at a bare section; qualify it. */
export function migrateSession(s: Session): Session {
  return s.paperSection && !s.paperSection.includes(":") ? { ...s, paperSection: qualifyProgressKey(s.paperSection) } : s;
}
