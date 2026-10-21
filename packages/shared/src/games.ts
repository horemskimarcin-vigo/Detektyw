import { z } from 'zod';

/** Publiczny opis sprawy (bez żadnych spoilerów). */
export interface CaseSummary {
  id: string;
  title: string;
  teaser: string;
  estimatedHours: string;
  contentWarning: string;
}

export const createGameRequest = z.object({
  caseId: z.string().min(1).max(64),
  mode: z.enum(['solo', 'coop']),
  noHints: z.boolean().optional(),
});
export type CreateGameRequest = z.infer<typeof createGameRequest>;

export type GameStatus = 'active' | 'finished' | 'abandoned';

export interface GameListItem {
  id: string;
  caseId: string;
  caseTitle: string;
  mode: 'solo' | 'coop';
  status: GameStatus;
  players: { userId: string; displayName: string; seat: number }[];
  createdAt: string;
  updatedAt: string;
}
