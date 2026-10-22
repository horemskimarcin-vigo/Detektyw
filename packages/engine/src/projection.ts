import type {
  Attitude,
  DecisionView,
  EndingView,
  GameView,
  HotspotView,
  MaterialBodyView,
  MaterialView,
  Mood,
  PersonView,
} from '@detektyw/shared';
import { speakable, voiceFile, voiceFilePerson } from '@detektyw/shared';
import { indexCase } from './case-index.js';
import { evaluate } from './conditions.js';
import {
  accusationOptions,
  availableQuestions,
  decisionAffordable,
  decisionAvailable,
  endingContext,
  interviewAvailability,
  isMaterialVisible,
  proposalSummary,
} from './engine.js';
import { cooldownUntil, shouldOfferHelp } from './hints.js';
import type { CaseDef, HotspotDef, MaterialDef } from './schema.js';
import type { GameState } from './state.js';

export interface ProjectionCtx {
  gameId: string;
  version: number;
  now: number;
  players: { seat: number; displayName: string; online: boolean }[];
  assistantProactive: boolean;
  collection?: { unlocked: number; total: number };
  inviteCode?: string;
  /** Adres zasobu graficznego (serwer sprawdza uprawnienia przy pobieraniu). */
  assetUrl: (file: string) => string;
  /** Czy sprawa ma dany plik (np. nagranie kwestii); domyślnie – nie. */
  hasAsset?: (file: string) => boolean;
}

const WEEKDAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];

export function clockLabel(startDate: string, units: number) {
  const day = Math.floor(units / 2);
  const d = new Date(`${startDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${WEEKDAYS[d.getUTCDay()]} ${dd}.${mm}.${d.getUTCFullYear()}, ${units % 2 === 0 ? 'rano' : 'popołudnie'}`;
}

function mood(stress: number): Mood {
  if (stress < 35) return 'calm';
  if (stress < 60) return 'uneasy';
  if (stress < 80) return 'nervous';
  return 'breaking';
}

function attitude(trust: number): Attitude {
  if (trust < 20) return 'hostile';
  if (trust < 45) return 'guarded';
  if (trust < 70) return 'neutral';
  return 'open';
}

function hotspotView(materialId: string, h: HotspotDef, frame?: number): HotspotView {
  return {
    id: h.id,
    materialId,
    frame,
    x: h.x,
    y: h.y,
    r: h.r,
    label: h.label,
    description: h.description,
  };
}

function bodyView(m: MaterialDef, state: GameState, ctx: ProjectionCtx): MaterialBodyView {
  const b = m.body;
  switch (b.kind) {
    case 'photo':
      return {
        kind: 'photo',
        image: ctx.assetUrl(b.image),
        caption: b.caption,
        width: b.width,
        height: b.height,
        // Położenie szczegółów wysyłamy dopiero po ich znalezieniu.
        hotspots: b.hotspots.filter((h) => h.id in state.hotspots).map((h) => hotspotView(m.id, h)),
      };
    case 'cctv':
      return {
        kind: 'cctv',
        camera: b.camera,
        location: b.location,
        frames: b.frames.map((f, i) => ({
          t: f.t,
          image: ctx.assetUrl(f.image),
          caption: f.caption,
          hotspots: f.hotspots
            .filter((h) => h.id in state.hotspots)
            .map((h) => hotspotView(m.id, h, i)),
        })),
        log: b.log,
      };
    case 'document':
      return {
        kind: 'document',
        format: b.format,
        header: b.header,
        text: b.text,
        signature: b.signature,
      };
    default:
      return b;
  }
}

function seatNames(text: string, ctx: ProjectionCtx) {
  return text.replace(
    /\{\{seat:(\d+)\}\}/g,
    (_, s) => ctx.players.find((p) => p.seat === Number(s))?.displayName ?? 'Partner',
  );
}

function endingView(def: CaseDef, state: GameState, ctx: ProjectionCtx): EndingView | undefined {
  if (!state.ending) return undefined;
  const e = def.endings.find((x) => x.id === state.ending!.id);
  if (!e) return undefined;
  const ectx = { def, state, ending: endingContext(def, state) };
  const addenda = e.addenda.filter((a) => evaluate(a.when, ectx)).map((a) => a.text);
  const idx = indexCase(def);
  const accused = state.accusation ? idx.people.get(state.accusation.suspectId)?.name : undefined;
  const sessions = Object.values(state.interviews).reduce((n, i) => n + i.sessions, 0);
  return {
    id: e.id,
    title: e.title,
    tone: e.tone,
    epilogue: [e.epilogue, ...addenda].join('\n\n'),
    summary: [
      {
        label: 'Twoje oskarżenie',
        value: accused ?? 'brak – sprawa zamknięta bez aktu oskarżenia',
      },
      {
        label: 'Wykorzystany czas',
        value: `${Math.ceil(state.time / 2)} z ${def.budget.time / 2} dni`,
      },
      { label: 'Zebrane materiały', value: String(Object.keys(state.materials).length) },
      { label: 'Odkryte szczegóły', value: String(Object.keys(state.hotspots).length) },
      { label: 'Przesłuchania', value: String(sessions) },
      {
        label: 'Podpowiedzi asystenta',
        value: state.noHints ? 'tryb bez podpowiedzi' : String(state.assistant.hintsUsed),
      },
    ],
    decisions: Object.entries(state.decisions)
      .sort((a, b) => a[1].at - b[1].at)
      .map(([id, d]) => `${idx.decisions.get(id)?.title ?? id} – ${d.outcome}`),
    collection: ctx.collection ?? { unlocked: 1, total: def.endings.length },
  };
}

export function project(
  def: CaseDef,
  state: GameState,
  seat: number,
  ctx: ProjectionCtx,
): GameView {
  const idx = indexCase(def);
  const ectx = { def, state };

  const materials: MaterialView[] = def.materials
    .filter((m) => isMaterialVisible(state, m.id, seat))
    .map((m) => {
      const s = state.materials[m.id]!;
      return {
        id: m.id,
        type: m.type,
        title: m.title,
        date: m.date,
        source: m.source,
        summary: m.summary,
        body: bodyView(m, state, ctx),
        unlockedAt: s.unlockedAt,
        isNew: !s.readBy.includes(seat),
        read: s.readBy.includes(seat),
        important: s.importantBy.includes(seat),
        privateTo: s.holder,
        sharedBy: s.sharedBy,
      };
    })
    .sort((a, b) => b.unlockedAt - a.unlockedAt);

  const people: PersonView[] = def.people
    .filter((p) => state.knownPeople.includes(p.id))
    .map((p) => {
      const i = state.interviews[p.id];
      const reason = p.interview ? interviewAvailability(def, state, p.id) : null;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        title: p.title,
        age: p.age,
        bio: p.bio,
        portrait: p.portrait ? ctx.assetUrl(p.portrait) : undefined,
        voice: p.voice && {
          gender: p.voice.gender,
          pitch: p.voice.pitch,
          rate: p.voice.rate,
          mouth: p.voice.mouth,
        },
        video: p.video && {
          idle: ctx.assetUrl(p.video.idle),
          talk: ctx.assetUrl(p.video.talk),
        },
        facts: p.facts.filter((f) => evaluate(f.when, ectx)).map((f) => f.text),
        relations: p.relations
          .filter((r) => state.knownPeople.includes(r.person) && evaluate(r.when, ectx))
          .map((r) => ({ personId: r.person, label: r.label })),
        interview:
          p.interview && i
            ? {
                available: reason === null,
                unavailableReason: reason ?? undefined,
                locked: i.locked,
                sessions: i.sessions,
                inSession: i.inSession,
                questionsLeft: i.inSession
                  ? p.interview.questionsPerSession - i.questionsThisSession
                  : 0,
                mood: mood(i.stress),
                attitude: attitude(i.trust),
                questions: i.inSession
                  ? availableQuestions(def, state, p.id).map((q) => ({
                      id: q.id,
                      text: q.text,
                      topic: q.topic,
                    }))
                  : [],
                transcript: i.transcript.map((t) => {
                  const spoken = p.voice ? speakable(t) : '';
                  const file = spoken && voiceFile(p.id, spoken);
                  return file && ctx.hasAsset?.(file) ? { ...t, audio: ctx.assetUrl(file) } : t;
                }),
              }
            : undefined,
      };
    });

  const decisions: DecisionView[] = def.decisions
    .filter((d) => decisionAvailable(def, state, d))
    .map((d) => {
      const delay = d.outcomes.find((o) => o.delayed)?.delayed?.after ?? 0;
      return {
        id: d.id,
        category: d.category,
        title: d.title,
        description: d.description,
        cost: d.cost,
        key: d.key && state.mode === 'coop',
        delay,
        affordable: decisionAffordable(def, state, d),
        lateWarning: delay > 0 && state.time + d.cost.time + delay > def.budget.time,
      };
    });

  const proactive = ctx.assistantProactive && shouldOfferHelp(def, state, seat, ctx.now);

  return {
    id: ctx.gameId,
    caseId: def.id,
    caseTitle: def.title,
    mode: state.mode,
    seat,
    version: ctx.version,
    phase: state.phase,
    briefing: def.briefing,
    clock: {
      day: Math.floor(state.time / 2) + 1,
      half: (state.time % 2) as 0 | 1,
      label: clockLabel(def.calendar.startDate, state.time),
      unitsUsed: state.time,
    },
    budget: {
      time: def.budget.time - state.time,
      timeMax: def.budget.time,
      lab: state.budget.lab,
      labMax: def.budget.lab,
      police: state.budget.police,
      policeMax: def.budget.police,
      patience: state.budget.patience,
      patienceMax: def.budget.patience,
    },
    people,
    materials,
    decisions,
    taken: Object.entries(state.decisions)
      .sort((a, b) => b[1].at - a[1].at)
      .map(([id, d]) => ({
        id,
        title: idx.decisions.get(id)?.title ?? id,
        outcome: d.outcome,
        at: d.at,
        by: d.by,
      })),
    pending: state.pending.map((p) => ({ label: p.label, readyAt: p.readyAt })),
    journal: state.journal.map((j) => ({ ...j, text: seatNames(j.text, ctx) })).reverse(),
    notes: state.notes
      .filter((n) => n.shared || n.author === seat)
      .map((n) => ({
        id: n.id,
        shared: n.shared,
        author: n.author,
        text: n.text,
        quote: n.quote,
        updatedAt: n.updatedAt,
      })),
    board: state.board,
    timeline: state.timeline,
    assistant: {
      name: def.assistant.name,
      title: def.assistant.title,
      enabled: !state.noHints,
      hintsUsed: state.assistant.hintsUsed,
      messages: state.assistant.messages,
      offerHelp: proactive,
      cooldownUntil: cooldownUntil(def, state),
    },
    accusationOptions: accusationOptions(def, state),
    coop:
      state.mode === 'coop'
        ? {
            players: ctx.players.map((p) => ({ ...p, role: state.roles[p.seat] })),
            proposals: state.proposals.map((p) => ({
              id: p.id,
              by: p.by,
              kind: p.payload.kind,
              summary: proposalSummary(def, p.payload),
              approvals: p.approvals,
              payload: p.payload,
            })),
            inviteCode: ctx.inviteCode,
          }
        : undefined,
    ending: endingView(def, state, ctx),
  };
}

/** Czy gracz może pobrać plik graficzny (należy do widocznego materiału lub znanej osoby). */
export function canAccessAsset(
  def: CaseDef,
  state: GameState,
  seat: number,
  file: string,
): boolean {
  // Nagranie kwestii – tylko gdy ta kwestia już padła w protokole rozmowy
  const speaker = voiceFilePerson(file);
  if (speaker)
    return (state.interviews[speaker]?.transcript ?? []).some((t) => {
      const spoken = speakable(t);
      return !!spoken && voiceFile(speaker, spoken) === file;
    });
  const ref = indexCase(def).assets.get(file);
  if (!ref) return false;
  return (
    ref.materials.some((m) => isMaterialVisible(state, m, seat)) ||
    ref.people.some((p) => state.knownPeople.includes(p))
  );
}
