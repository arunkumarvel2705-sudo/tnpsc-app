// Progress tab (agent: progress). Contract: ./contracts.ts ProgressProps.
import type { ProgressProps } from "./contracts";

export function Progress({ state }: ProgressProps) {
  return <article className="card"><h3>Progress</h3><p className="muted">{state.skills.size} units</p></article>;
}
