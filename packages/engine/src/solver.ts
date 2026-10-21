import type { GameAction, Tone } from '@detektyw/shared';
import { indexCase } from './case-index.js';
import {
  accusationOptions,
  applyAction,
  availableQuestions,
  decisionAffordable,
  decisionAvailable,
  EngineError,
  interviewAvailability,
  isMaterialVisible,
} from './engine.js';
import { evaluate } from './conditions.js';
import type { CaseDef } from './schema.js';
import type { GameState } from './state.js';

/**
 * Automatyczny śledczy dla walidatora i testów. Zna położenie szczegółów na zdjęciach
 * i listę konfrontacji (oszukuje), ale gra według zasad silnika i budżetu.
 */

export type ToneStrategy = 'calm' | 'empathetic' | 'press' | 'adaptive';

export interface SolverOptions {
  seat?: number;
  tone?: ToneStrategy;
  /** Czy podejmować decyzje (domyślnie tak, z pominięciem `solverAvoid`). */
  decisions?: boolean;
  maxSteps?: number;
  now?: number;
}

export interface Step {
  action: GameAction;
  seat: number;
}

function pickTone(strategy: ToneStrategy, state: GameState, personId: string): Tone {
  if (strategy !== 'adaptive') return strategy;
  const i = state.interviews[personId]!;
  if (i.trust < 40) return 'empathetic';
  if (i.stress < 45) return 'press';
  return 'calm';
}

/** Następna akcja śledczego albo null, gdy nie ma już nic do zrobienia. */
export function nextSolverAction(
  def: CaseDef,
  state: GameState,
  opts: SolverOptions = {},
): GameAction | null {
  const seat = opts.seat ?? state.seats[0]!;
  const idx = indexCase(def);
  const strategy = opts.tone ?? 'adaptive';

  for (const id of Object.keys(state.materials)) {
    if (isMaterialVisible(state, id, seat) && !state.materials[id]!.readBy.includes(seat)) {
      return { type: 'open_material', materialId: id };
    }
  }
  for (const [hid, ref] of idx.hotspots) {
    if (hid in state.hotspots || !isMaterialVisible(state, ref.materialId, seat)) continue;
    return {
      type: 'inspect',
      materialId: ref.materialId,
      frame: ref.frame,
      x: ref.def.x,
      y: ref.def.y,
      zoom: Math.max(ref.def.minZoom, 1),
    };
  }
  if (state.phase !== 'investigation') return null;

  const pendingConfrontations = (personId: string) => {
    const iv = idx.people.get(personId)?.interview;
    const i = state.interviews[personId];
    if (!iv || !i) return [];
    return iv.confrontations.filter(
      (c) =>
        !i.confronted.includes(c.evidence) &&
        (isMaterialVisible(state, c.evidence, seat) || c.evidence in state.hotspots) &&
        evaluate(c.requires, {
          def,
          state,
          interview: {
            personId,
            tone: 'calm',
            stress: i.stress,
            trust: i.trust,
            session: i.sessions,
          },
        }),
    );
  };

  const active = Object.entries(state.interviews).find(([, i]) => i.inSession);
  if (active) {
    const [personId] = active;
    const q = availableQuestions(def, state, personId)[0];
    if (q)
      return { type: 'ask', personId, questionId: q.id, tone: pickTone(strategy, state, personId) };
    const c = pendingConfrontations(personId)[0];
    if (c)
      return {
        type: 'confront',
        personId,
        evidence: c.evidence,
        tone: pickTone(strategy, state, personId),
      };
    return { type: 'end_interview', personId };
  }

  if (state.time + 1 <= def.budget.time) {
    for (const p of def.people) {
      if (!p.interview || interviewAvailability(def, state, p.id) !== null) continue;
      const i = state.interviews[p.id]!;
      // Zapytania dostępne przed rozpoczęciem sesji szacujemy symulując stan „w sesji”.
      const probe = structuredClone(state);
      probe.interviews[p.id]!.inSession = true;
      probe.interviews[p.id]!.sessions = i.sessions + 1;
      const hasQuestions = availableQuestions(def, probe, p.id).length > 0;
      if (hasQuestions || pendingConfrontations(p.id).length > 0)
        return { type: 'start_interview', personId: p.id };
    }
  }

  if (opts.decisions !== false) {
    for (const d of def.decisions) {
      if (d.solverAvoid || !decisionAvailable(def, state, d) || !decisionAffordable(def, state, d))
        continue;
      if (d.key && state.mode === 'coop' && state.seats.length > 1) continue;
      return { type: 'take_decision', decisionId: d.id };
    }
  }

  if (state.pending.length > 0 && state.time < def.budget.time) return { type: 'wait' };
  return null;
}

export function runSolver(def: CaseDef, start: GameState, opts: SolverOptions = {}) {
  let state = start;
  const steps: Step[] = [];
  const seat = opts.seat ?? state.seats[0]!;
  const max = opts.maxSteps ?? 3000;
  const now = opts.now ?? 0;
  for (let n = 0; n < max; n++) {
    const action = nextSolverAction(def, state, opts);
    if (!action) break;
    try {
      state = applyAction(def, state, action, { seat, now }).state;
      steps.push({ action, seat });
    } catch (e) {
      if (e instanceof EngineError) break;
      throw e;
    }
  }
  return { state, steps };
}

/** Czy z danego stanu da się uzasadnić rozwiązanie (wymagane dowody + poprawne odpowiedzi). */
export function solutionDerivable(def: CaseDef, state: GameState, seat?: number) {
  const s = seat ?? state.seats[0]!;
  const sol = def.solution;
  const missing = sol.requiredEvidence.filter(
    (r) =>
      !isMaterialVisible(state, r, s) &&
      !(
        r in state.hotspots &&
        isMaterialVisible(state, indexCase(def).hotspots.get(r)!.materialId, s)
      ),
  );
  const opts = accusationOptions(def, state);
  const missingOptions = [
    !opts.suspects.some((x) => x.id === sol.culprit) && 'sprawca nieznany',
    !opts.motives.some((x) => x.id === sol.motive) && 'motyw',
    !opts.means.some((x) => x.id === sol.means) && 'sposób',
    !opts.opportunities.some((x) => x.id === sol.opportunity) && 'okoliczności',
  ].filter(Boolean) as string[];
  return { ok: missing.length === 0 && missingOptions.length === 0, missing, missingOptions };
}

/** Prosty deterministyczny generator liczb pseudolosowych (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Losowa, „rozsądna” akcja – do sprawdzania braku martwych punktów. */
export function randomAction(
  def: CaseDef,
  state: GameState,
  rand: () => number,
  seat: number,
): GameAction | null {
  const idx = indexCase(def);
  const options: GameAction[] = [];
  for (const id of Object.keys(state.materials)) {
    if (isMaterialVisible(state, id, seat)) options.push({ type: 'open_material', materialId: id });
  }
  const tones: Tone[] = ['calm', 'press', 'empathetic'];
  const tone = tones[Math.floor(rand() * 3)]!;
  const active = Object.entries(state.interviews).find(([, i]) => i.inSession);
  if (active) {
    for (const q of availableQuestions(def, state, active[0])) {
      options.push({ type: 'ask', personId: active[0], questionId: q.id, tone });
    }
    const visible = Object.keys(state.materials).filter((m) => isMaterialVisible(state, m, seat));
    const ev = visible[Math.floor(rand() * visible.length)];
    if (ev) options.push({ type: 'confront', personId: active[0], evidence: ev, tone });
    options.push({ type: 'end_interview', personId: active[0] });
  } else if (state.phase === 'investigation') {
    for (const p of def.people) {
      if (p.interview && interviewAvailability(def, state, p.id) === null) {
        options.push({ type: 'start_interview', personId: p.id });
      }
    }
    for (const d of def.decisions) {
      if (
        decisionAvailable(def, state, d) &&
        decisionAffordable(def, state, d) &&
        !(d.key && state.mode === 'coop')
      ) {
        options.push({ type: 'take_decision', decisionId: d.id });
      }
    }
  }
  for (const [hid, ref] of idx.hotspots) {
    if (
      !(hid in state.hotspots) &&
      isMaterialVisible(state, ref.materialId, seat) &&
      rand() < 0.3
    ) {
      options.push({
        type: 'inspect',
        materialId: ref.materialId,
        frame: ref.frame,
        x: ref.def.x,
        y: ref.def.y,
        zoom: ref.def.minZoom,
      });
    }
  }
  if (options.length === 0) return null;
  return options[Math.floor(rand() * options.length)]!;
}
