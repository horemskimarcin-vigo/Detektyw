import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { HttpError } from './errors.js';
import security from './plugins/security.js';
import { createMailer, type Mailer } from './services/mailer.js';
import { loadCaseRegistry, type CaseRegistry } from './services/cases.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import gameRoutes from './routes/games.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    mailer: Mailer;
    cases: CaseRegistry;
  }
}

export interface AppDeps {
  config: Config;
  db: Db;
  mailer?: Mailer;
  cases?: CaseRegistry;
}

export async function buildApp({ config, db, mailer, cases }: AppDeps) {
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
  });

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate(
    'mailer',
    mailer ??
      createMailer({ smtpUrl: config.smtpUrl, from: config.mailFrom, log: (m) => app.log.info(m) }),
  );
  app.decorate('cases', cases ?? loadCaseRegistry());

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        frameAncestors: ["'none'"],
        // Bez TLS (np. lokalny docker compose) wymuszenie https zablokowałoby zasoby.
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    allowList: () => config.env === 'test',
  });

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      return reply
        .status(err.statusCode)
        .send({ error: err.code, message: err.message, fields: err.fields });
    }
    if (err.statusCode === 429) {
      return reply
        .status(429)
        .send({ error: 'rate_limited', message: 'Zbyt wiele prób. Spróbuj za chwilę.' });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply
        .status(err.statusCode)
        .send({ error: 'bad_request', message: 'Nieprawidłowe żądanie.' });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Wystąpił błąd serwera.' });
  });

  await app.register(security);

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(accountRoutes, { prefix: '/api/account' });
  await app.register(gameRoutes, { prefix: '/api' });
  if (config.env === 'test') {
    // Tylko testy e2e: podgląd wysłanych e-maili (mailer deweloperski).
    app.get('/api/test/outbox', async () => ({ mails: app.mailer.outbox ?? [] }));
  }

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || !config.clientDist) {
      return reply.status(404).send({ error: 'not_found', message: 'Nie znaleziono.' });
    }
    // Aplikacja jednostronicowa: nieznane ścieżki obsługuje klient.
    return reply.type('text/html').sendFile('index.html');
  });

  if (config.clientDist && existsSync(config.clientDist)) {
    await app.register(fastifyStatic, {
      root: path.resolve(config.clientDist),
      wildcard: false,
      cacheControl: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
  }

  return app;
}
