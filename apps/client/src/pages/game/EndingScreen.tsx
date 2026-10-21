import { Link } from 'react-router';
import { useGame } from '../../lib/game';
import { MiniMarkdown } from '../../components/MiniMarkdown';

export function EndingScreen() {
  const { view } = useGame();
  const e = view.ending!;
  return (
    <div className="content ending">
      <article className={`stack-lg ending-${e.tone}`}>
        <header className="center">
          <p className="small muted">{view.caseTitle}</p>
          <h1>{e.title}</h1>
        </header>
        <div className="paper doc-text">
          <MiniMarkdown text={e.epilogue} />
        </div>
        <section className="card stack-sm">
          <h2>Podsumowanie śledztwa</h2>
          <dl className="summary">
            {e.summary.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        {e.decisions.length > 0 && (
          <section className="card stack-sm">
            <h2>Twoje decyzje</h2>
            <ol>
              {e.decisions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ol>
          </section>
        )}
        <section className="card stack-sm center">
          <h2>Kolekcja zakończeń</h2>
          <p>
            Odkryte zakończenia tej sprawy: <strong>{e.collection.unlocked}</strong> z{' '}
            {e.collection.total}.
          </p>
          <p className="muted">Każda decyzja ma znaczenie. Spróbuj jeszcze raz – inną drogą.</p>
          <Link className="button primary" to="/">
            Wróć do spraw
          </Link>
        </section>
      </article>
    </div>
  );
}
