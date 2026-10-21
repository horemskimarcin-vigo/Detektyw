import type { Accusation, ActionResult, GameAction, ProposalPayload, Tone } from '@detektyw/shared';
import { indexCase, type CaseIndex } from './case-index.js';
import { evaluate, type EndingCtx, type EvalCtx, type InterviewCtx } from './conditions.js';
import { assistantAsk, requestHint } from './hints.js';
import type { CaseDef, DecisionDef, Effect, ResponseDef } from './schema.js';
import type { GameState, InterviewState } from './state.js';

export class EngineError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ActionCtx {
  seat: number;
  /** Czas rzeczywisty (ms) – do cooldownu asystenta i wykrywania utknięcia. */
  now: number;
}

export interface ApplyResult {
  state: GameState;
  result: ActionResult;
}

const LIMITS = {
  notes: 300,
  noteText: 4000,
  boardNodes: 200,
  boardEdges: 400,
  timeline: 200,
  label: 200,
};

const TONE_EFFECT: Record<Tone, { stress: number; trust: number }> = {
  calm: { stress: 2, trust: 1 },
  press: { stress: 14, trust: -6 },
  empathetic: { stress: -6, trust: 5 },
};

/** Akcje dozwolone po upływie terminu (pozostaje już tylko analiza i decyzja o oskarżeniu). */
const DEADLINE_ALLOWED = new Set<GameAction['type']>([
  'open_material',
  'mark_material',
  'share_material',
  'inspect',
  'propose',
  'vote',
  'cancel_proposal',
  'accuse',
  'close_case',
  'note_save',
  'note_delete',
  'board_add',
  'board_move',
  'board_update',
  'board_remove',
  'board_link',
  'board_unlink',
  'timeline_save',
  'timeline_move',
  'timeline_delete',
  'hint_request',
  'assistant_ask',
  'set_role',
]);

/** Akcje porządkowe – nie liczą się jako „działanie śledcze” dla asystenta. */
const WORKSPACE_ACTIONS = new Set<GameAction['type']>([
  'note_delete',
  'board_move',
  'board_update',
  'board_remove',
  'board_unlink',
  'timeline_move',
  'timeline_delete',
  'set_role',
  'hint_request',
  'assistant_ask',
  'cancel_proposal',
]);

export function fail(code: string, message: string): never {
  throw new EngineError(code, message);
}

/* ------------------------------------------------------------------ */
/* Pomocnicze                                                          */
/* ------------------------------------------------------------------ */

export function isMaterialVisible(state: GameState, materialId: string, seat: number): boolean {
  const m = state.materials[materialId];
  return !!m && (m.holder === undefined || m.holder === seat);
}

export function isHotspotVisible(
  def: CaseDef,
  state: GameState,
  hotspotId: string,
  seat: number,
): boolean {
  if (!(hotspotId in state.hotspots)) return false;
  const ref = indexCase(def).hotspots.get(hotspotId);
  return !!ref && isMaterialVisible(state, ref.materialId, seat);
}

/** Czy gracz może odwołać się do danego identyfikatora (tablica, oś czasu, dowód). */
export function isRefVisible(def: CaseDef, state: GameState, ref: string, seat: number): boolean {
  return (
    isMaterialVisible(state, ref, seat) ||
    isHotspotVisible(def, state, ref, seat) ||
    state.knownPeople.includes(ref)
  );
}

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function newId(state: GameState, prefix: string) {
  return `${prefix}${state.nextId++}`;
}

function journal(state: GameState, kind: GameState['journal'][number]['kind'], text: string) {
  state.journal.push({ at: state.time, kind, text });
  if (state.journal.length > 400) state.journal.splice(0, state.journal.length - 400);
}

function ctxOf(def: CaseDef, state: GameState, extra: Partial<EvalCtx> = {}): EvalCtx {
  return { def, state, ...extra };
}

function progressSignature(state: GameState): string {
  const asked = Object.values(state.interviews).reduce(
    (n, i) => n + i.asked.length + i.confronted.length,
    0,
  );
  return [
    Object.keys(state.materials).length,
    Object.keys(state.flags).length,
    Object.keys(state.hotspots).length,
    Object.keys(state.decisions).length,
    state.knownPeople.length,
    asked,
  ].join(':');
}

/* ------------------------------------------------------------------ */
/* Efekty, czas, automatyczne odblokowania                             */
/* ------------------------------------------------------------------ */

function unlockMaterial(def: CaseDef, idx: CaseIndex, state: GameState, id: string, seat: number) {
  if (id in state.materials || state.lockedMaterials.includes(id)) return;
  const m = idx.materials.get(id);
  if (!m) return;
  state.materials[id] = {
    unlockedAt: state.time,
    readBy: [],
    importantBy: [],
    ...(m.private && state.mode === 'coop' ? { holder: seat } : {}),
  };
  journal(state, 'unlock', `Nowy materiał w teczce: ${m.title}`);
}

export function applyEffect(
  def: CaseDef,
  state: GameState,
  effect: Effect | undefined,
  seat: number,
) {
  if (!effect) return;
  const idx = indexCase(def);
  for (const f of effect.set ?? []) state.flags[f] = true;
  for (const f of effect.clear ?? []) delete state.flags[f];
  for (const [k, v] of Object.entries(effect.inc ?? {}))
    state.counters[k] = (state.counters[k] ?? 0) + v;
  for (const [p, v] of Object.entries(effect.stress ?? {})) {
    const i = state.interviews[p];
    if (i) i.stress = clamp(i.stress + v);
  }
  for (const [p, v] of Object.entries(effect.trust ?? {})) {
    const i = state.interviews[p];
    if (i) i.trust = clamp(i.trust + v);
  }
  for (const p of effect.reveal ?? [])
    if (!state.knownPeople.includes(p)) state.knownPeople.push(p);
  for (const p of effect.lockInterview ?? []) {
    const i = state.interviews[p];
    if (i) {
      i.locked = true;
      i.inSession = false;
    }
  }
  for (const p of effect.unlockInterview ?? []) {
    const i = state.interviews[p];
    if (i) i.locked = false;
  }
  for (const d of effect.lockDecision ?? [])
    if (!state.lockedDecisions.includes(d)) state.lockedDecisions.push(d);
  for (const m of effect.lock ?? []) {
    if (!(m in state.materials) && !state.lockedMaterials.includes(m))
      state.lockedMaterials.push(m);
  }
  if (effect.budget) {
    const b = effect.budget;
    state.budget.lab = Math.max(0, state.budget.lab + (b.lab ?? 0));
    state.budget.police = Math.max(0, state.budget.police + (b.police ?? 0));
    state.budget.patience = Math.max(0, state.budget.patience + (b.patience ?? 0));
    if (b.time) state.time = clamp(state.time - b.time, 0, def.budget.time);
  }
  if (effect.journal) journal(state, 'info', effect.journal);
  for (const m of effect.unlock ?? []) unlockMaterial(def, idx, state, m, seat);
}

/** Upływ czasu: dostarcza zaległe wyniki, a po przekroczeniu budżetu uruchamia termin. */
export function advanceTime(def: CaseDef, state: GameState, units: number) {
  state.time = Math.min(def.budget.time, state.time + units);
  const due = state.pending
    .filter((p) => p.readyAt <= state.time)
    .sort((a, b) => a.readyAt - b.readyAt);
  state.pending = state.pending.filter((p) => p.readyAt > state.time);
  for (const p of due) {
    journal(state, 'decision', `${p.label}: ${p.text}`);
    applyEffect(def, state, p.effects, p.by);
  }
}

function checkDeadline(def: CaseDef, state: GameState) {
  // Rozpoczęta w ostatnim pół dniu rozmowa toczy się do końca – termin zapada po niej.
  const talking = Object.values(state.interviews).some((i) => i.inSession);
  if (state.phase === 'investigation' && state.time >= def.budget.time && !talking) {
    state.phase = 'deadline';
    for (const p of state.pending)
      journal(state, 'deadline', `${p.label}: wyniki nie dotarły przed terminem.`);
    state.pending = [];
    for (const i of Object.values(state.interviews)) i.inSession = false;
    journal(state, 'deadline', def.deadlineText);
  }
}

/** Automatyczne odblokowania i blokady wynikające z warunków (do ustalenia stanu). */
export function refresh(def: CaseDef, state: GameState, seat: number) {
  const idx = indexCase(def);
  for (let round = 0; round < 20; round++) {
    const before = progressSignature(state) + state.lockedMaterials.length;
    const ctx = ctxOf(def, state);
    for (const p of def.people) {
      if (!state.knownPeople.includes(p.id) && evaluate(p.knownWhen, ctx))
        state.knownPeople.push(p.id);
    }
    for (const m of def.materials) {
      if (m.id in state.materials || state.lockedMaterials.includes(m.id)) continue;
      if (m.lockWhen !== undefined && evaluate(m.lockWhen, ctx)) {
        state.lockedMaterials.push(m.id);
      } else if (m.unlockWhen !== undefined && evaluate(m.unlockWhen, ctx)) {
        unlockMaterial(def, idx, state, m.id, seat);
      }
    }
    if (progressSignature(state) + state.lockedMaterials.length === before) return;
  }
}

/* ------------------------------------------------------------------ */
/* Przesłuchania                                                       */
/* ------------------------------------------------------------------ */

function interviewCtx(personId: string, i: InterviewState, tone: Tone): InterviewCtx {
  return { personId, tone, stress: i.stress, trust: i.trust, session: i.sessions };
}

export function availableQuestions(def: CaseDef, state: GameState, personId: string) {
  const person = indexCase(def).people.get(personId);
  const i = state.interviews[personId];
  if (!person?.interview || !i) return [];
  const ctx = ctxOf(def, state, { interview: interviewCtx(personId, i, i.lastTone ?? 'calm') });
  return person.interview.questions.filter(
    (q) => (q.repeatable || !(i.spent ?? i.asked).includes(q.id)) && evaluate(q.requires, ctx),
  );
}

export function interviewAvailability(
  def: CaseDef,
  state: GameState,
  personId: string,
): string | null {
  const person = indexCase(def).people.get(personId);
  const i = state.interviews[personId];
  if (!person?.interview || !i) return 'Tej osoby nie można przesłuchać.';
  if (!state.knownPeople.includes(personId)) return 'Nie znasz tej osoby.';
  if (i.locked) return person.interview.lockedText ?? 'Ta osoba odmawia dalszych rozmów.';
  if (state.phase !== 'investigation') return 'Czas śledztwa minął.';
  if (!evaluate(person.interview.availableWhen, ctxOf(def, state))) {
    return person.interview.unavailableText ?? 'Ta osoba jest obecnie nieosiągalna.';
  }
  return null;
}

function respond(
  def: CaseDef,
  state: GameState,
  personId: string,
  i: InterviewState,
  tone: Tone,
  responses: ResponseDef[],
  seat: number,
): ResponseDef {
  const ctx = ctxOf(def, state, { interview: interviewCtx(personId, i, tone) });
  const r = responses.find((x) => evaluate(x.when, ctx)) ?? responses[responses.length - 1]!;
  i.transcript.push({ session: i.sessions, kind: 'answer', text: r.text });
  applyEffect(def, state, r.effects, seat);
  return r;
}

/** Odpowiedź rozstrzygająca: wnosi efekt albo nie ma „lepszej” wersji zależnej od warunków. */
function isConclusive(r: ResponseDef, all: ResponseDef[]): boolean {
  if (r.effects) return true;
  return !all.some((x) => x !== r && x.when !== undefined && x.effects);
}

function applyTone(def: CaseDef, personId: string, i: InterviewState, tone: Tone) {
  const person = indexCase(def).people.get(personId)!;
  const t = TONE_EFFECT[tone];
  const sens = tone === 'press' ? person.interview!.pressSensitivity : 1;
  i.stress = clamp(i.stress + Math.round(t.stress * sens));
  i.trust = clamp(i.trust + t.trust);
  i.lastTone = tone;
}

function afterAnswer(
  def: CaseDef,
  personId: string,
  i: InterviewState,
  r: ResponseDef,
  result: ActionResult,
) {
  const iv = indexCase(def).people.get(personId)!.interview!;
  i.questionsThisSession++;
  if (i.stress >= iv.breakAt) {
    i.transcript.push({ session: i.sessions, kind: 'system', text: iv.breakText });
    result.messages.push(iv.breakText);
    i.inSession = false;
    if (iv.lockOnBreak) i.locked = true;
  } else if (r.endSession || i.questionsThisSession >= iv.questionsPerSession) {
    const text = r.endSession
      ? 'Rozmówca kończy rozmowę.'
      : 'Czas przeznaczony na tę rozmowę dobiegł końca.';
    i.transcript.push({ session: i.sessions, kind: 'system', text });
    i.inSession = false;
  }
}

function requireSession(state: GameState, personId: string): InterviewState {
  const i = state.interviews[personId];
  if (!i?.inSession) fail('no_session', 'Najpierw rozpocznij rozmowę z tą osobą.');
  return i;
}

/* ------------------------------------------------------------------ */
/* Decyzje i oskarżenie                                                */
/* ------------------------------------------------------------------ */

export function decisionAvailable(def: CaseDef, state: GameState, d: DecisionDef): boolean {
  return (
    state.phase === 'investigation' &&
    !(d.id in state.decisions) &&
    !state.lockedDecisions.includes(d.id) &&
    evaluate(d.requires, ctxOf(def, state))
  );
}

export function decisionAffordable(def: CaseDef, state: GameState, d: DecisionDef): boolean {
  return (
    state.budget.lab >= d.cost.lab &&
    state.budget.police >= d.cost.police &&
    state.budget.patience >= d.cost.patience &&
    state.time + d.cost.time <= def.budget.time
  );
}

function takeDecision(
  def: CaseDef,
  state: GameState,
  decisionId: string,
  seat: number,
  result: ActionResult,
) {
  const d = indexCase(def).decisions.get(decisionId);
  if (!d || !decisionAvailable(def, state, d)) fail('unavailable', 'Ta decyzja nie jest dostępna.');
  if (!decisionAffordable(def, state, d))
    fail('budget', 'Brakuje środków lub czasu na tę decyzję.');
  state.budget.lab -= d.cost.lab;
  state.budget.police -= d.cost.police;
  state.budget.patience -= d.cost.patience;
  const outcome = d.outcomes.find((o) => evaluate(o.when, ctxOf(def, state))) ?? d.outcomes.at(-1)!;
  state.decisions[d.id] = { at: state.time, by: seat, outcome: outcome.text };
  if (d.exclusiveGroup) {
    for (const other of def.decisions) {
      if (
        other.exclusiveGroup === d.exclusiveGroup &&
        other.id !== d.id &&
        !state.lockedDecisions.includes(other.id)
      ) {
        state.lockedDecisions.push(other.id);
      }
    }
  }
  journal(state, 'decision', `${d.title}: ${outcome.text}`);
  result.messages.push(outcome.text);
  applyEffect(def, state, outcome.effects, seat);
  if (outcome.delayed) {
    state.pending.push({
      id: newId(state, 'p'),
      readyAt: state.time + d.cost.time + outcome.delayed.after,
      label: d.title,
      text: outcome.delayed.text,
      effects: outcome.delayed.effects,
      by: seat,
    });
  }
  if (d.cost.time) advanceTime(def, state, d.cost.time);
}

export function accusationOptions(def: CaseDef, state: GameState) {
  const ctx = ctxOf(def, state);
  const pick = (list: { id: string; text: string; requires?: unknown }[]) =>
    list.filter((o) => evaluate(o.requires as never, ctx)).map(({ id, text }) => ({ id, text }));
  return {
    suspects: def.people
      .filter((p) => p.role !== 'victim' && state.knownPeople.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name })),
    motives: pick(def.accusation.motives),
    means: pick(def.accusation.means),
    opportunities: pick(def.accusation.opportunities),
    maxEvidence: def.accusation.maxEvidence,
  };
}

function validateAccusation(def: CaseDef, state: GameState, a: Accusation, seat: number) {
  const opts = accusationOptions(def, state);
  if (!opts.suspects.some((s) => s.id === a.suspectId)) fail('invalid', 'Wskaż osobę z listy.');
  if (!opts.motives.some((o) => o.id === a.motiveId)) fail('invalid', 'Wybierz motyw.');
  if (!opts.means.some((o) => o.id === a.meansId)) fail('invalid', 'Wybierz sposób.');
  if (!opts.opportunities.some((o) => o.id === a.opportunityId))
    fail('invalid', 'Wybierz okoliczności.');
  const evidence = [...new Set(a.evidence)];
  if (evidence.length < 1 || evidence.length > opts.maxEvidence) {
    fail('invalid', `Wskaż od 1 do ${opts.maxEvidence} dowodów.`);
  }
  for (const e of evidence) {
    if (!isMaterialVisible(state, e, seat) && !isHotspotVisible(def, state, e, seat)) {
      fail('invalid', 'Dowód musi pochodzić z Twojej teczki.');
    }
  }
  return { ...a, evidence };
}

export function endingContext(def: CaseDef, state: GameState): EndingCtx {
  const a = state.accusation;
  return {
    accusedCorrect: a?.correct ?? false,
    accused: a?.suspectId,
    strength: a?.strength ?? 0,
    reasoning: a?.reasoning ?? 0,
    hints: state.assistant.hintsUsed,
    timeout: state.phase === 'deadline' || state.time >= def.budget.time,
    closedCase: state.closedCase ?? false,
  };
}

function finish(def: CaseDef, state: GameState) {
  const ctx = ctxOf(def, state, { ending: endingContext(def, state) });
  const ending = [...def.endings]
    .sort((a, b) => b.priority - a.priority)
    .find((e) => evaluate(e.when, ctx));
  if (!ending) fail('no_ending', 'Brak pasującego zakończenia (błąd w definicji sprawy).');
  state.phase = 'finished';
  state.ending = { id: ending.id, at: state.time };
  state.proposals = [];
  for (const i of Object.values(state.interviews)) i.inSession = false;
}

function accuse(def: CaseDef, state: GameState, raw: Accusation, seat: number) {
  const a = validateAccusation(def, state, raw, seat);
  const sol = def.solution;
  const strength = sol.keyEvidence
    .filter((k) => a.evidence.includes(k.ref))
    .reduce((n, k) => n + k.weight, 0);
  const reasoning =
    Number(a.motiveId === sol.motive) +
    Number(a.meansId === sol.means) +
    Number(a.opportunityId === sol.opportunity);
  state.accusation = { ...a, by: seat, correct: a.suspectId === sol.culprit, strength, reasoning };
  finish(def, state);
}

function closeCase(def: CaseDef, state: GameState) {
  state.closedCase = true;
  finish(def, state);
}

function proposalSummary(def: CaseDef, p: ProposalPayload): string {
  if (p.kind === 'decision')
    return indexCase(def).decisions.get(p.decisionId)?.title ?? p.decisionId;
  if (p.kind === 'accusation') {
    return `Akt oskarżenia: ${indexCase(def).people.get(p.accusation.suspectId)?.name ?? '?'}`;
  }
  return 'Zamknięcie śledztwa bez oskarżenia';
}
export { proposalSummary };

function executeProposal(
  def: CaseDef,
  state: GameState,
  p: GameState['proposals'][number],
  result: ActionResult,
) {
  if (p.payload.kind === 'decision') takeDecision(def, state, p.payload.decisionId, p.by, result);
  else if (p.payload.kind === 'accusation') accuse(def, state, p.payload.accusation, p.by);
  else closeCase(def, state);
}

function needsAgreement(def: CaseDef, state: GameState, p: ProposalPayload): boolean {
  if (state.mode !== 'coop' || state.seats.length < 2) return false;
  if (p.kind === 'decision') return indexCase(def).decisions.get(p.decisionId)?.key ?? false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Główna funkcja                                                      */
/* ------------------------------------------------------------------ */

export function applyAction(
  def: CaseDef,
  prev: GameState,
  action: GameAction,
  ctx: ActionCtx,
): ApplyResult {
  const { seat, now } = ctx;
  if (!prev.seats.includes(seat)) fail('forbidden', 'Nie uczestniczysz w tej sprawie.');
  if (prev.phase === 'finished') fail('finished', 'Ta sprawa jest już zamknięta.');
  if (prev.phase === 'deadline' && !DEADLINE_ALLOWED.has(action.type)) {
    fail('deadline', 'Czas śledztwa minął. Pozostało oskarżenie albo zamknięcie sprawy.');
  }
  const state: GameState = structuredClone(prev);
  const idx = indexCase(def);
  const result: ActionResult = { messages: [] };
  const before = progressSignature(state);

  switch (action.type) {
    case 'open_material': {
      if (!isMaterialVisible(state, action.materialId, seat))
        fail('not_found', 'Nie masz tego materiału.');
      const m = state.materials[action.materialId]!;
      const first = m.readBy.length === 0;
      if (!m.readBy.includes(seat)) m.readBy.push(seat);
      if (first) applyEffect(def, state, idx.materials.get(action.materialId)?.onRead, seat);
      const recent = state.activity.recentOpens;
      recent.push(action.materialId);
      if (recent.length > 20) recent.shift();
      break;
    }
    case 'mark_material': {
      if (!isMaterialVisible(state, action.materialId, seat))
        fail('not_found', 'Nie masz tego materiału.');
      const m = state.materials[action.materialId]!;
      m.importantBy = m.importantBy.filter((s) => s !== seat);
      if (action.important) m.importantBy.push(seat);
      break;
    }
    case 'share_material': {
      const m = state.materials[action.materialId];
      if (!m || m.holder !== seat) fail('not_found', 'Nie możesz przekazać tego materiału.');
      delete m.holder;
      m.sharedBy = seat;
      journal(
        state,
        'coop',
        `{{seat:${seat}}} przekazuje partnerowi: ${idx.materials.get(action.materialId)!.title}`,
      );
      break;
    }
    case 'inspect': {
      if (!isMaterialVisible(state, action.materialId, seat))
        fail('not_found', 'Nie masz tego materiału.');
      const body = idx.materials.get(action.materialId)!.body;
      let hotspots;
      let aspect = 1;
      if (body.kind === 'photo') {
        hotspots = body.hotspots;
        aspect = body.height / body.width;
      } else if (body.kind === 'cctv') {
        hotspots = body.frames[action.frame ?? -1]?.hotspots;
        aspect = 9 / 16;
      }
      if (!hotspots) fail('invalid', 'Tego materiału nie da się oglądać w powiększeniu.');
      const hit = hotspots.find((h) => {
        if (h.id in state.hotspots || action.zoom < h.minZoom) return false;
        const dx = action.x - h.x;
        const dy = (action.y - h.y) * aspect;
        return dx * dx + dy * dy <= h.r * h.r;
      });
      if (hit) {
        state.hotspots[hit.id] = { by: seat, at: state.time };
        journal(state, 'info', `Zauważono szczegół: ${hit.label}`);
        applyEffect(def, state, hit.effects, seat);
        result.found = {
          id: hit.id,
          materialId: action.materialId,
          frame: body.kind === 'cctv' ? action.frame : undefined,
          x: hit.x,
          y: hit.y,
          r: hit.r,
          label: hit.label,
          description: hit.description,
        };
      } else {
        result.messages.push('Nic, co zwracałoby uwagę w tym miejscu.');
      }
      break;
    }
    case 'start_interview': {
      const reason = interviewAvailability(def, state, action.personId);
      if (reason) fail('unavailable', reason);
      if (state.time + 1 > def.budget.time) fail('budget', 'Brakuje czasu na kolejną rozmowę.');
      for (const other of Object.values(state.interviews)) other.inSession = false;
      const i = state.interviews[action.personId]!;
      advanceTime(def, state, 1);
      // Między rozmowami emocje opadają (stres wraca w stronę poziomu wyjściowego).
      const base = idx.people.get(action.personId)!.interview!.baseStress;
      if (i.sessions > 0 && i.stress > base) i.stress = Math.max(base, i.stress - 25);
      i.sessions++;
      i.inSession = true;
      i.questionsThisSession = 0;
      const iv = idx.people.get(action.personId)!.interview!;
      i.transcript.push({ session: i.sessions, kind: 'opening', text: iv.opening });
      if (i.transcript.length > 600) i.transcript.splice(0, i.transcript.length - 600);
      break;
    }
    case 'ask': {
      const i = requireSession(state, action.personId);
      const q = availableQuestions(def, state, action.personId).find(
        (x) => x.id === action.questionId,
      );
      if (!q) fail('unavailable', 'Tego pytania nie można teraz zadać.');
      i.transcript.push({ session: i.sessions, kind: 'question', tone: action.tone, text: q.text });
      applyTone(def, action.personId, i, action.tone);
      if (!i.asked.includes(q.id)) i.asked.push(q.id);
      const r = respond(def, state, action.personId, i, action.tone, q.responses, seat);
      // Nieudana próba (odpowiedź wymijająca, gdy istnieje lepsza) nie zamyka pytania – można wrócić później.
      if (isConclusive(r, q.responses)) (i.spent ??= [...i.asked]).push(q.id);
      result.messages.push(r.text);
      afterAnswer(def, action.personId, i, r, result);
      break;
    }
    case 'confront': {
      const i = requireSession(state, action.personId);
      if (
        !isRefVisible(def, state, action.evidence, seat) ||
        state.knownPeople.includes(action.evidence)
      ) {
        fail('invalid', 'Możesz okazać tylko materiał lub szczegół ze swojej teczki.');
      }
      const iv = idx.people.get(action.personId)!.interview!;
      const label =
        idx.materials.get(action.evidence)?.title ??
        idx.hotspots.get(action.evidence)?.def.label ??
        action.evidence;
      i.transcript.push({
        session: i.sessions,
        kind: 'confront',
        tone: action.tone,
        text: `Okazuję: ${label}`,
      });
      applyTone(def, action.personId, i, action.tone);
      const already = i.confronted.includes(action.evidence);
      const entry = already
        ? undefined
        : iv.confrontations.find(
            (c) =>
              c.evidence === action.evidence &&
              evaluate(
                c.requires,
                ctxOf(def, state, { interview: interviewCtx(action.personId, i, action.tone) }),
              ),
          );
      const responses = entry?.responses ?? [{ text: iv.confrontDefault, endSession: false }];
      const r = respond(def, state, action.personId, i, action.tone, responses, seat);
      if (!already && isConclusive(r, responses)) i.confronted.push(action.evidence);
      result.messages.push(r.text);
      afterAnswer(def, action.personId, i, r, result);
      break;
    }
    case 'end_interview': {
      const i = state.interviews[action.personId];
      if (i?.inSession) {
        i.inSession = false;
        i.transcript.push({ session: i.sessions, kind: 'system', text: 'Kończysz rozmowę.' });
      }
      break;
    }
    case 'take_decision': {
      if (needsAgreement(def, state, { kind: 'decision', decisionId: action.decisionId })) {
        fail('needs_agreement', 'Ta decyzja wymaga zgody obu śledczych. Zaproponuj ją partnerowi.');
      }
      takeDecision(def, state, action.decisionId, seat, result);
      break;
    }
    case 'wait': {
      if (state.time >= def.budget.time) fail('budget', 'Nie ma już czasu do przeczekania.');
      advanceTime(def, state, 1);
      journal(state, 'info', 'Mija pół dnia.');
      break;
    }
    case 'propose': {
      if (!needsAgreement(def, state, action.proposal)) {
        fail('invalid', 'Ta akcja nie wymaga zgody partnera – wykonaj ją bezpośrednio.');
      }
      const p = action.proposal;
      if (p.kind === 'decision') {
        const d = idx.decisions.get(p.decisionId);
        if (!d || !decisionAvailable(def, state, d))
          fail('unavailable', 'Ta decyzja nie jest dostępna.');
        if (!decisionAffordable(def, state, d))
          fail('budget', 'Brakuje środków lub czasu na tę decyzję.');
      } else if (p.kind === 'accusation') {
        validateAccusation(def, state, p.accusation, seat);
      }
      state.proposals = state.proposals.filter(
        (x) => !(x.payload.kind === p.kind && JSON.stringify(x.payload) === JSON.stringify(p)),
      );
      const id = newId(state, 'pr');
      state.proposals.push({ id, by: seat, payload: p, approvals: [seat], createdAt: state.time });
      journal(state, 'coop', `{{seat:${seat}}} proponuje: ${proposalSummary(def, p)}`);
      result.proposalId = id;
      break;
    }
    case 'vote': {
      const p = state.proposals.find((x) => x.id === action.proposalId);
      if (!p) fail('not_found', 'Ta propozycja jest już nieaktualna.');
      if (!action.approve) {
        state.proposals = state.proposals.filter((x) => x.id !== p.id);
        journal(
          state,
          'coop',
          `{{seat:${seat}}} odrzuca propozycję: ${proposalSummary(def, p.payload)}`,
        );
        break;
      }
      if (!p.approvals.includes(seat)) p.approvals.push(seat);
      if (state.seats.every((s) => p.approvals.includes(s))) {
        state.proposals = state.proposals.filter((x) => x.id !== p.id);
        journal(state, 'coop', `Wspólna decyzja: ${proposalSummary(def, p.payload)}`);
        executeProposal(def, state, p, result);
      }
      break;
    }
    case 'cancel_proposal': {
      const p = state.proposals.find((x) => x.id === action.proposalId);
      if (!p || p.by !== seat) fail('not_found', 'Nie możesz wycofać tej propozycji.');
      state.proposals = state.proposals.filter((x) => x.id !== p.id);
      break;
    }
    case 'accuse': {
      if (needsAgreement(def, state, { kind: 'accusation', accusation: action.accusation })) {
        fail('needs_agreement', 'Oskarżenie wymaga zgody obu śledczych.');
      }
      accuse(def, state, action.accusation, seat);
      break;
    }
    case 'close_case': {
      if (needsAgreement(def, state, { kind: 'close_case' })) {
        fail('needs_agreement', 'Zamknięcie sprawy wymaga zgody obu śledczych.');
      }
      closeCase(def, state);
      break;
    }
    case 'note_save': {
      const { note } = action;
      const text = note.text.slice(0, LIMITS.noteText);
      if (note.quote && !isMaterialVisible(state, note.quote.materialId, seat))
        fail('invalid', 'Nieznany materiał.');
      const quote = note.quote
        ? { materialId: note.quote.materialId, text: note.quote.text.slice(0, 1000) }
        : undefined;
      if (note.id) {
        const n = state.notes.find((x) => x.id === note.id);
        if (!n || (!n.shared && n.author !== seat)) fail('not_found', 'Nie znaleziono notatki.');
        Object.assign(n, {
          text,
          shared: state.mode === 'coop' ? note.shared : false,
          updatedAt: now,
        });
        if (quote) n.quote = quote;
      } else {
        if (state.notes.length >= LIMITS.notes) fail('limit', 'Notatnik jest pełny.');
        state.notes.push({
          id: newId(state, 'n'),
          author: seat,
          shared: state.mode === 'coop' ? note.shared : false,
          text,
          quote,
          updatedAt: now,
        });
      }
      break;
    }
    case 'note_delete': {
      const n = state.notes.find((x) => x.id === action.noteId);
      if (!n || (!n.shared && n.author !== seat)) fail('not_found', 'Nie znaleziono notatki.');
      state.notes = state.notes.filter((x) => x.id !== n.id);
      break;
    }
    case 'board_add': {
      const { node } = action;
      if (state.board.nodes.length >= LIMITS.boardNodes) fail('limit', 'Tablica jest pełna.');
      if (node.ref !== undefined && !isRefVisible(def, state, node.ref, seat))
        fail('invalid', 'Nieznany element.');
      if (node.ref !== undefined && state.board.nodes.some((n) => n.ref === node.ref)) {
        fail('duplicate', 'Ten element już jest na tablicy.');
      }
      state.board.nodes.push({
        id: newId(state, 'b'),
        kind: node.kind,
        ref: node.ref,
        label: node.label.slice(0, LIMITS.label),
        x: clamp(node.x, 0, 4000),
        y: clamp(node.y, 0, 4000),
      });
      break;
    }
    case 'board_move': {
      const n = state.board.nodes.find((x) => x.id === action.nodeId);
      if (!n) fail('not_found', 'Nie ma takiego elementu.');
      n.x = clamp(action.x, 0, 4000);
      n.y = clamp(action.y, 0, 4000);
      break;
    }
    case 'board_update': {
      const n = state.board.nodes.find((x) => x.id === action.nodeId);
      if (!n) fail('not_found', 'Nie ma takiego elementu.');
      n.label = action.label.slice(0, LIMITS.label);
      break;
    }
    case 'board_remove': {
      state.board.nodes = state.board.nodes.filter((x) => x.id !== action.nodeId);
      state.board.edges = state.board.edges.filter(
        (e) => e.from !== action.nodeId && e.to !== action.nodeId,
      );
      break;
    }
    case 'board_link': {
      const { from, to } = action;
      const ids = new Set(state.board.nodes.map((n) => n.id));
      if (from === to || !ids.has(from) || !ids.has(to))
        fail('invalid', 'Nieprawidłowe połączenie.');
      if (state.board.edges.length >= LIMITS.boardEdges) fail('limit', 'Za dużo połączeń.');
      if (
        !state.board.edges.some(
          (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
        )
      ) {
        state.board.edges.push({
          id: newId(state, 'e'),
          from,
          to,
          label: action.label?.slice(0, LIMITS.label),
        });
      }
      break;
    }
    case 'board_unlink': {
      state.board.edges = state.board.edges.filter((e) => e.id !== action.edgeId);
      break;
    }
    case 'timeline_save': {
      const { entry } = action;
      const refs = [...new Set(entry.refs)]
        .filter((r) => isRefVisible(def, state, r, seat))
        .slice(0, 10);
      const data = {
        time: entry.time.slice(0, 40),
        label: entry.label.slice(0, LIMITS.label * 2),
        refs,
      };
      if (entry.id) {
        const e = state.timeline.find((x) => x.id === entry.id);
        if (!e) fail('not_found', 'Nie ma takiego wpisu.');
        Object.assign(e, data);
      } else {
        if (state.timeline.length >= LIMITS.timeline) fail('limit', 'Oś czasu jest pełna.');
        state.timeline.push({ id: newId(state, 't'), ...data });
      }
      break;
    }
    case 'timeline_move': {
      const i = state.timeline.findIndex((x) => x.id === action.entryId);
      const j = i + action.direction;
      if (i < 0 || j < 0 || j >= state.timeline.length) break;
      [state.timeline[i], state.timeline[j]] = [state.timeline[j]!, state.timeline[i]!];
      break;
    }
    case 'timeline_delete': {
      state.timeline = state.timeline.filter((x) => x.id !== action.entryId);
      break;
    }
    case 'hint_request': {
      result.assistant = requestHint(def, state, seat, now);
      break;
    }
    case 'assistant_ask': {
      result.assistant = assistantAsk(def, state, seat, now, action.text);
      break;
    }
    case 'set_role': {
      state.roles[seat] = action.role.slice(0, 40);
      break;
    }
    default: {
      const never: never = action;
      fail('invalid', `Nieznana akcja ${(never as { type: string }).type}`);
    }
  }

  if (state.phase !== 'finished') {
    refresh(def, state, seat);
    checkDeadline(def, state);
  }
  if (!WORKSPACE_ACTIONS.has(action.type)) state.assistant.actionsSinceHint++;
  if (progressSignature(state) !== before) {
    state.activity.lastProgressAt = now;
    state.activity.actionsSinceProgress = 0;
  } else if (!WORKSPACE_ACTIONS.has(action.type)) {
    state.activity.actionsSinceProgress++;
  }
  return { state, result };
}

/** Pierwsze „odświeżenie” po utworzeniu gry (osoby i materiały startowe). */
export function startGame(def: CaseDef, state: GameState): GameState {
  const s = structuredClone(state);
  refresh(def, s, s.seats[0] ?? 1);
  s.journal.unshift({
    at: 0,
    kind: 'info',
    text: 'Śledztwo rozpoczęte. Teczka sprawy czeka na biurku.',
  });
  return s;
}
