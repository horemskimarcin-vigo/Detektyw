import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { createGameRequest, type GameListItem } from '@detektyw/shared';
import { gameEvents, gamePlayers, games, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { parse } from '../validation.js';
import type { Db } from '../db/client.js';

/** Sprawdza, czy gracz należy do gry. Obca gra = 404 (nie zdradzamy jej istnienia). */
export async function requireMembership(db: Db, gameId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(gameId))
    throw new HttpError(404, 'not_found', 'Nie znaleziono sprawy.');
  const [row] = await db
    .select({ game: games, seat: gamePlayers.seat })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)));
  if (!row) throw new HttpError(404, 'not_found', 'Nie znaleziono sprawy.');
  return row;
}

export default async function gameRoutes(app: FastifyInstance) {
  const { db } = app;

  app.get('/cases', async (req) => {
    app.requireUser(req);
    return { cases: app.cases.list(app.config.env !== 'production') };
  });

  app.get('/games', async (req) => {
    const me = app.requireUser(req);
    const mine = await db
      .select({ game: games })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(eq(gamePlayers.userId, me.id))
      .orderBy(desc(games.updatedAt));
    const ids = mine.map((m) => m.game.id);
    const players = ids.length
      ? await db
          .select({
            gameId: gamePlayers.gameId,
            userId: gamePlayers.userId,
            seat: gamePlayers.seat,
            displayName: users.displayName,
          })
          .from(gamePlayers)
          .innerJoin(users, eq(users.id, gamePlayers.userId))
          .where(inArray(gamePlayers.gameId, ids))
      : [];
    const items: GameListItem[] = mine.map(({ game }) => ({
      id: game.id,
      caseId: game.caseId,
      caseTitle: app.cases.get(game.caseId)?.summary.title ?? game.caseId,
      mode: game.mode,
      status: game.status,
      players: players
        .filter((p) => p.gameId === game.id)
        .map(({ userId, seat, displayName }) => ({ userId, seat, displayName }))
        .sort((a, b) => a.seat - b.seat),
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString(),
    }));
    return { games: items };
  });

  app.post('/games', async (req, reply) => {
    const me = app.requireUser(req);
    const body = parse(createGameRequest, req.body);
    const entry = app.cases.get(body.caseId);
    if (!entry || (entry.internal && app.config.env === 'production')) {
      throw new HttpError(404, 'not_found', 'Nie ma takiej sprawy.');
    }
    const game = await db.transaction(async (tx) => {
      const [g] = await tx
        .insert(games)
        .values({
          caseId: entry.summary.id,
          caseVersion: entry.version,
          mode: body.mode,
          noHints: body.noHints ?? false,
          state: {},
          createdBy: me.id,
        })
        .returning();
      await tx.insert(gamePlayers).values({ gameId: g!.id, userId: me.id, seat: 1 });
      await tx.insert(gameEvents).values({
        gameId: g!.id,
        seq: 1,
        actorUserId: me.id,
        type: 'game_created',
        payload: { mode: body.mode },
      });
      return g!;
    });
    return reply.status(201).send({ id: game.id });
  });

  app.get('/games/:id', async (req) => {
    const me = app.requireUser(req);
    const { id } = req.params as { id: string };
    const { game, seat } = await requireMembership(db, id, me.id);
    return {
      id: game.id,
      caseId: game.caseId,
      caseTitle: app.cases.get(game.caseId)?.summary.title ?? game.caseId,
      mode: game.mode,
      status: game.status,
      seat,
      stateVersion: game.stateVersion,
    };
  });

  app.post('/games/:id/abandon', async (req, reply) => {
    const me = app.requireUser(req);
    const { id } = req.params as { id: string };
    await requireMembership(db, id, me.id);
    await db
      .update(games)
      .set({ status: 'abandoned', updatedAt: new Date() })
      .where(eq(games.id, id));
    return reply.status(204).send();
  });
}
