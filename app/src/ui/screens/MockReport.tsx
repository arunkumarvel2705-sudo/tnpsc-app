// Mock report screen (agent: mock-report). Contract: ./contracts.ts MockReportProps.
import type { MockReportProps } from "./contracts";

export function MockReport({ onDone }: MockReportProps) {
  return (
    <main className="wrap">
      <p>Mock submitted.</p>
      <button className="primary wide" onClick={onDone}>Done</button>
    </main>
  );
}
