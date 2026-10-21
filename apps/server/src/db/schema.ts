import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { UserSettings } from '@detektyw/shared';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  settings: jsonb('settings').$type<Partial<UserSettings>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Sesje logowania. `id` to skrót SHA-256 tokenu z ciasteczka (sam token nie trafia do bazy). */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const passwordResets = pgTable(
  'password_resets',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('password_resets_user_idx').on(t.userId)],
);

/** Próby logowania do limitowania ataków. Czyszczone po 24 h (minimalizacja danych). */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    ip: text('ip').notNull(),
    success: boolean('success').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('login_attempts_email_idx').on(t.email, t.createdAt),
    index('login_attempts_ip_idx').on(t.ip, t.createdAt),
  ],
);

export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: text('case_id').notNull(),
    caseVersion: text('case_version').notNull(),
    mode: text('mode', { enum: ['solo', 'coop'] }).notNull(),
    status: text('status', { enum: ['active', 'finished', 'abandoned'] })
      .notNull()
      .default('active'),
    /** Pełny stan silnika – nigdy nie wysyłany do klienta wprost (tylko projekcja). */
    state: jsonb('state').notNull(),
    stateVersion: integer('state_version').notNull().default(0),
    noHints: boolean('no_hints').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('games_case_idx').on(t.caseId)],
);

export const gamePlayers = pgTable(
  'game_players',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seat: integer('seat').notNull(),
    roleLabel: text('role_label'),
    lastSeenSeq: integer('last_seen_seq').notNull().default(0),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.userId] }),
    index('game_players_user_idx').on(t.userId),
  ],
);

/** Dziennik zdarzeń gry (append-only). Każda akcja gracza = zdarzenie + nowy stan w jednej transakcji. */
export const gameEvents = pgTable(
  'game_events',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.seq] })],
);

/** Kolekcja zakończeń w profilu gracza. */
export const endingsUnlocked = pgTable(
  'endings_unlocked',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    caseId: text('case_id').notNull(),
    endingId: text('ending_id').notNull(),
    gameId: uuid('game_id').references(() => games.id, { onDelete: 'set null' }),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.caseId, t.endingId] })],
);
