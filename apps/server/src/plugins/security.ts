import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { and, eq, gt } from 'drizzle-orm';
import { randomToken, safeEqual, sha256 } from '../services/crypto.js';
import { sessions, users } from '../db/schema.js';
import { HttpError } from '../errors.js';

export const SESSION_COOKIE = 'dt_session';
export const CSRF_COOKIE = 'dt_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
  interface FastifyInstance {
    requireUser(req: FastifyRequest): SessionUser;
    startSession(req: FastifyRequest, reply: FastifyReply, userId: string): Promise<void>;
    endSession(req: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DAY = 24 * 60 * 60 * 1000;

/**
 * Sesje (ciasteczko httpOnly z losowym tokenem, w bazie tylko jego skrót)
 * oraz ochrona CSRF metodą double-submit cookie.
 */
export default fp(async function security(app: FastifyInstance) {
  const { db, config } = app;
  const cookieBase = {
    path: '/',
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
  };

  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;

    // CSRF: każda odpowiedź API gwarantuje istnienie ciasteczka z tokenem.
    let csrf = req.cookies[CSRF_COOKIE];
    if (!csrf) {
      csrf = randomToken(24);
      reply.setCookie(CSRF_COOKIE, csrf, { ...cookieBase, httpOnly: false });
    }
    if (MUTATING.has(req.method)) {
      const header = req.headers[CSRF_HEADER];
      if (typeof header !== 'string' || !req.cookies[CSRF_COOKIE] || !safeEqual(header, csrf)) {
        throw new HttpError(403, 'csrf', 'Nieprawidłowy token bezpieczeństwa. Odśwież stronę.');
      }
    }

    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const id = sha256(token);
    const now = new Date();
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        lastUsedAt: sessions.lastUsedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)));
    if (!row) {
      reply.clearCookie(SESSION_COOKIE, cookieBase);
      return;
    }
    req.user = { id: row.id, email: row.email, displayName: row.displayName, sessionId: id };
    // Sesja przesuwna: odświeżamy wygaśnięcie najwyżej raz na dobę.
    if (now.getTime() - row.lastUsedAt.getTime() > DAY) {
      const expiresAt = new Date(now.getTime() + config.sessionDays * DAY);
      await db.update(sessions).set({ lastUsedAt: now, expiresAt }).where(eq(sessions.id, id));
      reply.setCookie(SESSION_COOKIE, token, { ...cookieBase, httpOnly: true, expires: expiresAt });
    }
  });

  app.decorate('requireUser', (req: FastifyRequest) => {
    if (!req.user) throw new HttpError(401, 'unauthenticated', 'Zaloguj się, aby kontynuować.');
    return req.user;
  });

  app.decorate('startSession', async (req: FastifyRequest, reply: FastifyReply, userId: string) => {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + config.sessionDays * DAY);
    await db.insert(sessions).values({
      id: sha256(token),
      userId,
      expiresAt,
      userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
    });
    reply.setCookie(SESSION_COOKIE, token, { ...cookieBase, httpOnly: true, expires: expiresAt });
  });

  app.decorate('endSession', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user) await db.delete(sessions).where(eq(sessions.id, req.user.sessionId));
    reply.clearCookie(SESSION_COOKIE, cookieBase);
  });
});
