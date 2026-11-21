// Session close (agent: session-close). Contract: ./contracts.ts SessionCloseProps.
import type { SessionCloseProps } from "./contracts";

export function SessionClose({ session, onDone }: SessionCloseProps) {
  return (
    <main className="wrap">
      <article className="card"><h3>{session.title}: done</h3></article>
      <button className="primary wide" onClick={onDone}>Done</button>
    </main>
  );
}
