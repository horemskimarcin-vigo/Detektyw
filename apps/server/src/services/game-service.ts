import { and, asc, count, desc, eq, gt } from 'drizzle-orm';
import {
  applyAction,
  canAccessAsset,
  createInitialState,
  EngineError,
  isMaterialVisible,
  project,
  startGame,
  type GameState,
} from '@detektyw/engine';
import type { ActionResponse, ChatMessageView, GameAction, GameView } from '@detektyw/shared';
import { randomBytes } from 'node:crypto';
import type { Db } from '../db/client.js';
import {
  chatMessages,
  endingsUnlocked,
  gameEvents,
  gamePlayers,
  games,
  users,
} from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { AssistantStylist } from './assistant-llm.js';
import type { CaseEntry, CaseRegistry } from './cases.js';
import type { Realtime } from './realtime.js';
import { defaultUserSettings } from '@detektyw/shared';

type GameRow = typeof games.$inferSelect;

const ENGINE_STATUS: Record<string, number> = {
  forbidden: 403,
  not_found: 404,
  finished: 409,
  deadline: 409,
  needs_agreement: 409,
};

export class GameService {
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private db: Db,
    private cases: CaseRegistry,
    private realtime: Realtime,
    private stylist: AssistantStylist,
    private allowInternal: boolean,
  ) {}

  /** Akcje w jednej grze wykonywane są po kolei (kooperacja). */
  private async withLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(gameId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(gameId, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(gameId) === next) this.locks.delete(gameId);
    }
  }

  caseFor(game: GameRow): CaseEntry {
    const entry = this.cases.get(game.caseId);
    if (!entry) throw new HttpError(410, 'case_missing', 'Ta sprawa nie jest już dostępna.');
    return entry;
  }

  async membership(gameId: string, userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(gameId))
      throw new HttpError(404, 'not_found', 'Nie znaleziono sprawy.');
    const [row] = await this.db
      .select({ game: games, seat: gamePlayers.seat })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)));
    if (!row) throw new HttpError(404, 'not_found', 'Nie znaleziono sprawy.');
    return row;
  }

  async players(gameId: string) {
    return this.db
      .select({
        seat: gamePlayers.seat,
        userId: gamePlayers.userId,
        displayName: users.displayName,
      })
      .from(gamePlayers)
      .innerJoin(users, eq(users.id, gamePlayers.userId))
      .where(eq(gamePlayers.gameId, gameId))
      .orderBy(asc(gamePlayers.seat));
  }

  async create(userId: string, caseId: string, mode: 'solo' | 'coop', noHints: boolean) {
    const entry = this.cases.get(caseId);
    if (!entry || (entry.internal && !this.allowInternal))
      throw new HttpError(404, 'not_found', 'Nie ma takiej sprawy.');
    const state = startGame(
      entry.def,
      createInitialState(entry.def, { mode, seats: [1], noHints, now: Date.now() }),
    );
    return this.db.transaction(async (tx) => {
      const [g] = await tx
        .insert(games)
        .values({
          caseId,
          caseVersion: entry.version,
          mode,
          noHints,
          state,
          createdBy: userId,
          inviteCode: mode === 'coop' ? inviteCode() : null,
        })
        .returning();
      await tx.insert(gamePlayers).values({ gameId: g!.id, userId, seat: 1 });
      await tx.insert(gameEvents).values({
        gameId: g!.id,
        seq: 0,
        actorUserId: userId,
        type: 'game_created',
        payload: { mode },
      });
      return g!;
    });
  }

  async join(userId: string, code: string) {
    const normalized = code.trim().toUpperCase();
    const [game] = await this.db.select().from(games).where(eq(games.inviteCode, normalized));
    if (!game || game.status !== 'active')
      throw new HttpError(404, 'invalid_code', 'Nieprawidłowy lub nieaktualny kod zaproszenia.');
    return this.withLock(game.id, async () => {
      const players = await this.players(game.id);
      if (players.some((p) => p.userId === userId)) return game.id;
      if (players.length >= 2)
        throw new HttpError(409, 'full', 'Ta sprawa ma już dwóch śledczych.');
      await this.db.transaction(async (tx) => {
        const [locked] = await tx.select().from(games).where(eq(games.id, game.id)).for('update');
        const state = locked!.state as GameState;
        state.seats = [...new Set([...state.seats, 2])];
        state.journal.push({
          at: state.time,
          kind: 'coop',
          text: '{{seat:2}} dołącza do śledztwa.',
        });
        await tx.insert(gamePlayers).values({ gameId: game.id, userId, seat: 2 });
        await tx
          .update(games)
          .set({
            state,
            stateVersion: locked!.stateVersion + 1,
            inviteCode: null,
            updatedAt: new Date(),
          })
          .where(eq(games.id, game.id));
      });
      this.realtime.broadcast(game.id, { type: 'changed', version: game.stateVersion + 1, by: 2 });
      return game.id;
    });
  }

  async view(game: GameRow, seat: number, userId: string): Promise<GameView> {
    const entry = this.caseFor(game);
    const [players, [me], [collected]] = await Promise.all([
      this.players(game.id),
      this.db.select({ settings: users.settings }).from(users).where(eq(users.id, userId)),
      this.db
        .select({ n: count() })
        .from(endingsUnlocked)
        .where(and(eq(endingsUnlocked.userId, userId), eq(endingsUnlocked.caseId, game.caseId))),
    ]);
    const online = this.realtime.online(game.id);
    const settings = { ...defaultUserSettings, ...(me?.settings ?? {}) };
    return project(entry.def, game.state as GameState, seat, {
      gameId: game.id,
      version: game.stateVersion,
      now: Date.now(),
      players: players.map((p) => ({
        seat: p.seat,
        displayName: p.displayName,
        online: online.includes(p.seat),
      })),
      assistantProactive: settings.assistantProactive,
      collection: { unlocked: collected?.n ?? 0, total: entry.def.endings.length },
      inviteCode: game.inviteCode ?? undefined,
      assetUrl: (file) => `/api/games/${game.id}/assets/${encodeURIComponent(file)}`,
      hasAsset: (file) => entry.assets.has(file),
    });
  }

  async apply(gameId: string, userId: string, action: GameAction): Promise<ActionResponse> {
    return this.withLock(gameId, async () => {
      const { seat } = await this.membership(gameId, userId);
      let response: { game: GameRow; result: ActionResponse['result'] } | undefined;
      await this.db.transaction(async (tx) => {
        const [game] = await tx.select().from(games).where(eq(games.id, gameId)).for('update');
        const entry = this.caseFor(game!);
        let applied;
        try {
          applied = applyAction(entry.def, game!.state as GameState, action, {
            seat,
            now: Date.now(),
          });
        } catch (err) {
          if (err instanceof EngineError) {
            throw new HttpError(ENGINE_STATUS[err.code] ?? 400, err.code, err.message);
          }
          throw err;
        }
        const { state, result } = applied;
        if (result.assistant?.from === 'assistant') {
          const styled = await this.stylist.stylize({
            def: entry.def,
            text: result.assistant.text,
            playerText: action.type === 'assistant_ask' ? action.text : undefined,
            knownNames: entry.def.people
              .filter((p) => state.knownPeople.includes(p.id))
              .map((p) => p.name),
            knownTitles: entry.def.materials
              .filter((m) => isMaterialVisible(state, m.id, seat))
              .map((m) => m.title),
            gameId,
          });
          if (styled !== result.assistant.text) {
            result.assistant = { ...result.assistant, text: styled };
            const msg = state.assistant.messages.find((m) => m.id === result.assistant!.id);
            if (msg) msg.text = styled;
          }
        }
        const version = game!.stateVersion + 1;
        const finished = state.phase === 'finished';
        const [updated] = await tx
          .update(games)
          .set({
            state,
            stateVersion: version,
            status: finished ? 'finished' : game!.status,
            updatedAt: new Date(),
          })
          .where(eq(games.id, gameId))
          .returning();
        await tx.insert(gameEvents).values({
          gameId,
          seq: version,
          actorUserId: userId,
          type: action.type,
          payload: action,
        });
        if (finished && state.ending && game!.status !== 'finished') {
          const players = await tx
            .select({ userId: gamePlayers.userId })
            .from(gamePlayers)
            .where(eq(gamePlayers.gameId, gameId));
          for (const p of players) {
            await tx
              .insert(endingsUnlocked)
              .values({ userId: p.userId, caseId: game!.caseId, endingId: state.ending.id, gameId })
              .onConflictDoNothing();
          }
        }
        response = { game: updated!, result };
      });
      const { game, result } = response!;
      this.realtime.broadcast(gameId, { type: 'changed', version: game.stateVersion, by: seat });
      return { result, view: await this.view(game, seat, userId) };
    });
  }

  async asset(gameId: string, userId: string, file: string) {
    const { game, seat } = await this.membership(gameId, userId);
    const entry = this.caseFor(game);
    if (
      !entry.assets.has(file) ||
      !canAccessAsset(entry.def, game.state as GameState, seat, file)
    ) {
      throw new HttpError(404, 'not_found', 'Nie znaleziono pliku.');
    }
    return { dir: entry.assetsDir, file };
  }

  async chat(gameId: string, after = 0): Promise<ChatMessageView[]> {
    const rows = await this.db
      .select({ m: chatMessages, displayName: users.displayName })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.userId))
      .where(and(eq(chatMessages.gameId, gameId), gt(chatMessages.id, after)))
      .orderBy(desc(chatMessages.id))
      .limit(100);
    return rows.reverse().map(({ m, displayName }) => chatView(m, displayName));
  }

  async postChat(gameId: string, userId: string, kind: 'text' | 'reaction', text: string) {
    const { seat, game } = await this.membership(gameId, userId);
    if (game.mode !== 'coop')
      throw new HttpError(400, 'solo', 'Czat jest dostępny w trybie kooperacji.');
    const [row] = await this.db
      .insert(chatMessages)
      .values({ gameId, userId, seat, kind, text })
      .returning();
    const [u] = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId));
    const message = chatView(row!, u?.displayName ?? null);
    this.realtime.broadcast(gameId, { type: 'chat', message });
    return message;
  }
}

function chatView(
  m: typeof chatMessages.$inferSelect,
  displayName: string | null,
): ChatMessageView {
  return {
    id: String(m.id),
    seat: m.seat,
    displayName: displayName ?? 'Były gracz',
    kind: m.kind,
    text: m.text,
    at: m.createdAt.toISOString(),
  };
}

function inviteCode() {
  // Bez łatwych do pomylenia znaków (0/O, 1/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]).join('');
}
