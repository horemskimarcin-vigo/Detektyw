import type { AssistantMessage } from '@detektyw/shared';
import { evaluate } from './conditions.js';
import type { CaseDef, HintNodeDef } from './schema.js';
import type { GameState } from './state.js';

/**
 * Asystent („stary wyjadacz”). Warstwa w pełni deterministyczna:
 * wybiera najważniejszy aktywny, nierozwiązany węzeł śledztwa i podaje
 * kolejny poziom podpowiedzi (1: pytanie naprowadzające, 2: kierunek, 3: konkretny materiał).
 * Nigdy nie wychodzi poza poziom 3, nie wskazuje sprawcy i nie ocenia oskarżeń.
 */

export const FALLBACK_NODE = '_fallback';
const MAX_MESSAGES = 200;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim();
}

function nodeVisibleTo(state: GameState, node: HintNodeDef, seat: number) {
  return node.refs.every((r) => {
    const m = state.materials[r];
    return !m || m.holder === undefined || m.holder === seat;
  });
}

/** Aktywne, nierozwiązane węzły, od najważniejszego. */
export function activeHintNodes(def: CaseDef, state: GameState, seat: number): HintNodeDef[] {
  const ctx = { def, state };
  return def.assistant.nodes
    .filter(
      (n) =>
        nodeVisibleTo(state, n, seat) &&
        evaluate(n.activeWhen, ctx) &&
        !evaluate(n.resolvedWhen, ctx),
    )
    .sort((a, b) => b.priority - a.priority);
}

function push(state: GameState, msg: Omit<AssistantMessage, 'id'>): AssistantMessage {
  const full: AssistantMessage = { id: `a${state.nextId++}`, ...msg };
  state.assistant.messages.push(full);
  if (state.assistant.messages.length > MAX_MESSAGES) state.assistant.messages.shift();
  return full;
}

function pickLine(lines: readonly string[], seed: number) {
  return lines[seed % lines.length]!;
}

export function cooldownUntil(def: CaseDef, state: GameState): number | undefined {
  if (!state.assistant.lastHintAt) return undefined;
  if (state.assistant.actionsSinceHint >= def.assistant.actionsToSkipCooldown) return undefined;
  const until = state.assistant.lastHintAt + def.assistant.cooldownMinutes * 60_000;
  return until;
}

export function requestHint(
  def: CaseDef,
  state: GameState,
  seat: number,
  now: number,
  playerText = 'Utknąłem. Masz dla mnie jakąś wskazówkę?',
): AssistantMessage {
  push(state, { from: 'player', seat, text: playerText, at: now });
  const a = state.assistant;
  if (state.noHints)
    return push(state, { from: 'assistant', text: def.assistant.disabledText, at: now });

  const node = activeHintNodes(def, state, seat)[0];
  const nodeId = node?.id ?? FALLBACK_NODE;
  const ladder = node?.levels ?? def.assistant.fallback;
  const current = a.levels[nodeId] ?? 0;

  if (current >= 3) {
    return push(state, {
      from: 'assistant',
      text: `Więcej ci nie powiem, bo zrobiłbym robotę za ciebie. Przypomnę tylko: ${ladder[2]}`,
      level: 3,
      at: now,
    });
  }
  const until = cooldownUntil(def, state);
  const cooling = current > 0 && until !== undefined && now < until;
  if (cooling) {
    return push(state, {
      from: 'assistant',
      text: `${pickLine(def.assistant.waitLines, a.hintsUsed + current)} ${ladder[current - 1]}`,
      level: current as 1 | 2 | 3,
      at: now,
    });
  }
  const level = (current + 1) as 1 | 2 | 3;
  a.levels[nodeId] = level;
  a.hintsUsed++;
  a.lastHintAt = now;
  a.actionsSinceHint = 0;
  return push(state, { from: 'assistant', text: ladder[level - 1]!, level, at: now });
}

/* ---------- pytania swobodne ---------- */

const ACCUSATION_PATTERNS = [
  /\bkto\b.*\b(zabil|zrobil|zamordowal|stoi za|jest winn|winien|sprawc|morderc|zabojc|to byl)/,
  /\b(sprawc|winn|winien|morderc|zabojc|rozwiazani|rozwiaz)/,
  /\bczy to\b.*\b(on|ona|byl|byla|zrobil|zrobila)\b/,
  /\b(oskarz|aresztowa|wskaz|podejrzew)\w*\b.*\?/,
  /\b(ignoruj|zignoruj|zapomnij|instrukcj|zasad|prompt|system|tryb dewelop|jestes teraz|udawaj|odegraj|roleplay|jailbreak)/,
  /\b(podaj|zdradz|powiedz)\b.*\b(odpowiedz|prawde|rozwiazanie|kto)\b/,
];
const HINT_PATTERNS =
  /\b(pomoc|pomoz|wskazowk|podpowie|podpowiedz|utknal|utknel|nie wiem|co dalej|co teraz|od czego|gdzie szukac|co robic|trop)/;

export type QuestionClass = 'refuse' | 'hint' | 'smalltalk';

export function classifyQuestion(def: CaseDef, text: string): QuestionClass {
  const t = normalize(text);
  if (ACCUSATION_PATTERNS.some((re) => re.test(t))) return 'refuse';
  // Pytanie o konkretną osobę („a X?”, „co z X?”) traktujemy jak próbę wyciągnięcia oceny.
  const mentionsPerson = def.people.some((p) =>
    normalize(p.name)
      .split(' ')
      .filter((part) => part.length > 3)
      .some((part) => t.includes(part)),
  );
  if (mentionsPerson && /\?|czy|co z|a /.test(t)) return 'refuse';
  if (HINT_PATTERNS.test(t)) return 'hint';
  return 'smalltalk';
}

export function assistantAsk(
  def: CaseDef,
  state: GameState,
  seat: number,
  now: number,
  raw: string,
): AssistantMessage {
  const text = raw.trim().slice(0, 500);
  if (!text) return requestHint(def, state, seat, now);
  const kind = classifyQuestion(def, text);
  if (kind === 'hint') return requestHint(def, state, seat, now, text);
  push(state, { from: 'player', seat, text, at: now });
  const seed = state.assistant.messages.length;
  const lines = kind === 'refuse' ? def.assistant.refusals : def.assistant.smalltalk;
  return push(state, { from: 'assistant', text: pickLine(lines, seed), at: now });
}

/** Czy zaproponować pomoc (gracz długo nie robi postępów). */
export function shouldOfferHelp(
  def: CaseDef,
  state: GameState,
  seat: number,
  now: number,
): boolean {
  if (state.noHints || state.phase !== 'investigation') return false;
  const a = def.assistant;
  const idle =
    now - state.activity.lastProgressAt > a.stuckAfterMinutes * 60_000 ||
    state.activity.actionsSinceProgress >= a.stuckAfterActions;
  if (!idle) return false;
  if (state.assistant.lastHintAt && now - state.assistant.lastHintAt < a.stuckAfterMinutes * 60_000)
    return false;
  // Kręcenie się w kółko: te same materiały otwierane wielokrotnie albo aktywny węzeł.
  return (
    activeHintNodes(def, state, seat).length > 0 || new Set(state.activity.recentOpens).size < 6
  );
}
