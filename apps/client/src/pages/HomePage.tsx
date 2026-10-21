import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CaseSummary, GameListItem } from '@detektyw/shared';
import { api, errorMessage } from '../lib/api';
import { useMe } from '../lib/auth';
import { FormError } from '../components/Field';

export function HomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const games = useQuery({
    queryKey: ['games'],
    queryFn: () => api.get<{ games: GameListItem[] }>('/api/games').then((r) => r.games),
  });
  const cases = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.get<{ cases: CaseSummary[] }>('/api/cases').then((r) => r.cases),
  });
  const active = games.data?.filter((g) => g.status !== 'abandoned') ?? [];

  return (
    <div className="stack-lg">
      <section aria-labelledby="my-cases">
        <h1 id="my-cases">{t('home.myCases')}</h1>
        {games.isLoading ? (
          <p className="muted">{t('app.loading')}</p>
        ) : active.length === 0 ? (
          <p className="muted">{t('home.noCases')}</p>
        ) : (
          <ul className="list">
            {active.map((g) => (
              <li key={g.id} className="card case-item">
                <div>
                  <strong>{g.caseTitle}</strong>
                  <div className="small muted">
                    {g.mode === 'coop' ? t('home.coop') : t('home.solo')} ·{' '}
                    {t(`home.status.${g.status}`)} ·{' '}
                    {t('home.updated', { date: new Date(g.updatedAt).toLocaleString('pl-PL') })}
                  </div>
                </div>
                <Link className="button" to={`/gra/${g.id}`}>
                  {t('home.continue')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="new-case">
        <h2 id="new-case">{t('home.newCase')}</h2>
        <ul className="list">
          {cases.data?.map((c) => (
            <NewCaseCard
              key={c.id}
              summary={c}
              defaultNoHints={me?.settings.noHintsChallenge ?? false}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function NewCaseCard({
  summary,
  defaultNoHints,
}: {
  summary: CaseSummary;
  defaultNoHints: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'solo' | 'coop'>('solo');
  const [noHints, setNoHints] = useState(defaultNoHints);
  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>('/api/games', { caseId: summary.id, mode, noHints }),
    onSuccess: ({ id }) => navigate(`/gra/${id}`),
  });

  return (
    <li className="card stack">
      <h3>{summary.title}</h3>
      <p>{summary.teaser}</p>
      <p className="small muted">{t('home.estimated', { time: summary.estimatedHours })}</p>
      {summary.contentWarning && <p className="small warn-text">{summary.contentWarning}</p>}
      <fieldset className="segmented">
        <legend className="sr-only">Tryb gry</legend>
        {(['solo', 'coop'] as const).map((m) => (
          <label key={m} className={mode === m ? 'active' : undefined}>
            <input
              type="radio"
              name={`mode-${summary.id}`}
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {t(`home.${m}`)}
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={noHints} onChange={(e) => setNoHints(e.target.checked)} />
        <span>{t('home.noHints')}</span>
      </label>
      <FormError message={create.error ? errorMessage(create.error) : null} />
      <button className="primary" onClick={() => create.mutate()} disabled={create.isPending}>
        {t('home.start')}
      </button>
    </li>
  );
}
