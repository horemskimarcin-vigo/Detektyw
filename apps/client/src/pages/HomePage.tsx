import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseSummary, GameListItem } from '@detektyw/shared';
import { api, errorMessage } from '../lib/api';
import { useMe } from '../lib/auth';
import { FormError } from '../components/Field';
import { Confirm } from '../components/Sheet';

interface EndingsResponse {
  cases: {
    caseId: string;
    caseTitle: string;
    total: number;
    unlocked: { id: string; title: string; tone: string }[];
  }[];
}

export function HomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const games = useQuery({
    queryKey: ['games'],
    queryFn: () => api.get<{ games: GameListItem[] }>('/api/games').then((r) => r.games),
  });
  const cases = useQuery({
    queryKey: ['cases'],
    queryFn: () => api.get<{ cases: CaseSummary[] }>('/api/cases').then((r) => r.cases),
  });
  const endings = useQuery({
    queryKey: ['endings'],
    queryFn: () => api.get<EndingsResponse>('/api/endings'),
  });
  const [abandon, setAbandon] = useState<GameListItem | null>(null);
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
                    {g.mode === 'coop'
                      ? `${t('home.coop')}: ${g.players.map((p) => p.displayName).join(', ')}`
                      : t('home.solo')}{' '}
                    · {t(`home.status.${g.status}`)} ·{' '}
                    {t('home.updated', { date: new Date(g.updatedAt).toLocaleString('pl-PL') })}
                  </div>
                </div>
                <div className="row-buttons">
                  <Link className="button" to={`/gra/${g.id}`}>
                    {g.status === 'finished' ? 'Zakończenie' : t('home.continue')}
                  </Link>
                  {g.status === 'active' && (
                    <button
                      className="icon"
                      aria-label={`${t('home.abandon')}: ${g.caseTitle}`}
                      onClick={() => setAbandon(g)}
                    >
                      🗑
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <JoinForm />

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

      {endings.data && endings.data.cases.some((c) => c.unlocked.length > 0) && (
        <section aria-labelledby="collection" className="stack-sm">
          <h2 id="collection">Kolekcja zakończeń</h2>
          {endings.data.cases
            .filter((c) => c.unlocked.length > 0)
            .map((c) => (
              <div key={c.caseId} className="card stack-sm">
                <strong>
                  {c.caseTitle}: {c.unlocked.length}/{c.total}
                </strong>
                <ul className="chips">
                  {c.unlocked.map((e) => (
                    <li key={e.id} className={`pill tone-${e.tone}`}>
                      {e.title}
                    </li>
                  ))}
                  {Array.from({ length: c.total - c.unlocked.length }, (_, i) => (
                    <li key={`x${i}`} className="pill locked" aria-label="nieodkryte zakończenie">
                      ???
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>
      )}

      <Confirm
        open={!!abandon}
        onClose={() => setAbandon(null)}
        title={t('home.abandon')}
        confirmLabel={t('home.abandon')}
        danger
        onConfirm={async () => {
          if (!abandon) return;
          await api.post(`/api/games/${abandon.id}/abandon`);
          void qc.invalidateQueries({ queryKey: ['games'] });
        }}
      >
        <p>{t('home.abandonConfirm')}</p>
      </Confirm>
    </div>
  );
}

function JoinForm() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').trim();
    if (!code) return;
    try {
      const r = await api.post<{ id: string }>('/api/games/join', { code });
      navigate(`/gra/${r.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <form className="card stack-sm" onSubmit={onSubmit} aria-labelledby="join-h">
      <h2 id="join-h">Dołącz do śledztwa partnera</h2>
      <div className="chat-form">
        <input
          name="code"
          placeholder="Kod zaproszenia"
          aria-label="Kod zaproszenia"
          autoCapitalize="characters"
          maxLength={20}
        />
        <button type="submit">Dołącz</button>
      </div>
      <FormError message={error} />
    </form>
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
      {mode === 'coop' && (
        <p className="small muted">
          Po rozpoczęciu dostaniesz kod zaproszenia dla partnera (panel 👥 w grze).
        </p>
      )}
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
