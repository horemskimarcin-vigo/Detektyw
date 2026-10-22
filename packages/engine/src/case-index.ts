import type {
  CaseDef,
  DecisionDef,
  HotspotDef,
  MaterialDef,
  PersonDef,
  QuestionDef,
} from './schema.js';

export interface HotspotRef {
  materialId: string;
  frame?: number;
  def: HotspotDef;
}

/** Indeksy przyspieszające wyszukiwanie w definicji sprawy (budowane raz na definicję). */
export interface CaseIndex {
  materials: Map<string, MaterialDef>;
  people: Map<string, PersonDef>;
  decisions: Map<string, DecisionDef>;
  hotspots: Map<string, HotspotRef>;
  questions: Map<string, { personId: string; def: QuestionDef }>;
  /** Plik grafiki lub animacji → materiały/osoby, które go używają (nagrania kwestii – osobno). */
  assets: Map<string, { materials: string[]; people: string[] }>;
}

const cache = new WeakMap<CaseDef, CaseIndex>();

export function indexCase(def: CaseDef): CaseIndex {
  const cached = cache.get(def);
  if (cached) return cached;
  const idx: CaseIndex = {
    materials: new Map(def.materials.map((m) => [m.id, m])),
    people: new Map(def.people.map((p) => [p.id, p])),
    decisions: new Map(def.decisions.map((d) => [d.id, d])),
    hotspots: new Map(),
    questions: new Map(),
    assets: new Map(),
  };
  const asset = (file: string) => {
    let a = idx.assets.get(file);
    if (!a) idx.assets.set(file, (a = { materials: [], people: [] }));
    return a;
  };
  for (const m of def.materials) {
    if (m.body.kind === 'photo') {
      asset(m.body.image).materials.push(m.id);
      for (const h of m.body.hotspots) idx.hotspots.set(h.id, { materialId: m.id, def: h });
    }
    if (m.body.kind === 'cctv') {
      m.body.frames.forEach((f, frame) => {
        asset(f.image).materials.push(m.id);
        for (const h of f.hotspots) idx.hotspots.set(h.id, { materialId: m.id, frame, def: h });
      });
    }
  }
  for (const p of def.people) {
    if (p.portrait) asset(p.portrait).people.push(p.id);
    if (p.video) for (const f of [p.video.idle, p.video.talk]) asset(f).people.push(p.id);
    for (const q of p.interview?.questions ?? [])
      idx.questions.set(q.id, { personId: p.id, def: q });
  }
  cache.set(def, idx);
  return idx;
}
