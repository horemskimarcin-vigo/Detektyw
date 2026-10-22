/**
 * Kontrakt rozgrywki klient–serwer.
 * Klient wysyła wyłącznie intencje (GameAction), a dostaje projekcję stanu (GameView)
 * zawierającą tylko to, co dany gracz odblokował. Żadnych warunków, flag ani rozwiązania.
 */

export type Tone = 'calm' | 'press' | 'empathetic';

export type MaterialType =
  | 'autopsy'
  | 'report'
  | 'press'
  | 'testimony'
  | 'cctv'
  | 'photo'
  | 'phone'
  | 'bank'
  | 'messages'
  | 'inventory'
  | 'lab'
  | 'field'
  | 'other';

export interface Accusation {
  suspectId: string;
  evidence: string[];
  motiveId: string;
  meansId: string;
  opportunityId: string;
}

export type ProposalPayload =
  | { kind: 'decision'; decisionId: string }
  | { kind: 'accusation'; accusation: Accusation }
  | { kind: 'close_case' };

export interface NoteInput {
  id?: string;
  text: string;
  shared: boolean;
  quote?: { materialId: string; text: string };
}

export type BoardNodeKind = 'person' | 'material' | 'hotspot' | 'location' | 'note' | 'time';

export type GameAction =
  | { type: 'open_material'; materialId: string }
  | { type: 'mark_material'; materialId: string; important: boolean }
  | { type: 'share_material'; materialId: string }
  | { type: 'inspect'; materialId: string; frame?: number; x: number; y: number; zoom: number }
  | { type: 'start_interview'; personId: string }
  | { type: 'ask'; personId: string; questionId: string; tone: Tone }
  | { type: 'confront'; personId: string; evidence: string; tone: Tone }
  | { type: 'end_interview'; personId: string }
  | { type: 'take_decision'; decisionId: string }
  | { type: 'wait' }
  | { type: 'propose'; proposal: ProposalPayload }
  | { type: 'vote'; proposalId: string; approve: boolean }
  | { type: 'cancel_proposal'; proposalId: string }
  | { type: 'accuse'; accusation: Accusation }
  | { type: 'close_case' }
  | { type: 'note_save'; note: NoteInput }
  | { type: 'note_delete'; noteId: string }
  | {
      type: 'board_add';
      node: { kind: BoardNodeKind; ref?: string; label: string; x: number; y: number };
    }
  | { type: 'board_move'; nodeId: string; x: number; y: number }
  | { type: 'board_update'; nodeId: string; label: string }
  | { type: 'board_remove'; nodeId: string }
  | { type: 'board_link'; from: string; to: string; label?: string }
  | { type: 'board_unlink'; edgeId: string }
  | { type: 'timeline_save'; entry: { id?: string; time: string; label: string; refs: string[] } }
  | { type: 'timeline_move'; entryId: string; direction: -1 | 1 }
  | { type: 'timeline_delete'; entryId: string }
  | { type: 'hint_request' }
  | { type: 'assistant_ask'; text: string }
  | { type: 'set_role'; role: string };

export type GameActionType = GameAction['type'];

/* ---------- widok ---------- */

export interface BudgetView {
  time: number;
  timeMax: number;
  lab: number;
  labMax: number;
  police: number;
  policeMax: number;
  patience: number;
  patienceMax: number;
}

export interface ClockView {
  /** Numer dnia śledztwa (od 1). */
  day: number;
  /** 0 = rano, 1 = popołudnie. */
  half: 0 | 1;
  /** Data w świecie gry, np. „pt 14.11.2025”. */
  label: string;
  unitsUsed: number;
}

export type MaterialBodyView =
  | {
      kind: 'document';
      format: string;
      header?: { label: string; value: string }[];
      text: string;
      signature?: string;
    }
  | {
      kind: 'press';
      outlet: string;
      headline: string;
      lead?: string;
      text: string;
      byline?: string;
    }
  | {
      kind: 'cctv';
      camera: string;
      location: string;
      frames: { t: string; image: string; caption: string; hotspots: HotspotView[] }[];
      log: { t: string; text: string }[];
    }
  | {
      kind: 'photo';
      image: string;
      caption: string;
      width: number;
      height: number;
      hotspots: HotspotView[];
    }
  | { kind: 'table'; columns: string[]; rows: string[][]; note?: string }
  | {
      kind: 'messages';
      participants: string[];
      messages: { from: string; t: string; text: string }[];
    };

export interface HotspotView {
  id: string;
  materialId: string;
  frame?: number;
  x: number;
  y: number;
  r: number;
  label: string;
  description: string;
}

export interface MaterialView {
  id: string;
  type: MaterialType;
  title: string;
  date?: string;
  source?: string;
  summary?: string;
  body: MaterialBodyView;
  /** Kiedy odblokowano (jednostki czasu gry). */
  unlockedAt: number;
  isNew: boolean;
  read: boolean;
  important: boolean;
  /** Tryb kooperacji: materiał widzi tylko ten gracz, dopóki go nie przekaże. */
  privateTo?: number;
  sharedBy?: number;
}

export type Mood = 'calm' | 'uneasy' | 'nervous' | 'breaking';
export type Attitude = 'hostile' | 'guarded' | 'neutral' | 'open';

export interface TranscriptEntry {
  session: number;
  kind: 'opening' | 'question' | 'confront' | 'answer' | 'system';
  tone?: Tone;
  text: string;
  /** Nagranie kwestii (gdy sprawa je ma). */
  audio?: string;
}

export interface PersonVoice {
  gender: 'female' | 'male';
  pitch: number;
  rate: number;
  /** Usta na portrecie (ułamki boku): środek linii ust, szerokość ust, odległość do brody. */
  mouth: { x: number; y: number; w: number; chin: number };
}

export interface PersonView {
  id: string;
  name: string;
  role: 'victim' | 'suspect' | 'witness' | 'other';
  title: string;
  age?: number;
  bio: string;
  portrait?: string;
  voice?: PersonVoice;
  /** Animacje postaci: pętla w ciszy i pętla mówienia (ten sam kadr). */
  video?: { idle: string; talk: string };
  facts: string[];
  relations: { personId: string; label: string }[];
  interview?: {
    available: boolean;
    unavailableReason?: string;
    locked: boolean;
    sessions: number;
    inSession: boolean;
    questionsLeft: number;
    mood: Mood;
    attitude: Attitude;
    questions: { id: string; text: string; topic?: string }[];
    transcript: TranscriptEntry[];
  };
}

export interface DecisionView {
  id: string;
  category: 'lab' | 'police' | 'warrant' | 'press' | 'arrest' | 'witness' | 'expert' | 'other';
  title: string;
  description: string;
  cost: { time: number; lab: number; police: number; patience: number };
  key: boolean;
  /** Wyniki dotrą po tylu jednostkach czasu (0 = od razu). */
  delay: number;
  affordable: boolean;
  lateWarning: boolean;
}

export interface TakenDecisionView {
  id: string;
  title: string;
  outcome: string;
  at: number;
  by?: number;
}

export interface PendingView {
  label: string;
  readyAt: number;
}

export interface JournalEntry {
  at: number;
  kind: 'info' | 'unlock' | 'decision' | 'interview' | 'lock' | 'deadline' | 'coop';
  text: string;
}

export interface NoteView {
  id: string;
  shared: boolean;
  author: number;
  text: string;
  quote?: { materialId: string; text: string };
  updatedAt: number;
}

export interface BoardNodeView {
  id: string;
  kind: BoardNodeKind;
  ref?: string;
  label: string;
  x: number;
  y: number;
}

export interface BoardEdgeView {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface TimelineEntryView {
  id: string;
  time: string;
  label: string;
  refs: string[];
}

export interface AssistantMessage {
  id: string;
  from: 'player' | 'assistant';
  seat?: number;
  text: string;
  level?: 1 | 2 | 3;
  at: number;
}

export interface ProposalView {
  id: string;
  by: number;
  kind: ProposalPayload['kind'];
  summary: string;
  approvals: number[];
  payload: ProposalPayload;
}

export interface AccusationOptionsView {
  suspects: { id: string; name: string }[];
  motives: { id: string; text: string }[];
  means: { id: string; text: string }[];
  opportunities: { id: string; text: string }[];
  maxEvidence: number;
}

export interface EndingView {
  id: string;
  title: string;
  tone: 'positive' | 'negative' | 'neutral';
  epilogue: string;
  summary: { label: string; value: string }[];
  decisions: string[];
  collection: { unlocked: number; total: number };
}

export interface GameView {
  id: string;
  caseId: string;
  caseTitle: string;
  mode: 'solo' | 'coop';
  seat: number;
  version: number;
  phase: 'investigation' | 'deadline' | 'finished';
  briefing: { title: string; text: string };
  clock: ClockView;
  budget: BudgetView;
  people: PersonView[];
  materials: MaterialView[];
  decisions: DecisionView[];
  taken: TakenDecisionView[];
  pending: PendingView[];
  journal: JournalEntry[];
  notes: NoteView[];
  board: { nodes: BoardNodeView[]; edges: BoardEdgeView[] };
  timeline: TimelineEntryView[];
  assistant: {
    name: string;
    title: string;
    enabled: boolean;
    hintsUsed: number;
    messages: AssistantMessage[];
    /** Dyskretna propozycja pomocy (gracz może ją wyłączyć w ustawieniach). */
    offerHelp: boolean;
    cooldownUntil?: number;
  };
  accusationOptions: AccusationOptionsView;
  coop?: {
    players: { seat: number; displayName: string; role?: string; online: boolean }[];
    proposals: ProposalView[];
    inviteCode?: string;
  };
  ending?: EndingView;
}

export interface ActionResult {
  /** Krótkie komunikaty do pokazania graczowi (np. wynik decyzji, odpowiedź świadka). */
  messages: string[];
  found?: HotspotView;
  assistant?: AssistantMessage;
  proposalId?: string;
}

export interface ActionResponse {
  result: ActionResult;
  view: GameView;
}

export interface ChatMessageView {
  id: string;
  seat: number;
  displayName: string;
  kind: 'text' | 'reaction';
  text: string;
  at: string;
}

/** Komunikaty WebSocket serwer → klient. */
export type ServerEvent =
  | { type: 'changed'; version: number; by: number }
  | { type: 'presence'; online: number[] }
  | { type: 'chat'; message: ChatMessageView }
  | { type: 'hello'; version: number };
