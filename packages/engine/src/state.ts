import type {
  Accusation,
  AssistantMessage,
  BoardNodeKind,
  JournalEntry,
  ProposalPayload,
  Tone,
  TranscriptEntry,
} from '@detektyw/shared';
import type { CaseDef, Effect } from './schema.js';

/**
 * Pełny stan gry przechowywany na serwerze (JSONB). Zawiera ukryte flagi,
 * więc nigdy nie jest wysyłany do klienta – tylko jego projekcja.
 */
export interface GameState {
  schema: 1;
  caseId: string;
  caseVersion: string;
  mode: 'solo' | 'coop';
  seats: number[];
  noHints: boolean;
  phase: 'investigation' | 'deadline' | 'finished';
  /** Zużyte jednostki czasu (pół dnia). */
  time: number;
  budget: { lab: number; police: number; patience: number };
  flags: Record<string, true>;
  counters: Record<string, number>;
  materials: Record<string, MaterialState>;
  lockedMaterials: string[];
  hotspots: Record<string, { by: number; at: number }>;
  knownPeople: string[];
  decisions: Record<string, { at: number; by: number; outcome: string }>;
  lockedDecisions: string[];
  interviews: Record<string, InterviewState>;
  pending: {
    id: string;
    readyAt: number;
    label: string;
    text: string;
    effects?: Effect;
    by: number;
  }[];
  journal: JournalEntry[];
  notes: {
    id: string;
    author: number;
    shared: boolean;
    text: string;
    quote?: { materialId: string; text: string };
    updatedAt: number;
  }[];
  board: {
    nodes: { id: string; kind: BoardNodeKind; ref?: string; label: string; x: number; y: number }[];
    edges: { id: string; from: string; to: string; label?: string }[];
  };
  timeline: { id: string; time: string; label: string; refs: string[] }[];
  proposals: {
    id: string;
    by: number;
    payload: ProposalPayload;
    approvals: number[];
    createdAt: number;
  }[];
  roles: Record<number, string>;
  assistant: {
    hintsUsed: number;
    levels: Record<string, number>;
    lastHintAt: number;
    actionsSinceHint: number;
    messages: AssistantMessage[];
  };
  activity: {
    lastProgressAt: number;
    actionsSinceProgress: number;
    recentOpens: string[];
  };
  accusation?: Accusation & { by: number; correct: boolean; strength: number; reasoning: number };
  closedCase?: boolean;
  ending?: { id: string; at: number };
  nextId: number;
}

export interface MaterialState {
  unlockedAt: number;
  /** Seat, który widzi materiał prywatny (kooperacja). Brak = widoczny dla wszystkich. */
  holder?: number;
  sharedBy?: number;
  readBy: number[];
  importantBy: number[];
}

export interface InterviewState {
  stress: number;
  trust: number;
  sessions: number;
  inSession: boolean;
  questionsThisSession: number;
  /** Pytania zadane choć raz (do warunków `asked`). */
  asked: string[];
  /** Pytania wyczerpane – rozstrzygające odpowiedzi. Brak pola w starych zapisach = `asked`. */
  spent?: string[];
  confronted: string[];
  locked: boolean;
  transcript: TranscriptEntry[];
  lastTone?: Tone;
}

export interface InitOptions {
  mode: 'solo' | 'coop';
  seats: number[];
  noHints: boolean;
  now: number;
}

export function createInitialState(def: CaseDef, opts: InitOptions): GameState {
  const state: GameState = {
    schema: 1,
    caseId: def.id,
    caseVersion: def.version,
    mode: opts.mode,
    seats: [...opts.seats],
    noHints: opts.noHints,
    phase: 'investigation',
    time: 0,
    budget: { lab: def.budget.lab, police: def.budget.police, patience: def.budget.patience },
    flags: {},
    counters: {},
    materials: {},
    lockedMaterials: [],
    hotspots: {},
    knownPeople: [],
    decisions: {},
    lockedDecisions: [],
    interviews: {},
    pending: [],
    journal: [],
    notes: [],
    board: { nodes: [], edges: [] },
    timeline: [],
    proposals: [],
    roles: {},
    assistant: { hintsUsed: 0, levels: {}, lastHintAt: 0, actionsSinceHint: 0, messages: [] },
    activity: { lastProgressAt: opts.now, actionsSinceProgress: 0, recentOpens: [] },
    nextId: 1,
  };
  for (const p of def.people) {
    if (p.interview) {
      state.interviews[p.id] = {
        stress: p.interview.baseStress,
        trust: p.interview.baseTrust,
        sessions: 0,
        inSession: false,
        questionsThisSession: 0,
        asked: [],
        spent: [],
        confronted: [],
        locked: false,
        transcript: [],
      };
    }
  }
  for (const m of def.materials) {
    if (m.start) state.materials[m.id] = { unlockedAt: 0, readBy: [], importantBy: [] };
  }
  return state;
}
