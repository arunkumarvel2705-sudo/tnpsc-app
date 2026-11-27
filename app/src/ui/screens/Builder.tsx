// Practice tab: build a set to drill (subject, unit, topic, papers, which questions, how many) and start it.
import { useMemo, type ReactNode } from "react";
import { BUILDER_COUNTS, builderPool, statusCounts, SUBJECTS, type BuilderSpec, type BuilderStatus } from "../../core/builder";
import type { AnswerGiven, ContentBundle } from "../../core/types";
import { paperYear, STATUS_LABEL, topicsOf, unitGroups } from "./builder.helpers";
import "./builder.css";

export function Builder({ bundle, answers, spec, onChange, onStart }: {
  bundle: ContentBundle;
  answers: AnswerGiven[];
  spec: BuilderSpec;
  onChange: (spec: BuilderSpec) => void; // the shell remembers the last choices
  onStart: (spec: BuilderSpec) => void; // the shell picks the set (seeded) and starts the session
}) {
  const counts = useMemo(() => statusCounts(bundle, answers, spec), [bundle, answers, spec]);
  const pool = useMemo(() => builderPool(bundle, answers, spec).length, [bundle, answers, spec]);
  const set = (s: Partial<BuilderSpec>) => onChange({ ...spec, ...s });
  const topics = topicsOf(bundle, spec.unitId);
  const n = Math.min(pool, spec.count);
  const togglePaper = (id: string) => {
    const on = spec.paperIds.length ? spec.paperIds : bundle.papers.map((p) => p.id);
    const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id];
    set({ paperIds: next.length === bundle.papers.length || next.length === 0 ? [] : next });
  };

  return (
    <section className="card bd">
      <p className="bd-title"><b>Build a practice set</b></p>

      <Row label="Subject">
        <Chip on={spec.subject === "all"} onClick={() => set({ subject: "all", unitId: null, topicId: null })}>All</Chip>
        {SUBJECTS.map((s) => (
          <Chip key={s.id} on={spec.subject === s.id} onClick={() => set({ subject: s.id, unitId: null, topicId: null })}>
            {s.id === "gs" ? "GS" : s.label}
          </Chip>
        ))}
      </Row>

      <label className="bd-label" htmlFor="bd-unit">Unit</label>
      <select id="bd-unit" className="bd-select" value={spec.unitId ?? ""}
        onChange={(e) => set({ unitId: e.target.value || null, topicId: null })}>
        <option value="">All units</option>
        {unitGroups(bundle, spec.subject).map((g) => (
          <optgroup key={g.id} label={g.label}>
            {g.units.map((u) => <option key={u.id} value={u.id}>{u.nameEn}</option>)}
          </optgroup>
        ))}
      </select>

      {topics.length > 0 && (
        <>
          <label className="bd-label" htmlFor="bd-topic">Topic</label>
          <select id="bd-topic" className="bd-select" value={spec.topicId ?? ""} onChange={(e) => set({ topicId: e.target.value || null })}>
            <option value="">All topics</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.nameEn}</option>)}
          </select>
        </>
      )}

      <Row label="Questions">
        {(["any", "new", "wrong", "unsure"] as BuilderStatus[]).map((s) => (
          <Chip key={s} on={spec.status === s} onClick={() => set({ status: s })}>
            {STATUS_LABEL[s]} <span className="bd-n">{counts[s]}</span>
          </Chip>
        ))}
      </Row>

      <Row label="Papers">
        <Chip on={spec.paperIds.length === 0} onClick={() => set({ paperIds: [] })}>All</Chip>
        {bundle.papers.map((p) => (
          <Chip key={p.id} on={spec.paperIds.includes(p.id)} onClick={() => togglePaper(p.id)}>{paperYear(p)}</Chip>
        ))}
      </Row>

      <Row label="How many">
        {BUILDER_COUNTS.map((c) => <Chip key={c} on={spec.count === c} onClick={() => set({ count: c })}>{c}</Chip>)}
      </Row>

      <button className="primary wide" disabled={n === 0} onClick={() => onStart(spec)}>
        {n === 0 ? "Nothing matches" : `Start ${n} question${n === 1 ? "" : "s"}`}
      </button>
      {n > 0 && pool > n && <p className="muted small bd-foot">{n} picked at random from {pool} that match.</p>}
      {n > 0 && pool < spec.count && <p className="muted small bd-foot">Only {pool} match these choices.</p>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bd-row">
      <span className="bd-label">{label}</span>
      <div className="bd-chips" role="group" aria-label={label}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={`bd-chip${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>{children}</button>;
}
