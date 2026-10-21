import path from 'node:path';
import type { GameAction } from '@detektyw/shared';
import { loadCaseDir } from '../src/node/index.js';
import { applyAction, createInitialState, startGame, type GameState } from '../src/index.js';

export const testCase = loadCaseDir(
  path.resolve(import.meta.dirname, '../../../content/cases/_test-case'),
).def;
export const def = testCase;

export function newGame(mode: 'solo' | 'coop' = 'solo', noHints = false) {
  return startGame(
    def,
    createInitialState(def, { mode, seats: mode === 'coop' ? [1, 2] : [1], noHints, now: 0 }),
  );
}

export function act(state: GameState, action: GameAction, seat = 1, now = 0) {
  return applyAction(def, state, action, { seat, now });
}

export function run(state: GameState, actions: GameAction[], seat = 1, now = 0) {
  for (const a of actions) state = act(state, a, seat, now).state;
  return state;
}

export const projCtx = {
  gameId: 'g1',
  version: 1,
  now: 0,
  players: [
    { seat: 1, displayName: 'Anna', online: true },
    { seat: 2, displayName: 'Bartek', online: true },
  ],
  assistantProactive: true,
  assetUrl: (f: string) => `/assets/${f}`,
};
