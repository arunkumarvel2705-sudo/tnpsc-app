// Today tab (agent: today). Contract: ./contracts.ts TodayProps.
// What to do now: resume, today's ring, the next focus session (with its reasons), a quick review, the week.
import { useMemo, useState } from "react";
import { topicIndex } from "../../core/content";
import type { TodayProps } from "./contracts";
import {
  answeredOn, boxTone, focusLineParts, minutesFor, plannedTotal, plural, quickMinutes, ringFraction,
  SECONDS_PER_QUESTION, sessionTitle, unitName, weekDays, whyFactors,
} from "./today.helpers";
import "./today.css";

export function Today({ state, bundle, log, today, resumable, onStart, onResume }: TodayProps) {
  const { plan } = state;
  const done = answeredOn(log, today);
  const total = plannedTotal(plan);

  return (
    <div className="today">
      {resumable && resumable.index < resumable.questionIds.length && (
        <article className="card today-resume">
          <p className="today-resume-text">
            <b>Continue {resumable.title}</b>, question {resumable.index + 1} of {resumable.questionIds.length}
          </p>
          <div className="bar thin"><div style={{ width: `${(resumable.index / resumable.questionIds.length) * 100}%` }} /></div>
          <button className="primary wide" onClick={onResume}>Continue</button>
        </article>
      )}

      <DailyRing done={done} total={total} />

      {plan.focus ? <FocusCard {...{ state, bundle, onStart }} /> : <FirstRun />}

      <QuickCard plan={plan} onStart={onStart} />

      <Week today={today} log={log} />
    </div>
  );
}

function DailyRing({ done, total }: { done: number; total: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = ringFraction(done, total);
  const line =
    done === 0 ? "Ready when you are."
    : total > 0 && done >= total ? "Today's plan is covered. Anything more is extra."
    : total > 0 ? `${total - done} more in today's plan.`
    : "Nice work today.";
  return (
    <article className="card today-ring" aria-label={`${done} answered today${total ? ` of ${total} planned` : ""}`}>
      <div className="ring" role="img" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle className="track" cx="50" cy="50" r={r} />
          <circle className="fill" cx="50" cy="50" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
        </svg>
        <span className="ring-num">{done}</span>
      </div>
      <div>
        <h3>Today</h3>
        <p className="today-ring-count">
          {done} {total > 0 ? `of ${total}` : ""} answered
        </p>
        <p className="muted small today-tight">{line}</p>
      </div>
    </article>
  );
}

function FocusCard({ state, bundle, onStart }: Pick<TodayProps, "state" | "bundle" | "onStart">) {
  const { plan, skills } = state;
  const focus = plan.focus!;
  const [open, setOpen] = useState(false);
  const topic = useMemo(() => topicIndex(bundle).find((t) => t.topicId === focus.topicId), [bundle, focus.topicId]);
  const skill = skills.get(focus.unitId);
  const title = sessionTitle(plan, bundle)!;
  const n = plan.practiceSet.length;
  const diagnostic = plan.mode === "diagnostic";
  const [weak, papers, path] = focusLineParts(focus, skill, topic);
  const why = whyFactors(focus, skill, topic, unitName(bundle, focus.unitId));

  return (
    <article className="card today-focus">
      <p className="muted small today-eyebrow">Next session</p>
      <h3>{title}</h3>
      <p className="small today-reason">
        <span className={`today-tone ${boxTone(focus.box)}`}>{weak}</span>
        <span className="muted"> · {papers} · {path}</span>
      </p>
      {n > 0 ? (
        <>
          <p className="muted small today-tight">
            {plural(n, "question")} · about {minutesFor(n, SECONDS_PER_QUESTION)} min
            {diagnostic ? " · a short check to see where you stand" : ""}
          </p>
          <button className="primary wide today-start" onClick={() => onStart(diagnostic ? "diagnostic" : "focus", title, plan.practiceSet)}>
            Start
          </button>
        </>
      ) : (
        <p className="muted small">You've worked through this topic for now. A quick review is below.</p>
      )}
      <button className="link today-why" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide why" : "Why this?"}
      </button>
      {open && (
        <div className="today-why-body">
          <ul>
            {why.factors.map((f) => (
              <li key={f.key}>
                <div className="today-why-row">
                  <span className={f.key === "weakness" ? `today-tone ${f.tone}` : "today-why-title"}>{f.title}</span>
                  <span className="muted small">× {f.value}</span>
                </div>
                <p className="muted small today-tight">{f.detail}</p>
              </li>
            ))}
          </ul>
          <p className="small today-tight">{why.score}</p>
        </div>
      )}
    </article>
  );
}

function FirstRun() {
  return (
    <article className="card">
      <p className="muted small today-eyebrow">Getting started</p>
      <h3>Start with a paper</h3>
      <p className="muted small today-tight">
        Open the <b>Practice</b> tab below and work through a section at your own pace. After a few answers this page
        will pick what to study next, and tell you why.
      </p>
    </article>
  );
}

function QuickCard({ plan, onStart }: { plan: TodayProps["state"]["plan"]; onStart: TodayProps["onStart"] }) {
  const k = plan.quick.length;
  if (k === 0) {
    return (
      <article className="card">
        <h3>Quick review</h3>
        <p className="muted small today-tight">Nothing due. You're clear for today.</p>
      </article>
    );
  }
  const dueIds = new Set(plan.review.cardIds.filter((id) => id.startsWith("q:")).map((id) => id.slice(2)));
  const due = plan.quick.filter((id) => dueIds.has(id)).length;
  const rest = k - due;
  const source =
    due && rest ? `${due} due for review, ${rest} from today's focus`
    : due ? "All due for review"
    : "A short warm-up from today's focus";
  return (
    <article className="card">
      <h3>Quick review: {plural(k, "item")}, about {quickMinutes(k)} min</h3>
      <p className="muted small today-tight">{source}</p>
      <button className="wide today-start" onClick={() => onStart("quick", "Quick review", plan.quick)}>Start quick review</button>
    </article>
  );
}

function Week({ today, log }: { today: string; log: TodayProps["log"] }) {
  const days = weekDays(today, log);
  return (
    <article className="card today-week">
      <h3>This week</h3>
      <ol className="today-dots">
        {days.map((d) => (
          <li key={d.day} aria-label={`${d.name}${d.isToday ? " (today)" : ""}: ${d.active ? "practised" : "no answers"}`}>
            <span className={`dot${d.active ? " on" : ""}${d.isToday ? " now" : ""}${d.future ? " later" : ""}`} />
            <span className={`small ${d.isToday ? "today-now" : "muted"}`}>{d.label}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
