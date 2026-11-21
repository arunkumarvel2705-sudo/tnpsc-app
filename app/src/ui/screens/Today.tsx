// Today tab (agent: today). Contract: ./contracts.ts TodayProps.
import type { TodayProps } from "./contracts";

export function Today({ state }: TodayProps) {
  return <article className="card"><h3>Today</h3><p className="muted">{state.plan.focus?.why ?? "Nothing planned yet."}</p></article>;
}
