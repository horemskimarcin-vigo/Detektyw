import { z } from 'zod';
import type { Tone } from '@detektyw/shared';

/* =========================================================================
 * Format sprawy. Pliki YAML w content/cases/<id>/ są scalane i walidowane
 * tym schematem. Cała definicja żyje wyłącznie na serwerze.
 * ========================================================================= */

export interface Range {
  gte?: number;
  lte?: number;
  lt?: number;
}

/** Język warunków (DSL). Ewaluowany tylko na serwerze. */
export type Cond =
  | boolean
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { flag: string }
  | { has: string }
  | { read: string }
  | { hotspot: string }
  | { decision: string }
  | { asked: string }
  | { interviewed: string }
  | { onBoard: string }
  | { locked: string }
  | { known: string }
  | { time: Range }
  | { counter: string; gte?: number; lte?: number }
  | { mode: 'solo' | 'coop' }
  // kontekst przesłuchania
  | { tone: Tone }
  | { stress: Range }
  | { trust: Range }
  | { session: Range }
  // kontekst zakończenia
  | { accusedCorrect: boolean }
  | { accused: string }
  | { strength: Range }
  | { reasoning: Range }
  | { hints: Range }
  | { timeout: boolean }
  | { closedCase: boolean };

const range = z
  .object({ gte: z.number().optional(), lte: z.number().optional(), lt: z.number().optional() })
  .strict();
const id = z.string().regex(/^[a-z0-9_]+$/, 'Identyfikator: małe litery, cyfry, podkreślenia');
const tone = z.enum(['calm', 'press', 'empathetic']);

export const condSchema: z.ZodType<Cond> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.object({ all: z.array(condSchema) }).strict(),
    z.object({ any: z.array(condSchema) }).strict(),
    z.object({ not: condSchema }).strict(),
    z.object({ flag: z.string() }).strict(),
    z.object({ has: id }).strict(),
    z.object({ read: id }).strict(),
    z.object({ hotspot: id }).strict(),
    z.object({ decision: id }).strict(),
    z.object({ asked: id }).strict(),
    z.object({ interviewed: id }).strict(),
    z.object({ onBoard: id }).strict(),
    z.object({ locked: id }).strict(),
    z.object({ known: id }).strict(),
    z.object({ time: range }).strict(),
    z
      .object({ counter: z.string(), gte: z.number().optional(), lte: z.number().optional() })
      .strict(),
    z.object({ mode: z.enum(['solo', 'coop']) }).strict(),
    z.object({ tone }).strict(),
    z.object({ stress: range }).strict(),
    z.object({ trust: range }).strict(),
    z.object({ session: range }).strict(),
    z.object({ accusedCorrect: z.boolean() }).strict(),
    z.object({ accused: id }).strict(),
    z.object({ strength: range }).strict(),
    z.object({ reasoning: range }).strict(),
    z.object({ hints: range }).strict(),
    z.object({ timeout: z.boolean() }).strict(),
    z.object({ closedCase: z.boolean() }).strict(),
  ]),
);

export const effectSchema = z
  .object({
    unlock: z.array(id).optional(),
    lock: z.array(id).optional(),
    set: z.array(z.string()).optional(),
    clear: z.array(z.string()).optional(),
    inc: z.record(z.string(), z.number()).optional(),
    stress: z.record(id, z.number()).optional(),
    trust: z.record(id, z.number()).optional(),
    reveal: z.array(id).optional(),
    budget: z
      .object({
        time: z.number().optional(),
        lab: z.number().optional(),
        police: z.number().optional(),
        patience: z.number().optional(),
      })
      .strict()
      .optional(),
    lockInterview: z.array(id).optional(),
    unlockInterview: z.array(id).optional(),
    lockDecision: z.array(id).optional(),
    journal: z.string().optional(),
  })
  .strict();
export type Effect = z.infer<typeof effectSchema>;

const hotspotSchema = z
  .object({
    id,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    r: z.number().min(0.01).max(0.5),
    /** Drobne szczegóły wymagają przybliżenia. */
    minZoom: z.number().min(1).default(1),
    label: z.string(),
    description: z.string(),
    effects: effectSchema.optional(),
  })
  .strict();
export type HotspotDef = z.infer<typeof hotspotSchema>;

const bodySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('document'),
      format: z.string().default('report'),
      header: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
      text: z.string(),
      signature: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('press'),
      outlet: z.string(),
      headline: z.string(),
      lead: z.string().optional(),
      text: z.string(),
      byline: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('cctv'),
      camera: z.string(),
      location: z.string(),
      frames: z.array(
        z
          .object({
            t: z.string(),
            image: z.string(),
            caption: z.string(),
            hotspots: z.array(hotspotSchema).default([]),
          })
          .strict(),
      ),
      log: z.array(z.object({ t: z.string(), text: z.string() }).strict()).default([]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('photo'),
      image: z.string(),
      caption: z.string(),
      width: z.number(),
      height: z.number(),
      hotspots: z.array(hotspotSchema).default([]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('table'),
      columns: z.array(z.string()),
      rows: z.array(z.array(z.string())),
      note: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('messages'),
      participants: z.array(z.string()),
      messages: z.array(z.object({ from: z.string(), t: z.string(), text: z.string() }).strict()),
    })
    .strict(),
]);

export const materialSchema = z
  .object({
    id,
    type: z.enum([
      'autopsy',
      'report',
      'press',
      'testimony',
      'cctv',
      'photo',
      'phone',
      'bank',
      'messages',
      'inventory',
      'lab',
      'field',
      'other',
    ]),
    title: z.string(),
    date: z.string().optional(),
    source: z.string().optional(),
    summary: z.string().optional(),
    /** Dostępny od początku śledztwa. */
    start: z.boolean().default(false),
    /** Odblokowuje się sam, gdy warunek stanie się prawdziwy. */
    unlockWhen: condSchema.optional(),
    /** Bezpowrotnie blokowany, jeśli warunek spełni się przed odblokowaniem. */
    lockWhen: condSchema.optional(),
    /** Kooperacja: widoczny tylko dla gracza, który go zdobył. */
    private: z.boolean().default(false),
    /** Metadane redakcyjne (tylko walidator). */
    redHerring: z.boolean().default(false),
    onRead: effectSchema.optional(),
    body: bodySchema,
  })
  .strict();
export type MaterialDef = z.infer<typeof materialSchema>;

const responseSchema = z
  .object({
    when: condSchema.optional(),
    text: z.string(),
    effects: effectSchema.optional(),
    /** Odpowiedź kończy bieżącą rozmowę. */
    endSession: z.boolean().default(false),
  })
  .strict();
export type ResponseDef = z.infer<typeof responseSchema>;

const questionSchema = z
  .object({
    id,
    text: z.string(),
    topic: z.string().optional(),
    requires: condSchema.optional(),
    repeatable: z.boolean().default(false),
    responses: z.array(responseSchema).min(1),
  })
  .strict();
export type QuestionDef = z.infer<typeof questionSchema>;

const interviewSchema = z
  .object({
    baseStress: z.number().min(0).max(100).default(20),
    baseTrust: z.number().min(0).max(100).default(40),
    /** Próg stresu, przy którym rozmówca przerywa rozmowę. */
    breakAt: z.number().min(10).max(100).default(90),
    /** Czy zerwanie rozmowy blokuje kolejne przesłuchania na stałe. */
    lockOnBreak: z.boolean().default(false),
    questionsPerSession: z.number().int().min(1).default(5),
    /** Mnożnik reakcji na naciski (osoby odporne < 1). */
    pressSensitivity: z.number().min(0).default(1),
    availableWhen: condSchema.optional(),
    unavailableText: z.string().optional(),
    opening: z.string(),
    breakText: z.string(),
    lockedText: z.string().optional(),
    questions: z.array(questionSchema),
    confrontations: z
      .array(
        z
          .object({
            evidence: id,
            requires: condSchema.optional(),
            responses: z.array(responseSchema).min(1),
          })
          .strict(),
      )
      .default([]),
    confrontDefault: z.string(),
  })
  .strict();
export type InterviewDef = z.infer<typeof interviewSchema>;

export const personSchema = z
  .object({
    id,
    name: z.string(),
    role: z.enum(['victim', 'suspect', 'witness', 'other']),
    title: z.string(),
    age: z.number().int().optional(),
    bio: z.string(),
    portrait: z.string().optional(),
    /** Głos i animacja portretu w przesłuchaniu. */
    voice: z
      .object({
        gender: z.enum(['female', 'male']),
        pitch: z.number().min(0.5).max(2).default(1),
        rate: z.number().min(0.5).max(2).default(1),
        /** Usta na portrecie, w ułamkach boku: środek linii ust (x, y), szerokość ust, odległość linii ust od brody. */
        mouth: z.object({ x: z.number(), y: z.number(), w: z.number(), chin: z.number() }).strict(),
        /** Nagrania kwestii z ElevenLabs (tools/voices.ts); bez nagrań – synteza mowy przeglądarki. */
        elevenlabs: z
          .object({
            voiceId: z.string(),
            stability: z.number().min(0).max(1).default(0.45),
            similarity: z.number().min(0).max(1).default(0.8),
            style: z.number().min(0).max(1).default(0.25),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /** Animacje postaci w przesłuchaniu: pętla w ciszy i pętla mówienia (pliki w assets/). */
    video: z.object({ idle: z.string(), talk: z.string() }).strict().optional(),
    knownWhen: condSchema.optional(),
    facts: z
      .array(z.object({ text: z.string(), when: condSchema.optional() }).strict())
      .default([]),
    relations: z
      .array(z.object({ person: id, label: z.string(), when: condSchema.optional() }).strict())
      .default([]),
    interview: interviewSchema.optional(),
    /** Ukryta „prawda” postaci – dokumentacja dla autora i ewentualnej warstwy LLM w fazie 2. */
    secret: z
      .object({
        truth: z.string(),
        hides: z.string(),
        lieMotive: z.string(),
        credibility: z.number(),
      })
      .partial()
      .optional(),
  })
  .strict();
export type PersonDef = z.infer<typeof personSchema>;

const outcomeSchema = z
  .object({
    when: condSchema.optional(),
    text: z.string(),
    effects: effectSchema.optional(),
    delayed: z
      .object({
        after: z.number().int().min(1),
        text: z.string(),
        effects: effectSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const decisionSchema = z
  .object({
    id,
    category: z.enum(['lab', 'police', 'warrant', 'press', 'arrest', 'witness', 'expert', 'other']),
    title: z.string(),
    description: z.string(),
    cost: z
      .object({
        time: z.number().int().min(0).default(0),
        lab: z.number().int().min(0).default(0),
        police: z.number().int().min(0).default(0),
        patience: z.number().int().min(0).default(0),
      })
      .strict()
      .default({ time: 0, lab: 0, police: 0, patience: 0 }),
    requires: condSchema.optional(),
    /** Kluczowa decyzja – w kooperacji wymaga zgody obu graczy. */
    key: z.boolean().default(false),
    /** Decyzje z tej samej grupy wykluczają się wzajemnie. */
    exclusiveGroup: z.string().optional(),
    /** Metadane redakcyjne: automatyczny śledczy walidatora omija tę decyzję. */
    solverAvoid: z.boolean().default(false),
    outcomes: z.array(outcomeSchema).min(1),
  })
  .strict();
export type DecisionDef = z.infer<typeof decisionSchema>;

export const hintNodeSchema = z
  .object({
    id,
    /** Węzeł kluczowy dla rozwiązania – walidator wymaga pełnej drabinki. */
    key: z.boolean().default(false),
    priority: z.number().default(0),
    /** Materiały, o których mówi podpowiedź – w kooperacji gracz musi je widzieć. */
    refs: z.array(id).default([]),
    activeWhen: condSchema,
    resolvedWhen: condSchema,
    levels: z.tuple([z.string(), z.string(), z.string()]),
  })
  .strict();
export type HintNodeDef = z.infer<typeof hintNodeSchema>;

const endingSchema = z
  .object({
    id,
    title: z.string(),
    tone: z.enum(['positive', 'negative', 'neutral']),
    priority: z.number(),
    when: condSchema,
    epilogue: z.string(),
    addenda: z.array(z.object({ when: condSchema, text: z.string() }).strict()).default([]),
  })
  .strict();
export type EndingDef = z.infer<typeof endingSchema>;

const optionSchema = z.object({ id, text: z.string(), requires: condSchema.optional() }).strict();

export const caseSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    internal: z.boolean().default(false),
    locale: z.string().default('pl'),
    title: z.string(),
    teaser: z.string(),
    estimatedHours: z.string(),
    contentWarning: z.string(),
    calendar: z.object({ startDate: z.string(), unitsPerDay: z.literal(2).default(2) }).strict(),
    budget: z
      .object({
        time: z.number().int().min(1),
        lab: z.number().int().min(0),
        police: z.number().int().min(0),
        patience: z.number().int().min(1),
      })
      .strict(),
    briefing: z.object({ title: z.string(), text: z.string() }).strict(),
    people: z.array(personSchema),
    materials: z.array(materialSchema),
    decisions: z.array(decisionSchema),
    assistant: z
      .object({
        name: z.string(),
        title: z.string(),
        cooldownMinutes: z.number().min(0).default(4),
        actionsToSkipCooldown: z.number().int().min(1).default(6),
        stuckAfterMinutes: z.number().default(15),
        stuckAfterActions: z.number().int().default(30),
        nodes: z.array(hintNodeSchema),
        fallback: z.tuple([z.string(), z.string(), z.string()]),
        refusals: z.array(z.string()).min(1),
        smalltalk: z.array(z.string()).min(1),
        waitLines: z.array(z.string()).min(1),
        disabledText: z.string(),
      })
      .strict(),
    accusation: z
      .object({
        maxEvidence: z.number().int().min(1).default(5),
        motives: z.array(optionSchema),
        means: z.array(optionSchema),
        opportunities: z.array(optionSchema),
      })
      .strict(),
    endings: z.array(endingSchema),
    deadlineText: z.string(),
    /** Rozwiązanie – nigdy nie trafia do klienta. */
    solution: z
      .object({
        culprit: id,
        motive: id,
        means: id,
        opportunity: id,
        keyEvidence: z.array(z.object({ ref: id, weight: z.number().min(0) }).strict()).min(1),
        /**
         * Minimalny zestaw dowodów, bez którego rozwiązania nie da się uzasadnić.
         * Element może być listą alternatyw (wystarczy dowolny z nich).
         */
        requiredEvidence: z.array(z.union([id, z.array(id).min(1)])).min(1),
        contradictions: z
          .array(z.object({ id, description: z.string(), refs: z.array(id) }).strict())
          .default([]),
        turningPoints: z
          .array(z.object({ id, description: z.string(), decisions: z.array(id) }).strict())
          .default([]),
      })
      .strict(),
    /** Scenariusze przejść do walidatora: ciąg akcji prowadzący do danego zakończenia. */
    playthroughs: z
      .array(
        z
          .object({
            name: z.string(),
            expectEnding: id,
            mode: z.enum(['solo', 'coop']).default('solo'),
            actions: z.array(z.record(z.string(), z.unknown())),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export type CaseDef = z.infer<typeof caseSchema>;
export type CaseInput = z.input<typeof caseSchema>;
