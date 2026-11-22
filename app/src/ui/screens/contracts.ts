// Fixed props for each screen. The shell (App.tsx) owns state, storage and sync; screens only render
// and call back. Screens must not import from ../../sync or touch localStorage.
import type { EngineState } from "../../core/engine";
import type { ContentBundle, ErrorReason, LearningEvent } from "../../core/types";
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
