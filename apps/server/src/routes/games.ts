import type { FastifyInstance } from 'fastify';
import { desc, eq, inArray } from 'drizzle-orm';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createGameRequest, type GameListItem } from '@detektyw/shared';
import { endingsUnlocked, gamePlayers, games, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { parse } from '../validation.js';
import { gameActionSchema } from '../actions.js';

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

export default async function gameRoutes(app: FastifyInstance) {
  const { db, games: service } = app;

  app.get('/cases', async (req) => {
    app.requireUser(req);
    return { cases: app.cases.list(app.config.env !== 'production') };
  });

  /** Kolekcja zakończeń: tytuły odblokowanych + liczba wszystkich (bez ujawniania pozostałych). */
  app.get('/endings', async (req) => {
    const me = app.requireUser(req);
    const rows = await db.select().from(endingsUnlocked).where(eq(endingsUnlocked.userId, me.id));
    return {
      cases: app.cases
        .list(true)
        .map((c) => {
          const def = app.cases.get(c.id)!.def;
          const mine = rows.filter((r) => r.caseId === c.id);
          return {
            caseId: c.id,
            caseTitle: c.title,
            total: def.endings.length,
            unlocked: mine
              .map((r) => def.endings.find((e) => e.id === r.endingId))
              .filter((e) => e !== undefined)
              .map((e) => ({ id: e.id, title: e.title, tone: e.tone })),
          };
        })
        .filter((c) => c.unlocked.length > 0 || !app.cases.get(c.caseId)!.internal),
    };
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
    const game = await service.create(me.id, body.caseId, body.mode, body.noHints ?? false);
    return reply.status(201).send({ id: game.id });
  });

  app.post('/games/join', async (req) => {
    const me = app.requireUser(req);
    const { code } = parse(z.object({ code: z.string().min(4).max(20) }), req.body);
    return { id: await service.join(me.id, code) };
  });

  app.get('/games/:id', async (req) => {
    const me = app.requireUser(req);
    const { game, seat } = await service.membership((req.params as { id: string }).id, me.id);
    return service.view(game, seat, me.id);
  });

  app.post(
    '/games/:id/actions',
    { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } },
    async (req) => {
      const me = app.requireUser(req);
      const { action } = parse(z.object({ action: gameActionSchema }), req.body);
      return service.apply((req.params as { id: string }).id, me.id, action);
    },
  );

  app.post('/games/:id/abandon', async (req, reply) => {
    const me = app.requireUser(req);
    const { game } = await service.membership((req.params as { id: string }).id, me.id);
    if (game.status === 'active') {
      await db
        .update(games)
        .set({ status: 'abandoned', inviteCode: null, updatedAt: new Date() })
        .where(eq(games.id, game.id));
    }
    return reply.status(204).send();
  });

  app.get('/games/:id/assets/:file', async (req, reply) => {
    const me = app.requireUser(req);
    const { id, file } = req.params as { id: string; file: string };
    if (!/^[\w.-]+$/.test(file)) throw new HttpError(404, 'not_found', 'Nie znaleziono pliku.');
    const asset = await service.asset(id, me.id, file);
    reply.header('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    reply.header('Cache-Control', 'private, max-age=86400');
    reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return reply.send(createReadStream(path.join(asset.dir, asset.file)));
  });

  app.get('/games/:id/chat', async (req) => {
    const me = app.requireUser(req);
    const { game } = await service.membership((req.params as { id: string }).id, me.id);
    const after = Number((req.query as { after?: string }).after ?? 0) || 0;
    return { messages: await service.chat(game.id, after) };
  });

  app.post(
    '/games/:id/chat',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const me = app.requireUser(req);
      const body = parse(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('text'), text: z.string().trim().min(1).max(1000) }),
          z.object({
            kind: z.literal('reaction'),
            text: z.enum(['👍', '👎', '❓', '❗', '🤔', '👀']),
          }),
        ]),
        req.body,
      );
      return {
        message: await service.postChat(
          (req.params as { id: string }).id,
          me.id,
          body.kind,
          body.text,
        ),
      };
    },
  );

  app.get('/games/:id/ws', { websocket: true }, async (socket, req) => {
    const close = (code: number, reason: string) => socket.close(code, reason);
    if (!req.user) return close(4401, 'unauthenticated');
    const origin = req.headers.origin;
    if (
      origin &&
      new URL(origin).host !== req.headers.host &&
      origin !== new URL(app.config.appUrl).origin
    ) {
      return close(4403, 'origin');
    }
    let seat: number;
    let version: number;
    try {
      const m = await service.membership((req.params as { id: string }).id, req.user.id);
      seat = m.seat;
      version = m.game.stateVersion;
    } catch {
      return close(4404, 'not_found');
    }
    const gameId = (req.params as { id: string }).id;
    const conn = { userId: req.user.id, seat, send: (d: string) => socket.send(d) };
    socket.send(JSON.stringify({ type: 'hello', version }));
    app.realtime.join(gameId, conn);
    socket.on('message', (raw: Buffer) => {
      if (raw.toString() === 'ping') socket.send('pong');
    });
    socket.on('close', () => app.realtime.leave(gameId, conn));
  });
}
