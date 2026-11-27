// Term Bridge: search the English-Tamil technical terms, or hide the Tamil side to test yourself.
import { useMemo, useState } from "react";
import type { ContentBundle } from "../../core/types";
import { filterTerms, fromPapers, termsByUnit } from "./terms.helpers";

export function TermBridge({ bundle, onExit }: { bundle: ContentBundle; onExit: () => void }) {
  const [query, setQuery] = useState("");
  const [hide, setHide] = useState(false);
  const [papersOnly, setPapersOnly] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const all = bundle.terms ?? [];
  const groups = useMemo(() => termsByUnit(bundle, filterTerms(papersOnly ? fromPapers(all) : all, query)), [bundle, all, papersOnly, query]);
  const total = all.length;
  const inPapers = fromPapers(all).length;
  const key = (en: string, ta: string) => `${en}|${ta}`;
  return (
    <main className="wrap">
      <header className="qhead">
        <button className="link" onClick={onExit}>← Back</button>
        <span className="muted">Term Bridge · {total} terms</span>
      </header>
      <p className="muted small">English and Tamil names of the same thing: {inPapers} from the bilingual question papers, the rest from the glossaries of the Class 6–10 English-medium books. Use them to read Tamil-medium books and the Tamil side of General Studies.</p>
      <input className="tb-search" type="search" placeholder="Search in English or தமிழ்" value={query} onChange={(e) => setQuery(e.target.value)} />
      <label className="tb-hide"><input type="checkbox" checked={hide} onChange={(e) => { setHide(e.target.checked); setShown(new Set()); }} /> Hide Tamil and test myself</label>
      <label className="tb-hide"><input type="checkbox" checked={papersOnly} onChange={(e) => setPapersOnly(e.target.checked)} /> Only terms asked in question papers</label>
      {groups.length === 0 && <p className="card">No term matches.</p>}
      {groups.map((g) => (
        <article key={g.unitId} className="card">
          <h4>{g.name} <span className="muted small">{g.terms.length}</span></h4>
          <ul className="tb-list">
            {g.terms.map((t) => {
              const k = key(t.en, t.ta);
              const hidden = hide && !shown.has(k);
              return (
                <li key={k}>
                  <span className="tb-en">
                    {t.en}
                    {t.questionIds.length > 0 && <span className="tb-tag">in papers</span>}
                    {t.meaning && <span className="tb-mean">{t.meaning}</span>}
                    {t.seenIn && t.seenIn.length > 0 && <span className="tb-mean">{t.seenIn.join(" · ")}</span>}
                  </span>
                  {hidden ? (
                    <button className="link" onClick={() => setShown(new Set(shown).add(k))}>Show Tamil</button>
                  ) : (
                    <span className="tb-ta" lang="ta">{t.ta}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </main>
  );
}
