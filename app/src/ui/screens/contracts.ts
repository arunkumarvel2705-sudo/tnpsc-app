// Fixed props for each screen. The shell (App.tsx) owns state, storage and sync; screens only render
// and call back. Screens must not import from ../../sync or touch localStorage.
import type { EngineState } from "../../core/engine";
import type { ContentBundle, ErrorReason, LearningEvent } from "../../core/types";
import type { MockDraft } from "../mock";
import type { Session, SessionKind } from "../session";

export interface TodayProps {
  state: EngineState;
  bundle: ContentBundle;
  log: LearningEvent[]; // validated, ordered
  today: string; // IST day, YYYY-MM-DD
  resumable: Session | null; // an unfinished session, if any
  onStart: (kind: Exclude<SessionKind, "paper">, title: string, questionIds: string[]) => void;
  onResume: () => void;
}

export interface ProgressProps {
  state: EngineState;
  bundle: ContentBundle;
  log: LearningEvent[];
  today: string;
  onPractise: (title: string, questionIds: string[]) => void; // e.g. retest one mistake's questions now
}

export interface SessionCloseProps {
  session: Session; // finished
  bundle: ContentBundle;
  log: LearningEvent[]; // includes this session's answers and any tags already given
  onTag: (answerEventId: string, questionId: string, reason: ErrorReason) => void;
  onDone: () => void;
}

export interface MockRunnerProps {
  bundle: ContentBundle;
  draft: MockDraft;
  nowMs: () => number; // clock, injected so the timer can be tested
  onChange: (draft: MockDraft) => void; // every answer, flag, confidence change or move: the shell saves it
  onSubmit: (draft: MockDraft, reason: "manual" | "timeout") => void; // shell records the answers and opens the report
  onPause: () => void; // leave the mock screen; the clock keeps running
}

export interface MockReportProps {
  bundle: ContentBundle;
  log: LearningEvent[];
  sessionId: string; // the mock's id
  paperId: string;
  timeUsedMs: number;
  onPractise: (title: string, questionIds: string[]) => void; // e.g. the wrong-while-sure questions
  onDone: () => void;
}
