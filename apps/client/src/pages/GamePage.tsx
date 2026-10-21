import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';

interface GameMeta {
  id: string;
  caseTitle: string;
  mode: 'solo' | 'coop';
  status: string;
}

export function GamePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const game = useQuery({
    queryKey: ['game', id],
    queryFn: () => api.get<GameMeta>(`/api/games/${id}`),
  });

  if (game.isLoading) return <p className="muted">{t('app.loading')}</p>;
  if (game.error) return <p className="form-error">{errorMessage(game.error)}</p>;
  return (
    <div className="stack">
      <h1>{game.data!.caseTitle}</h1>
      <p className="muted">{t('game.underConstruction')}</p>
      <Link to="/">{t('app.back')}</Link>
    </div>
  );
}
