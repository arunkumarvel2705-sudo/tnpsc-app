// Practice tab: work straight through a whole paper section (the early version's home screen).
import { summarise } from "../../core/scoring";
import type { AnswerGiven, ContentBundle, Question } from "../../core/types";

export function Papers({ bundle, answers, progress, onStart }: {
  bundle: ContentBundle;
  answers: AnswerGiven[];
  progress: Record<string, number>;
  onStart: (section: Question["section"], title: string) => void;
}) {
  const questions = new Map(bundle.questions.map((q) => [q.id, q]));
  return (
    <>
      {bundle.papers.map((p) => (
        <section key={p.id}>
          <h2 className="paper">{p.title}</h2>
          {p.sections.map((s) => {
            const qs = bundle.questions.filter((q) => q.section === s.id);
            const sum = summarise(answers.filter((e) => questions.get(e.questionId)?.section === s.id), questions);
            const at = progress[s.id] ?? 0;
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
                <button className="primary wide" onClick={() => onStart(s.id, s.title)}>
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
