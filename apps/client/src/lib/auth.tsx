import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@detektyw/shared';
import { api } from './api';
import { clearOfflineGames } from './game';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: PublicUser | null }>('/api/auth/me').then((r) => r.user),
    staleTime: 60_000,
  });
}

export function useSetMe() {
  const qc = useQueryClient();
  return (user: PublicUser | null) => {
    qc.setQueryData(['me'], user);
    // Po wylogowaniu nie zostawiamy w pamięci danych poprzedniego gracza.
    if (!user) {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      clearOfflineGames();
    }
  };
}
