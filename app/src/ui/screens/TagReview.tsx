// Tag review: AK checks the topic tags the tagger was unsure of, one question at a time. Each answer is a
// TagReviewed event (synced like answers); the shell applies them to the bundle at once.
import { useMemo, useState } from "react";
import type { ContentBundle, Option, Question, TagReviewed } from "../../core/types";
import { matchTable, questionLang, stemLines, switchLabel, type GsLang } from "../format";

export function TagReview({ bundle, queue, gsLang, onGsLang, onReview, onExit }: {
  bundle: ContentBundle; // with reviews already applied
  queue: string[]; // content.tagReviewQueue(bundle)
  gsLang: GsLang;
  onGsLang: (l: GsLang) => void;
  onReview: (questionId: string, verdict: TagReviewed["verdict"], topicId: string) => void;
  onExit: () => void;
}) {
  const byId = useMemo(() => new Map(bundle.questions.map((q) => [q.id, q])), [bundle]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const left = queue.filter((id) => !skipped.includes(id));
  const q = left.length ? byId.get(left[0]) : undefined;

  if (!q) {
    return (
      <main className="wrap">
        <header className="qhead"><button className="link" onClick={onExit}>← Done</button></header>
        <p className="card">{queue.length ? `You skipped the ${queue.length} left; they will be here next time.` : "No tags waiting for review."}</p>
        {skipped.length > 0 && <button onClick={() => setSkipped([])}>Go through the skipped ones</button>}
      </main>
    );
  }
  const decide = (verdict: TagReviewed["verdict"], topicId: string) => { setPicking(false); onReview(q.id, verdict, topicId); };
  return (
    <main className="wrap">
      <header className="qhead">
        <button className="link" onClick={onExit}>← Done</button>
        <span className="muted">Topic tags · {left.length} left</span>
      </header>
      <QuestionView q={q} bundle={bundle} gsLang={gsLang} onGsLang={onGsLang} />
      {picking ? (
        <TopicPicker bundle={bundle} q={q} onPick={(t) => decide(t === q.topicId ? "confirm" : "change", t)} onCancel={() => setPicking(false)} />
      ) : (
        <div className="card tr-tag">
          <p className="muted small">Tagged as ({Math.round((q.tagConfidence ?? 0) * 100)}% sure)</p>
          <TopicName bundle={bundle} topicId={q.topicId} />
          <div className="row">
            <button className="primary" onClick={() => decide("confirm", q.topicId!)}>Looks right</button>
            <button onClick={() => setPicking(true)}>Change topic</button>
          </div>
          <div className="row">
            <button onClick={() => decide("nofit", q.topicId!)}>No topic fits</button>
            <button className="link" onClick={() => setSkipped([...skipped, q.id])}>Skip for now</button>
          </div>
        </div>
      )}
    </main>
  );
}

function TopicName({ bundle, topicId }: { bundle: ContentBundle; topicId?: string }) {
  const t = bundle.topics?.find((x) => x.id === topicId);
  const u = bundle.units.find((x) => x.id === t?.unitId);
  return (
    <p>
      <span className="muted">{u?.nameEn ?? t?.unitId} › </span><b>{t?.nameEn ?? topicId}</b>
      {t?.nameTa && <span lang="ta"> ({t.nameTa})</span>}
    </p>
  );
}

/** Topics of the question's own part (Tamil units for Part A; General Studies and aptitude for Part B). */
function TopicPicker({ bundle, q, onPick, onCancel }: { bundle: ContentBundle; q: Question; onPick: (topicId: string) => void; onCancel: () => void }) {
  const tamil = (id: string) => id.split(".")[1] === "ta";
  const units = bundle.units.filter((u) => tamil(u.id) === (q.section === "tamil"));
  return (
    <div className="card tr-pick">
      <div className="row"><b>Move to which topic?</b><button className="link" onClick={onCancel}>Cancel</button></div>
      {units.map((u) => (
        <details key={u.id} open={u.id === q.unitId}>
          <summary>{u.nameEn}{u.nameTa ? ` · ${u.nameTa}` : ""}</summary>
          {(bundle.topics ?? []).filter((t) => t.unitId === u.id).map((t) => (
            <button key={t.id} className={`opt${t.id === q.topicId ? " chosen" : ""}`} onClick={() => onPick(t.id)}>
              {t.nameEn}{t.nameTa && <span lang="ta"> · {t.nameTa}</span>}
            </button>
          ))}
        </details>
      ))}
    </div>
  );
}

/** The question as the player shows it, with the accepted answer marked: enough to judge the topic. */
function QuestionView({ q, bundle, gsLang, onGsLang }: { q: Question; bundle: ContentBundle; gsLang: GsLang; onGsLang: (l: GsLang) => void }) {
  const { lang, canSwitch } = questionLang(q, gsLang);
  const text = q[lang] ?? q.en ?? q.ta;
  const paper = bundle.papers.find((p) => p.id === q.paperId);
  if (!text) return <p className="card">This question has no text.</p>;
  const table = q.format === "match" ? matchTable(text.stem) : null;
  const right = (o: Option) => q.accepted === "ALL" || (o !== "E" && q.accepted.includes(o));
  return (
    <>
      <p className="muted small">{paper?.title ?? q.paperId} · Q{q.n}</p>
      {canSwitch && (
        <div className="langswitch"><button className="link" lang={lang === "en" ? "ta" : "en"}
          onClick={() => onGsLang(lang === "en" ? "ta" : "en")}>{switchLabel(lang)}</button></div>
      )}
      <div className={`stem ${lang}`} lang={lang}>
        {table ? (
          <>
            <p>{table.intro}</p>
            <table className="match"><tbody>
              {table.left.map((l, k) => (<tr key={k}><td>({"abcd"[k]}) {l}</td><td>{k + 1}. {table.right[k]}</td></tr>))}
            </tbody></table>
          </>
        ) : stemLines(text.stem).map((l, k) => <p key={k}>{l}</p>)}
      </div>
      <div className={`opts ${lang}`} lang={lang}>
        {(Object.keys(text.options) as Option[]).filter((o) => o !== "E").map((o) => (
          <div key={o} className={`opt${right(o) ? " right" : ""}`}><b>({o})</b> <span>{text.options[o]}</span></div>
        ))}
      </div>
    </>
  );
}
