import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

/** Katalog migracji: obok źródeł w dev, obok dist w produkcji. */
function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle')]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Nie znaleziono katalogu migracji drizzle/');
}

/**
 * `postgres://…` – produkcyjny Postgres.
 * `pglite:memory` lub `pglite:./ścieżka` – wbudowany Postgres (testy, szybki start lokalny).
 */
export async function openDb(url: string): Promise<DbHandle> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const target = url.slice('pglite:'.length);
    if (target !== 'memory') mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    const client = target === 'memory' ? new PGlite() : new PGlite(target);
    const db = drizzlePglite(client, { schema }) as unknown as Db;
    return {
      db,
      migrate: () => migratePglite(db as never, { migrationsFolder: migrationsFolder() }),
      close: () => client.close(),
    };
  }
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzlePg(pool, { schema }) as unknown as Db;
  return {
    db,
    migrate: () => migratePg(db as never, { migrationsFolder: migrationsFolder() }),
    close: () => pool.end(),
  };
}
