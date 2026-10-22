import type { GameAction } from '@detektyw/shared';
import { indexCase } from './case-index.js';
import { condRefs } from './conditions.js';
import { applyAction, EngineError, startGame } from './engine.js';
import { normalize } from './hints.js';
import type { CaseDef, Cond, Effect } from './schema.js';
import { randomAction, rng, runSolver, solutionDerivable } from './solver.js';
import { createInitialState, type GameState } from './state.js';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  stats: Record<string, number | string>;
  endingsReached: string[];
}

export interface ValidateOptions {
  /** Pliki graficzne dostępne w katalogu sprawy (sprawdzenie odwołań). */
  assets?: string[];
  randomRuns?: number;
  seed?: number;
}

/** Rdzenie imienia i nazwiska (odporne na odmianę: „Kowalski” → „kowals”). */
export function nameStems(name: string): string[] {
  return normalize(name)
    .split(/[\s-]+/)
    .filter((p) => p.length >= 4)
    .map((p) => p.slice(0, Math.max(4, p.length - 2)));
}

export function mentionsName(text: string, stems: string[]): boolean {
  const t = normalize(text);
  return stems.some((s) => new RegExp(`(^|[^a-z])${s}`).test(t));
}

export function newSolverState(def: CaseDef, mode: 'solo' | 'coop' = 'solo'): GameState {
  return startGame(
    def,
    createInitialState(def, {
      mode,
      seats: mode === 'coop' ? [1, 2] : [1],
      noHints: false,
      now: 0,
    }),
  );
}

export function validateCase(def: CaseDef, opts: ValidateOptions = {}): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const idx = indexCase(def);

  /* ---- unikalność identyfikatorów ---- */
  const seen = new Map<string, string>();
  const claim = (id: string, what: string) => {
    if (seen.has(id))
      errors.push(`Zduplikowany identyfikator „${id}” (${seen.get(id)} i ${what}).`);
    else seen.set(id, what);
  };
  def.materials.forEach((m) => claim(m.id, 'materiał'));
  def.people.forEach((p) => claim(p.id, 'osoba'));
  def.decisions.forEach((d) => claim(d.id, 'decyzja'));
  idx.hotspots.forEach((_, id) => claim(id, 'szczegół'));
  def.people.forEach((p) =>
    p.interview?.questions.forEach((q) => claim(q.id, `pytanie (${p.id})`)),
  );
  def.assistant.nodes.forEach((n) => claim(n.id, 'węzeł podpowiedzi'));
  def.endings.forEach((e) => claim(e.id, 'zakończenie'));
  for (const list of [def.accusation.motives, def.accusation.means, def.accusation.opportunities]) {
    list.forEach((o) => claim(o.id, 'opcja oskarżenia'));
  }

  /* ---- odwołania ---- */
  const exists = {
    material: (id: string) => idx.materials.has(id),
    person: (id: string) => idx.people.has(id),
    decision: (id: string) => idx.decisions.has(id),
    hotspot: (id: string) => idx.hotspots.has(id),
    question: (id: string) => idx.questions.has(id),
  };
  const checkCond = (c: Cond | undefined, where: string) => {
    for (const r of condRefs(c)) {
      const ok =
        r.kind === 'flag'
          ? true
          : r.kind === 'has' || r.kind === 'read' || r.kind === 'locked'
            ? exists.material(r.id)
            : r.kind === 'hotspot'
              ? exists.hotspot(r.id)
              : r.kind === 'decision'
                ? exists.decision(r.id)
                : r.kind === 'asked'
                  ? exists.question(r.id)
                  : r.kind === 'interviewed' || r.kind === 'known' || r.kind === 'accused'
                    ? exists.person(r.id)
                    : r.kind === 'onBoard'
                      ? exists.material(r.id) || exists.person(r.id) || exists.hotspot(r.id)
                      : true;
      if (!ok)
        errors.push(`${where}: warunek odwołuje się do nieistniejącego „${r.id}” (${r.kind}).`);
    }
  };
  const flagsSet = new Set<string>();
  const unlockTargets = new Set<string>();
  const checkEffect = (e: Effect | undefined, where: string) => {
    if (!e) return;
    for (const m of [...(e.unlock ?? []), ...(e.lock ?? [])]) {
      if (!exists.material(m)) errors.push(`${where}: nieznany materiał „${m}”.`);
    }
    (e.unlock ?? []).forEach((m) => unlockTargets.add(m));
    (e.set ?? []).forEach((f) => flagsSet.add(f));
    for (const p of [
      ...Object.keys(e.stress ?? {}),
      ...Object.keys(e.trust ?? {}),
      ...(e.reveal ?? []),
      ...(e.lockInterview ?? []),
      ...(e.unlockInterview ?? []),
    ]) {
      if (!exists.person(p)) errors.push(`${where}: nieznana osoba „${p}”.`);
    }
    for (const d of e.lockDecision ?? [])
      if (!exists.decision(d)) errors.push(`${where}: nieznana decyzja „${d}”.`);
  };

  for (const m of def.materials) {
    checkCond(m.unlockWhen, `materiał ${m.id}`);
    checkCond(m.lockWhen, `materiał ${m.id}`);
    checkEffect(m.onRead, `materiał ${m.id}`);
    const hs =
      m.body.kind === 'photo'
        ? m.body.hotspots
        : m.body.kind === 'cctv'
          ? m.body.frames.flatMap((f) => f.hotspots)
          : [];
    hs.forEach((h) => checkEffect(h.effects, `szczegół ${h.id}`));
    const images =
      m.body.kind === 'photo'
        ? [m.body.image]
        : m.body.kind === 'cctv'
          ? m.body.frames.map((f) => f.image)
          : [];
    for (const img of images) {
      if (opts.assets && !opts.assets.includes(img))
        errors.push(`materiał ${m.id}: brak pliku grafiki „${img}”.`);
    }
  }
  for (const p of def.people) {
    checkCond(p.knownWhen, `osoba ${p.id}`);
    p.facts.forEach((f) => checkCond(f.when, `fakt (${p.id})`));
    p.relations.forEach((r) => {
      if (!exists.person(r.person))
        errors.push(`osoba ${p.id}: relacja z nieznaną osobą „${r.person}”.`);
      checkCond(r.when, `relacja (${p.id})`);
    });
    if (p.portrait && opts.assets && !opts.assets.includes(p.portrait)) {
      errors.push(`osoba ${p.id}: brak pliku portretu „${p.portrait}”.`);
    }
    if (p.voice && !p.portrait) errors.push(`osoba ${p.id}: głos wymaga portretu (animacja ust).`);
    const iv = p.interview;
    if (!iv) continue;
    checkCond(iv.availableWhen, `przesłuchanie ${p.id}`);
    for (const q of iv.questions) {
      checkCond(q.requires, `pytanie ${q.id}`);
      q.responses.forEach((r) => {
        checkCond(r.when, `odpowiedź (${q.id})`);
        checkEffect(r.effects, `odpowiedź (${q.id})`);
      });
      if (q.responses.at(-1)!.when !== undefined) {
        warnings.push(
          `pytanie ${q.id}: ostatnia odpowiedź ma warunek – brak odpowiedzi domyślnej.`,
        );
      }
    }
    for (const c of iv.confrontations) {
      if (!exists.material(c.evidence) && !exists.hotspot(c.evidence)) {
        errors.push(`konfrontacja (${p.id}): nieznany dowód „${c.evidence}”.`);
      }
      checkCond(c.requires, `konfrontacja (${p.id})`);
      c.responses.forEach((r) => {
        checkCond(r.when, `konfrontacja (${p.id}/${c.evidence})`);
        checkEffect(r.effects, `konfrontacja (${p.id}/${c.evidence})`);
      });
    }
  }
  for (const d of def.decisions) {
    checkCond(d.requires, `decyzja ${d.id}`);
    for (const o of d.outcomes) {
      checkCond(o.when, `decyzja ${d.id}`);
      checkEffect(o.effects, `decyzja ${d.id}`);
      checkEffect(o.delayed?.effects, `decyzja ${d.id} (wynik odroczony)`);
    }
  }
  for (const n of def.assistant.nodes) {
    checkCond(n.activeWhen, `podpowiedź ${n.id}`);
    checkCond(n.resolvedWhen, `podpowiedź ${n.id}`);
    n.refs.forEach(
      (r) => !exists.material(r) && errors.push(`podpowiedź ${n.id}: nieznany materiał „${r}”.`),
    );
  }
  for (const e of def.endings) {
    checkCond(e.when, `zakończenie ${e.id}`);
    e.addenda.forEach((a) => checkCond(a.when, `zakończenie ${e.id}`));
  }
  for (const list of [def.accusation.motives, def.accusation.means, def.accusation.opportunities]) {
    list.forEach((o) => checkCond(o.requires, `opcja ${o.id}`));
  }
  const sol = def.solution;
  if (!exists.person(sol.culprit)) errors.push(`rozwiązanie: nieznany sprawca „${sol.culprit}”.`);
  if (!def.accusation.motives.some((o) => o.id === sol.motive))
    errors.push('rozwiązanie: nieznany motyw.');
  if (!def.accusation.means.some((o) => o.id === sol.means))
    errors.push('rozwiązanie: nieznany sposób.');
  if (!def.accusation.opportunities.some((o) => o.id === sol.opportunity))
    errors.push('rozwiązanie: nieznane okoliczności.');
  for (const r of [
    ...sol.keyEvidence.map((k) => k.ref),
    ...sol.requiredEvidence.flat(),
    ...sol.contradictions.flatMap((c) => c.refs),
  ]) {
    if (!exists.material(r) && !exists.hotspot(r))
      errors.push(`rozwiązanie: nieznany dowód „${r}”.`);
  }
  sol.turningPoints.forEach((t) =>
    t.decisions.forEach(
      (d) => !exists.decision(d) && errors.push(`punkt zwrotny ${t.id}: nieznana decyzja „${d}”.`),
    ),
  );

  for (const m of def.materials) {
    if (!m.start && m.unlockWhen === undefined && !unlockTargets.has(m.id)) {
      errors.push(
        `materiał ${m.id}: nie ma sposobu odblokowania (start, unlockWhen ani efekt unlock).`,
      );
    }
  }

  /* ---- liczności (pomijane w sprawach testowych) ---- */
  const suspects = def.people.filter((p) => p.role === 'suspect').length;
  const witnesses = def.people.filter((p) => p.role === 'witness').length;
  const redHerrings = def.materials.filter((m) => m.redHerring).length;
  const stats = {
    osoby: def.people.length,
    podejrzani: suspects,
    świadkowie: witnesses,
    materiały: def.materials.length,
    'czerwone śledzie': redHerrings,
    szczegóły: idx.hotspots.size,
    pytania: idx.questions.size,
    decyzje: def.decisions.length,
    'węzły podpowiedzi': def.assistant.nodes.length,
    zakończenia: def.endings.length,
    sprzeczności: sol.contradictions.length,
    'punkty zwrotne': sol.turningPoints.length,
  };
  if (!def.internal) {
    const need = (ok: boolean, msg: string) => !ok && errors.push(msg);
    need(suspects >= 5 && suspects <= 7, `Wymagane 5–7 podejrzanych (jest ${suspects}).`);
    need(witnesses >= 3 && witnesses <= 4, `Wymagane 3–4 świadków (jest ${witnesses}).`);
    need(
      def.people.some((p) => p.role === 'victim'),
      'Brak ofiary.',
    );
    need(
      def.materials.length >= 30 && def.materials.length <= 45,
      `Wymagane 30–45 materiałów (jest ${def.materials.length}).`,
    );
    need(
      redHerrings >= 6 && redHerrings <= 10,
      `Wymagane 6–10 czerwonych śledzi (jest ${redHerrings}).`,
    );
    need(sol.contradictions.length >= 3, 'Wymagane co najmniej 3 sprzeczności.');
    need(
      sol.turningPoints.length >= 2 && sol.turningPoints.length <= 3,
      'Wymagane 2–3 punkty zwrotne.',
    );
    need(def.endings.length >= 8, `Wymagane co najmniej 8 zakończeń (jest ${def.endings.length}).`);
    const types = new Set(def.materials.map((m) => m.type));
    for (const t of ['autopsy', 'press', 'testimony', 'cctv', 'photo'] as const) {
      need(types.has(t), `Brak materiału typu ${t}.`);
    }
  }

  /* ---- asystent: pełne drabinki i brak wycieku ---- */
  const keyNodes = def.assistant.nodes.filter((n) => n.key);
  if (keyNodes.length === 0) errors.push('Asystent: brak kluczowych węzłów śledztwa.');
  for (const n of def.assistant.nodes) {
    if (n.levels.some((l) => l.trim().length < 10))
      errors.push(`podpowiedź ${n.id}: niepełna drabinka (puste poziomy).`);
    if (new Set(n.levels).size !== 3)
      errors.push(`podpowiedź ${n.id}: poziomy podpowiedzi muszą się różnić.`);
  }
  const culprit = idx.people.get(sol.culprit);
  if (culprit) {
    const stems = nameStems(culprit.name);
    const assistantTexts: [string, string][] = [
      ...def.assistant.nodes.flatMap((n) =>
        n.levels.map((l, i) => [`podpowiedź ${n.id}/${i + 1}`, l] as [string, string]),
      ),
      ...def.assistant.fallback.map(
        (l, i) => [`podpowiedź ogólna/${i + 1}`, l] as [string, string],
      ),
      ...def.assistant.refusals.map((l) => ['odmowa asystenta', l] as [string, string]),
      ...def.assistant.smalltalk.map((l) => ['rozmowa asystenta', l] as [string, string]),
      ...def.assistant.waitLines.map((l) => ['asystent (cooldown)', l] as [string, string]),
      ['asystent (wyłączony)', def.assistant.disabledText],
      ...def.endings.flatMap((e) => [
        [`zakończenie ${e.id}`, `${e.title} ${e.epilogue}`] as [string, string],
        ...e.addenda.map((a) => [`zakończenie ${e.id} (dopisek)`, a.text] as [string, string]),
      ]),
      ['termin', def.deadlineText],
    ];
    for (const [where, text] of assistantTexts) {
      if (mentionsName(text, stems))
        errors.push(`${where}: tekst zawiera nazwisko sprawcy (wyciek rozwiązania).`);
    }
  }

  /* ---- symulacje ---- */
  const endingsReached = new Set<string>();
  const everUnlocked = new Set<string>();
  const everFound = new Set<string>();
  const collect = (s: GameState) => {
    Object.keys(s.materials).forEach((m) => everUnlocked.add(m));
    Object.keys(s.hotspots).forEach((h) => everFound.add(h));
    if (s.ending) endingsReached.add(s.ending.id);
  };

  if (errors.length === 0) {
    // 1. Śledczy od startu musi móc uzasadnić rozwiązanie.
    let anyStrategy = false;
    for (const tone of ['adaptive', 'calm', 'empathetic', 'press'] as const) {
      const { state } = runSolver(def, newSolverState(def), { tone });
      collect(state);
      const d = solutionDerivable(def, state);
      if (d.ok) anyStrategy = true;
      else if (tone === 'adaptive') {
        warnings.push(
          `Śledczy (adaptive) nie zebrał: ${[...d.missing, ...d.missingOptions].join(', ')}.`,
        );
      }
      // Pełne oskarżenie z kompletem dowodów.
      if (d.ok) {
        const a = {
          suspectId: sol.culprit,
          evidence: sol.keyEvidence
            .map((k) => k.ref)
            .filter((r) => r in state.materials || r in state.hotspots)
            .slice(0, def.accusation.maxEvidence),
          motiveId: sol.motive,
          meansId: sol.means,
          opportunityId: sol.opportunity,
        };
        try {
          const end = applyAction(
            def,
            state,
            { type: 'accuse', accusation: a },
            { seat: 1, now: 0 },
          ).state;
          collect(end);
          const e = def.endings.find((x) => x.id === end.ending?.id);
          if (e?.tone !== 'positive')
            warnings.push(
              `Pełne, poprawne oskarżenie (${tone}) daje zakończenie „${e?.id}”, a nie pozytywne.`,
            );
        } catch (err) {
          errors.push(
            `Oskarżenie po przejściu śledczego nie powiodło się: ${(err as Error).message}`,
          );
        }
      }
    }
    if (!anyStrategy)
      errors.push(
        'Żadna strategia śledczego nie pozwala uzasadnić rozwiązania (martwy punkt od startu).',
      );

    // 2. Losowe, rozsądne ścieżki + dokończenie przez śledczego: brak martwych punktów.
    const runs = opts.randomRuns ?? 60;
    const rand = rng(opts.seed ?? 1234);
    let deadEnds = 0;
    const examples: string[] = [];
    for (let run = 0; run < runs; run++) {
      let s = newSolverState(def);
      const limit = Math.floor(def.budget.time * 0.4);
      const trail: string[] = [];
      for (let step = 0; step < 400 && s.time < limit && s.phase === 'investigation'; step++) {
        const a = randomAction(def, s, rand, 1);
        if (!a) break;
        try {
          s = applyAction(def, s, a, { seat: 1, now: 0 }).state;
          if (a.type === 'take_decision' || a.type === 'start_interview')
            trail.push(a.type === 'take_decision' ? a.decisionId : `rozmowa:${a.personId}`);
        } catch (err) {
          if (!(err instanceof EngineError)) throw err;
        }
      }
      collect(s);
      const ok = (['adaptive', 'calm', 'empathetic', 'press'] as const).some((tone) => {
        const { state } = runSolver(def, s, { tone });
        collect(state);
        return solutionDerivable(def, state).ok;
      });
      if (!ok) {
        deadEnds++;
        if (examples.length < 3) examples.push(trail.join(' → '));
      }
    }
    if (deadEnds > 0) {
      errors.push(
        `Martwe punkty w ${deadEnds}/${runs} losowych ścieżkach, np.: ${examples.join(' | ')}`,
      );
    }

    // 3. Scenariusze przejść: każde zakończenie musi być osiągalne.
    for (const p of def.playthroughs) {
      try {
        const end = runPlaythrough(def, p.actions as PlaythroughAction[], p.mode);
        collect(end);
        if (end.ending?.id !== p.expectEnding) {
          errors.push(
            `Scenariusz „${p.name}”: oczekiwano zakończenia ${p.expectEnding}, jest ${end.ending?.id ?? 'brak'}.`,
          );
        }
      } catch (err) {
        errors.push(`Scenariusz „${p.name}”: ${(err as Error).message}`);
      }
    }
    for (const e of def.endings) {
      if (!endingsReached.has(e.id))
        errors.push(
          `Zakończenie ${e.id} nie zostało osiągnięte w żadnej symulacji ani scenariuszu.`,
        );
    }
    for (const m of def.materials) {
      if (!everUnlocked.has(m.id))
        warnings.push(`Materiał ${m.id} nie został odblokowany w żadnej symulacji.`);
    }
    for (const h of idx.hotspots.keys()) {
      if (!everFound.has(h))
        warnings.push(`Szczegół ${h} nie został odnaleziony w żadnej symulacji.`);
    }
  }

  return { errors, warnings, stats, endingsReached: [...endingsReached] };
}

/* ---------- scenariusze ---------- */

export type PlaythroughAction =
  | (GameAction & { seat?: number })
  | {
      type: 'solve';
      seat?: number;
      tone?: 'adaptive' | 'calm' | 'empathetic' | 'press';
      decisions?: boolean;
    }
  | { type: 'find'; hotspot: string; seat?: number }
  | { type: 'wait_until'; time: number; seat?: number };

export function runPlaythrough(
  def: CaseDef,
  actions: PlaythroughAction[],
  mode: 'solo' | 'coop' = 'solo',
): GameState {
  const idx = indexCase(def);
  let s = newSolverState(def, mode);
  for (const raw of actions) {
    const seat = raw.seat ?? 1;
    if (raw.type === 'solve') {
      s = runSolver(def, s, { seat, tone: raw.tone, decisions: raw.decisions }).state;
      continue;
    }
    if (raw.type === 'wait_until') {
      while (s.time < raw.time && s.phase === 'investigation')
        s = applyAction(def, s, { type: 'wait' }, { seat, now: 0 }).state;
      continue;
    }
    let action: GameAction;
    if (raw.type === 'find') {
      const ref = idx.hotspots.get(raw.hotspot);
      if (!ref) throw new Error(`nieznany szczegół ${raw.hotspot}`);
      action = {
        type: 'inspect',
        materialId: ref.materialId,
        frame: ref.frame,
        x: ref.def.x,
        y: ref.def.y,
        zoom: ref.def.minZoom,
      };
    } else {
      const { seat: _seat, ...rest } = raw as GameAction & { seat?: number };
      void _seat;
      action = rest as GameAction;
      // „PROPOSAL” w scenariuszu oznacza ostatnią złożoną propozycję.
      if (action.type === 'vote' && action.proposalId === 'PROPOSAL') {
        action = { ...action, proposalId: s.proposals.at(-1)?.id ?? 'brak' };
      }
    }
    try {
      s = applyAction(def, s, action, { seat, now: 0 }).state;
    } catch (err) {
      throw new Error(`akcja ${JSON.stringify(raw)}: ${(err as Error).message}`);
    }
  }
  return s;
}
