// Practice tab: work straight through a whole paper section (the early version's home screen).
// Each paper in the bundle (newest first) has its own sections and its own resume pointers.
import { summarise } from "../../core/scoring";
import type { AnswerGiven, ContentBundle, Question } from "../../core/types";
import { progressKey } from "../session";

export function Papers({ bundle, answers, progress, onStart }: {
  bundle: ContentBundle;
  answers: AnswerGiven[];
  progress: Record<string, number>; // by progressKey(paperId, section)
  onStart: (paperId: string, section: Question["section"], title: string) => void;
}) {
  const questions = new Map(bundle.questions.map((q) => [q.id, q]));
  const many = bundle.papers.length > 1;
  return (
    <>
      {bundle.papers.map((p) => (
        <section key={p.id}>
          <h2 className="paper">{p.title}</h2>
          {p.sections.map((s) => {
            const inSection = (q: Question | undefined) => q?.paperId === p.id && q.section === s.id;
            const qs = bundle.questions.filter(inSection);
            if (!qs.length) return null;
            const sum = summarise(answers.filter((e) => inSection(questions.get(e.questionId))), questions);
            const at = progress[progressKey(p.id, s.id)] ?? 0;
            // With several papers the session header needs the paper too ("Continue Tamil" would be ambiguous).
            const title = many ? `${p.title}: ${s.title}` : s.title;
            return (
              <article className="card" key={s.id}>
                <div className="card-head">
                  <h3>{s.title}</h3>
                  <span className="muted">{sum.answered}/{qs.length}</span>
                </div>
                <div className="bar"><div style={{ width: `${(sum.answered / qs.length) * 100}%` }} /></div>
                {sum.scored > 0 && (
                  <dl className="stats">
                    <div><dt>Accuracy</dt><dd>{Math.round(sum.accuracy * 100)}%</dd></div>
                    <div><dt>Sure & right</dt><dd>{sum.sureCorrect}</dd></div>
                    <div><dt>Lucky guesses</dt><dd>{sum.luckyGuesses}</dd></div>
                    <div><dt className="warn">Misconceptions</dt><dd className="warn">{sum.misconceptions}</dd></div>
                  </dl>
                )}
                <button className="primary wide" onClick={() => onStart(p.id, s.id, title)}>
                  {at === 0 ? "Start" : at >= qs.length ? "Practise again" : `Continue from Q${qs[at].n}`}
                </button>
              </article>
            );
          })}
        </section>
      ))}
    </>
  );
}
