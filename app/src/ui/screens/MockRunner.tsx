// Mock exam screen (agent: mock-runner). Contract: ./contracts.ts MockRunnerProps.
import type { MockRunnerProps } from "./contracts";

export function MockRunner({ draft, onSubmit }: MockRunnerProps) {
  return (
    <main className="wrap">
      <p>Mock: {Object.keys(draft.answers).length} of {draft.questionIds.length} answered</p>
      <button className="primary wide" onClick={() => onSubmit(draft, "manual")}>Submit</button>
    </main>
  );
}
