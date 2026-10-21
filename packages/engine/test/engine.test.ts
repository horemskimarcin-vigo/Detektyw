import { describe, expect, it } from 'vitest';
import { project, EngineError } from '../src/index.js';
import { act, def, newGame, projCtx, run } from './helpers.js';

describe('start i materiały', () => {
  it('udostępnia materiały startowe i znane osoby', () => {
    const s = newGame();
    expect(Object.keys(s.materials).sort()).toEqual([
      't_m_photo',
      't_m_press',
      't_m_report',
      't_m_testimony_guard',
    ]);
    expect(s.knownPeople).not.toContain('t_nephew');
    expect(s.knownPeople).toContain('t_guard');
  });

  it('oznacza przeczytane i ważne materiały per gracz', () => {
    let s = newGame();
    s = run(s, [
      { type: 'open_material', materialId: 't_m_report' },
      { type: 'mark_material', materialId: 't_m_report', important: true },
    ]);
    const v = project(def, s, 1, projCtx);
    const m = v.materials.find((x) => x.id === 't_m_report')!;
    expect(m).toMatchObject({ read: true, isNew: false, important: true });
  });

  it('nie pozwala otworzyć nieodblokowanego materiału', () => {
    expect(() => act(newGame(), { type: 'open_material', materialId: 't_m_cctv' })).toThrow(
      EngineError,
    );
  });
});

describe('zdjęcia i szczegóły', () => {
  it('znajduje szczegół tylko w pobliżu i przy odpowiednim przybliżeniu', () => {
    let s = newGame();
    const miss = act(s, { type: 'inspect', materialId: 't_m_photo', x: 0.1, y: 0.1, zoom: 1 });
    expect(miss.result.found).toBeUndefined();
    const lowZoom = act(s, { type: 'inspect', materialId: 't_m_photo', x: 0.5, y: 0.45, zoom: 1 });
    expect(lowZoom.result.found).toBeUndefined();
    const hit = act(s, { type: 'inspect', materialId: 't_m_photo', x: 0.51, y: 0.45, zoom: 2 });
    expect(hit.result.found?.id).toBe('t_h_scratch');
    s = hit.state;
    expect(s.flags.lock_scratch).toBe(true);
  });

  it('nie wysyła położenia nieodkrytych szczegółów do klienta', () => {
    const v = project(def, newGame(), 1, projCtx);
    const photo = v.materials.find((m) => m.id === 't_m_photo')!;
    expect(photo.body.kind === 'photo' && photo.body.hotspots).toEqual([]);
  });
});

describe('decyzje i budżet', () => {
  it('pobiera koszty, dostarcza wyniki z opóźnieniem', () => {
    let s = act(newGame(), { type: 'take_decision', decisionId: 't_d_phones' }).state;
    expect(s.budget.lab).toBe(0);
    expect(s.materials.t_m_phones).toBeUndefined();
    expect(s.pending).toHaveLength(1);
    s = run(s, [{ type: 'wait' }, { type: 'wait' }]);
    expect(s.materials.t_m_phones).toBeDefined();
    expect(s.knownPeople).toContain('t_nephew');
  });

  it('odmawia decyzji bez środków', () => {
    const s = act(newGame(), { type: 'take_decision', decisionId: 't_d_cctv' }).state;
    expect(() => act(s, { type: 'take_decision', decisionId: 't_d_cctv' })).toThrow(
      /nie jest dostępna/,
    );
  });

  it('warunkowy wynik decyzji: odmowa prokuratora obniża cierpliwość', () => {
    let s = act(newGame(), { type: 'take_decision', decisionId: 't_d_cctv' }).state;
    s = act(s, {
      type: 'inspect',
      materialId: 't_m_cctv',
      frame: 1,
      x: 0.6,
      y: 0.6,
      zoom: 1,
    }).state;
    s = act(s, { type: 'take_decision', decisionId: 't_d_search' }).state;
    expect(s.decisions.t_d_search!.outcome).toMatch(/odmawia/);
    expect(s.budget.patience).toBe(0);
    expect(s.materials.t_m_bike).toBeUndefined();
  });

  it('przeciek do prasy bezpowrotnie blokuje materiał', () => {
    let s = act(newGame(), { type: 'take_decision', decisionId: 't_d_press' }).state;
    expect(s.lockedMaterials).toContain('t_m_messages');
    s.flags.nephew_shaken = true;
    s = act(s, { type: 'wait' }).state;
    expect(s.materials.t_m_messages).toBeUndefined();
  });

  it('po upływie czasu przechodzi w fazę terminu i blokuje akcje śledcze', () => {
    let s = newGame();
    s = act(s, { type: 'take_decision', decisionId: 't_d_phones' }).state;
    for (let i = 0; i < 8; i++) s = act(s, { type: 'wait' }).state;
    expect(s.phase).toBe('deadline');
    expect(() => act(s, { type: 'start_interview', personId: 't_guard' })).toThrow(
      /Czas śledztwa minął/,
    );
    expect(() => act(s, { type: 'wait' })).toThrow();
  });
});

describe('przesłuchania', () => {
  it('rozmowa kosztuje czas i ma limit pytań', () => {
    let s = act(newGame(), { type: 'start_interview', personId: 't_curator' }).state;
    expect(s.time).toBe(1);
    s = act(s, {
      type: 'ask',
      personId: 't_curator',
      questionId: 't_q_curator_fight',
      tone: 'calm',
    }).state;
    expect(() =>
      act(s, { type: 'ask', personId: 't_curator', questionId: 't_q_curator_fight', tone: 'calm' }),
    ).toThrow();
  });

  it('odpowiedź zależy od zaufania i tonu', () => {
    let s = act(newGame(), { type: 'start_interview', personId: 't_baker' }).state;
    const cold = act(s, {
      type: 'ask',
      personId: 't_baker',
      questionId: 't_q_baker_saw',
      tone: 'press',
    });
    expect(cold.result.messages[0]).toMatch(/Nie pamiętam/);
    const warm = act(s, {
      type: 'ask',
      personId: 't_baker',
      questionId: 't_q_baker_saw',
      tone: 'empathetic',
    });
    expect(warm.state.flags.baker_saw_bike).toBe(true);
  });

  it('zbyt agresywne przesłuchanie zrywa rozmowę i blokuje świadka', () => {
    let s = newGame();
    s.interviews.t_guard!.stress = 85;
    s = act(s, { type: 'start_interview', personId: 't_guard' }).state;
    s = act(s, {
      type: 'ask',
      personId: 't_guard',
      questionId: 't_q_guard_round',
      tone: 'press',
    }).state;
    expect(s.interviews.t_guard!.locked).toBe(true);
    const v = project(def, s, 1, projCtx);
    expect(v.people.find((p) => p.id === 't_guard')!.interview!.available).toBe(false);
  });

  it('konfrontacja z dowodem: reakcja specyficzna lub domyślna', () => {
    let s = act(newGame(), {
      type: 'inspect',
      materialId: 't_m_photo',
      x: 0.72,
      y: 0.78,
      zoom: 1,
    }).state;
    s = act(s, { type: 'start_interview', personId: 't_guard' }).state;
    const r1 = act(s, { type: 'confront', personId: 't_guard', evidence: 't_h_ash', tone: 'calm' });
    expect(r1.result.messages[0]).toMatch(/Palę na zewnątrz/);
    const r2 = act(r1.state, {
      type: 'confront',
      personId: 't_guard',
      evidence: 't_m_report',
      tone: 'calm',
    });
    expect(r2.result.messages[0]).toMatch(/Nie wiem/);
    expect(() =>
      act(s, { type: 'confront', personId: 't_guard', evidence: 't_m_cctv', tone: 'calm' }),
    ).toThrow();
  });
});

describe('oskarżenie i zakończenia', () => {
  const accusation = {
    suspectId: 't_curator',
    evidence: ['t_m_press'],
    motiveId: 't_mo_revenge',
    meansId: 't_me_force',
    opportunityId: 't_op_day',
  };

  it('błędne oskarżenie kończy grę negatywnie bez ujawniania sprawcy', () => {
    const s = act(newGame(), { type: 'accuse', accusation }).state;
    expect(s.phase).toBe('finished');
    const v = project(def, s, 1, projCtx);
    expect(v.ending!.tone).toBe('negative');
    expect(JSON.stringify(v.ending)).not.toMatch(/Kamil/);
  });

  it('nie przyjmuje dowodów spoza teczki ani nieodkrytych opcji', () => {
    expect(() =>
      act(newGame(), { type: 'accuse', accusation: { ...accusation, evidence: ['t_m_messages'] } }),
    ).toThrow();
    expect(() =>
      act(newGame(), { type: 'accuse', accusation: { ...accusation, suspectId: 't_nephew' } }),
    ).toThrow();
  });

  it('zamknięta gra nie przyjmuje akcji', () => {
    const s = act(newGame(), { type: 'close_case' }).state;
    expect(s.ending!.id).toBe('t_end_closed');
    expect(() => act(s, { type: 'wait' })).toThrow(/zamknięta/);
  });
});

describe('kooperacja', () => {
  it('materiał prywatny widzi tylko zdobywca, dopóki go nie przekaże', () => {
    let s = newGame('coop');
    s = act(
      s,
      { type: 'propose', proposal: { kind: 'decision', decisionId: 't_d_phones' } },
      1,
    ).state;
    s = act(s, { type: 'vote', proposalId: s.proposals[0]!.id, approve: true }, 2).state;
    s = run(s, [{ type: 'wait' }, { type: 'wait' }], 2);
    // wyniki dostarczone po czasie trafiają do gracza, który zlecił badanie
    expect(s.materials.t_m_phones!.holder).toBe(1);
    expect(project(def, s, 2, projCtx).materials.some((m) => m.id === 't_m_phones')).toBe(false);
    expect(() => act(s, { type: 'share_material', materialId: 't_m_phones' }, 2)).toThrow();
    s = act(s, { type: 'share_material', materialId: 't_m_phones' }, 1).state;
    expect(project(def, s, 2, projCtx).materials.some((m) => m.id === 't_m_phones')).toBe(true);
  });

  it('decyzje kluczowe i oskarżenie wymagają zgody obu graczy', () => {
    let s = newGame('coop');
    expect(() => act(s, { type: 'take_decision', decisionId: 't_d_phones' })).toThrow(/zgody/);
    expect(() => act(s, { type: 'close_case' })).toThrow(/zgody/);
    // decyzja niekluczowa – bez głosowania
    s = act(s, { type: 'take_decision', decisionId: 't_d_cctv' }, 2).state;
    s = act(s, { type: 'propose', proposal: { kind: 'close_case' } }, 1).state;
    const rejected = act(
      s,
      { type: 'vote', proposalId: s.proposals[0]!.id, approve: false },
      2,
    ).state;
    expect(rejected.phase).toBe('investigation');
    expect(rejected.proposals).toHaveLength(0);
    const agreed = act(s, { type: 'vote', proposalId: s.proposals[0]!.id, approve: true }, 2).state;
    expect(agreed.phase).toBe('finished');
  });

  it('wspólne i prywatne notatki', () => {
    let s = newGame('coop');
    s = act(s, { type: 'note_save', note: { text: 'wspólna', shared: true } }, 1).state;
    s = act(s, { type: 'note_save', note: { text: 'moja', shared: false } }, 1).state;
    expect(project(def, s, 2, projCtx).notes.map((n) => n.text)).toEqual(['wspólna']);
    expect(project(def, s, 1, projCtx).notes).toHaveLength(2);
  });
});

describe('tablica i oś czasu', () => {
  it('przyjmuje tylko znane elementy i łączy węzły', () => {
    let s = newGame();
    expect(() =>
      act(s, {
        type: 'board_add',
        node: { kind: 'material', ref: 't_m_cctv', label: 'x', x: 0, y: 0 },
      }),
    ).toThrow();
    s = run(s, [
      { type: 'board_add', node: { kind: 'person', ref: 't_guard', label: 'Stróż', x: 10, y: 10 } },
      {
        type: 'board_add',
        node: { kind: 'material', ref: 't_m_report', label: 'Notatka', x: 200, y: 10 },
      },
    ]);
    const [a, b] = s.board.nodes;
    s = act(s, { type: 'board_link', from: a!.id, to: b!.id, label: 'kłamie?' }).state;
    expect(s.board.edges).toHaveLength(1);
    s = act(s, { type: 'board_remove', nodeId: a!.id }).state;
    expect(s.board.edges).toHaveLength(0);
  });

  it('oś czasu układana przez gracza', () => {
    let s = run(newGame(), [
      {
        type: 'timeline_save',
        entry: { time: '01:00', label: 'obchód', refs: ['t_m_testimony_guard', 't_m_cctv'] },
      },
      { type: 'timeline_save', entry: { time: '01:20', label: 'alarm wyłączony', refs: [] } },
    ]);
    expect(s.timeline[0]!.refs).toEqual(['t_m_testimony_guard']);
    s = act(s, { type: 'timeline_move', entryId: s.timeline[1]!.id, direction: -1 }).state;
    expect(s.timeline[0]!.label).toBe('alarm wyłączony');
  });
});
