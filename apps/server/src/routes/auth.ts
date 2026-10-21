import type { FastifyInstance } from 'fastify';
import { and, count, eq, gt, isNull, lt } from 'drizzle-orm';
import {
  loginRequest,
  passwordResetConfirm,
  passwordResetRequest,
  registerRequest,
} from '@detektyw/shared';
import { loginAttempts, passwordResets, sessions, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { parse } from '../validation.js';
import {
  getDummyHash,
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from '../services/crypto.js';
import { toPublicUser } from './account.js';

const MINUTE = 60 * 1000;
const LOCK_WINDOW = 15 * MINUTE;
const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP = 30;
const RESET_TTL = 60 * MINUTE;
const MAX_RESETS_PER_HOUR = 3;

export default async function authRoutes(app: FastifyInstance) {
  const { db } = app;
  const strict = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get('/me', async (req) => {
    if (!req.user) return { user: null };
    const [row] = await db.select().from(users).where(eq(users.id, req.user.id));
    return { user: row ? toPublicUser(row) : null };
  });

  app.post('/register', strict, async (req, reply) => {
    const body = parse(registerRequest, req.body);
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email));
    if (existing) {
      throw new HttpError(409, 'email_taken', 'Konto z tym adresem e-mail już istnieje.', {
        email: ['Ten adres jest już zajęty.'],
      });
    }
    const [user] = await db
      .insert(users)
      .values({
        email: body.email,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
      })
      .returning();
    await app.startSession(req, reply, user!.id);
    return reply.status(201).send({ user: toPublicUser(user!) });
  });

  app.post('/login', strict, async (req, reply) => {
    const body = parse(loginRequest, req.body);
    const since = new Date(Date.now() - LOCK_WINDOW);

    // Okresowe czyszczenie starych prób (minimalizacja danych).
    await db
      .delete(loginAttempts)
      .where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * MINUTE)));

    const [byEmail] = await db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, body.email),
          eq(loginAttempts.success, false),
          gt(loginAttempts.createdAt, since),
        ),
      );
    const [byIp] = await db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.ip, req.ip),
          eq(loginAttempts.success, false),
          gt(loginAttempts.createdAt, since),
        ),
      );
    if ((byEmail?.n ?? 0) >= MAX_FAILS_PER_EMAIL || (byIp?.n ?? 0) >= MAX_FAILS_PER_IP) {
      throw new HttpError(
        429,
        'locked',
        'Zbyt wiele nieudanych prób. Spróbuj ponownie za 15 minut.',
      );
    }

    const [user] = await db.select().from(users).where(eq(users.email, body.email));
    const ok = user
      ? await verifyPassword(user.passwordHash, body.password)
      : (await verifyPassword(await getDummyHash(), body.password), false);
    await db.insert(loginAttempts).values({ email: body.email, ip: req.ip, success: ok });
    if (!ok || !user) {
      throw new HttpError(401, 'invalid_credentials', 'Nieprawidłowy e-mail lub hasło.');
    }
    await app.startSession(req, reply, user.id);
    return { user: toPublicUser(user) };
  });

  app.post('/logout', async (req, reply) => {
    await app.endSession(req, reply);
    return reply.status(204).send();
  });

  app.post('/password-reset/request', strict, async (req, reply) => {
    const { email } = parse(passwordResetRequest, req.body);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    // Zawsze ta sama odpowiedź – nie zdradzamy, czy konto istnieje.
    if (user) {
      const [recent] = await db
        .select({ n: count() })
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.userId, user.id),
            gt(passwordResets.createdAt, new Date(Date.now() - 60 * MINUTE)),
          ),
        );
      if ((recent?.n ?? 0) < MAX_RESETS_PER_HOUR) {
        const token = randomToken();
        await db.insert(passwordResets).values({
          tokenHash: sha256(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + RESET_TTL),
        });
        const link = `${app.config.appUrl}/reset-hasla/${token}`;
        await app.mailer.send({
          to: user.email,
          subject: 'Detektyw – reset hasła',
          text:
            `Cześć ${user.displayName},\n\n` +
            `ktoś (miejmy nadzieję, że Ty) poprosił o zmianę hasła. Link jest ważny przez godzinę:\n${link}\n\n` +
            'Jeśli to nie Ty, zignoruj tę wiadomość – hasło pozostanie bez zmian.',
        });
      }
    }
    return reply.status(204).send();
  });

  app.post('/password-reset/confirm', strict, async (req, reply) => {
    const body = parse(passwordResetConfirm, req.body);
    const tokenHash = sha256(body.token);
    const [reset] = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.tokenHash, tokenHash),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, new Date()),
        ),
      );
    if (!reset) {
      throw new HttpError(
        400,
        'invalid_token',
        'Link do resetu hasła jest nieprawidłowy lub wygasł.',
      );
    }
    const passwordHash = await hashPassword(body.password);
    await db.transaction(async (tx) => {
      await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(eq(passwordResets.tokenHash, tokenHash));
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, reset.userId));
      // Po zmianie hasła wylogowujemy wszystkie urządzenia.
      await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
    });
    return reply.status(204).send();
  });
}
