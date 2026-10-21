import type { FastifyInstance } from 'fastify';
import { and, eq, ne, inArray } from 'drizzle-orm';
import {
  defaultUserSettings,
  deleteAccountRequest,
  passwordChangeRequest,
  updateProfileRequest,
  type PublicUser,
} from '@detektyw/shared';
import { endingsUnlocked, gamePlayers, games, sessions, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { parse } from '../validation.js';
import { hashPassword, verifyPassword } from '../services/crypto.js';

export function toPublicUser(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    settings: { ...defaultUserSettings, ...u.settings },
    createdAt: u.createdAt.toISOString(),
  };
}

export default async function accountRoutes(app: FastifyInstance) {
  const { db } = app;

  async function loadUser(id: string) {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    if (!u) throw new HttpError(401, 'unauthenticated', 'Zaloguj się, aby kontynuować.');
    return u;
  }

  app.patch('/', async (req) => {
    const me = app.requireUser(req);
    const body = parse(updateProfileRequest, req.body);
    const current = await loadUser(me.id);
    const [updated] = await db
      .update(users)
      .set({
        displayName: body.displayName ?? current.displayName,
        settings: { ...current.settings, ...body.settings },
        updatedAt: new Date(),
      })
      .where(eq(users.id, me.id))
      .returning();
    return { user: toPublicUser(updated!) };
  });

  app.post('/password', async (req, reply) => {
    const me = app.requireUser(req);
    const body = parse(passwordChangeRequest, req.body);
    const u = await loadUser(me.id);
    if (!(await verifyPassword(u.passwordHash, body.currentPassword))) {
      throw new HttpError(400, 'wrong_password', 'Obecne hasło jest nieprawidłowe.', {
        currentPassword: ['Nieprawidłowe hasło.'],
      });
    }
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: new Date() })
      .where(eq(users.id, me.id));
    // Wyloguj inne urządzenia, zostaw bieżącą sesję.
    await db.delete(sessions).where(and(eq(sessions.userId, me.id), ne(sessions.id, me.sessionId)));
    return reply.status(204).send();
  });

  /** RODO: eksport wszystkich danych gracza. */
  app.get('/export', async (req, reply) => {
    const me = app.requireUser(req);
    const u = await loadUser(me.id);
    const myGames = await db
      .select({
        gameId: games.id,
        caseId: games.caseId,
        mode: games.mode,
        status: games.status,
        seat: gamePlayers.seat,
        joinedAt: gamePlayers.joinedAt,
      })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(eq(gamePlayers.userId, me.id));
    const endings = await db
      .select()
      .from(endingsUnlocked)
      .where(eq(endingsUnlocked.userId, me.id));
    const activeSessions = await db
      .select({
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(eq(sessions.userId, me.id));
    reply.header('Content-Disposition', 'attachment; filename="detektyw-moje-dane.json"');
    return {
      exportedAt: new Date().toISOString(),
      profile: toPublicUser(u),
      games: myGames,
      endings: endings.map((e) => ({
        caseId: e.caseId,
        endingId: e.endingId,
        unlockedAt: e.unlockedAt,
      })),
      sessions: activeSessions,
    };
  });

  /** RODO: trwałe usunięcie konta. Gry solo są usuwane, z gier w kooperacji gracz jest wypisywany. */
  app.delete('/', async (req, reply) => {
    const me = app.requireUser(req);
    const body = parse(deleteAccountRequest, req.body);
    const u = await loadUser(me.id);
    if (!(await verifyPassword(u.passwordHash, body.password))) {
      throw new HttpError(400, 'wrong_password', 'Nieprawidłowe hasło.', {
        password: ['Nieprawidłowe hasło.'],
      });
    }
    await db.transaction(async (tx) => {
      const mine = await tx
        .select({ gameId: gamePlayers.gameId })
        .from(gamePlayers)
        .where(eq(gamePlayers.userId, me.id));
      const ids = mine.map((m) => m.gameId);
      if (ids.length) {
        const others = await tx
          .select({ gameId: gamePlayers.gameId })
          .from(gamePlayers)
          .where(and(inArray(gamePlayers.gameId, ids), ne(gamePlayers.userId, me.id)));
        const shared = new Set(others.map((o) => o.gameId));
        const solo = ids.filter((id) => !shared.has(id));
        if (solo.length) await tx.delete(games).where(inArray(games.id, solo));
      }
      await tx.delete(users).where(eq(users.id, me.id));
    });
    await app.endSession(req, reply);
    return reply.status(204).send();
  });
}
