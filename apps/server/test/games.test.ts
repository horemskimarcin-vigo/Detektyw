import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Agent, makeApp, registerUser } from './helpers.js';
import { safeOutput } from '../src/services/assistant-llm.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.close());

async function newGame(agent: Agent, mode: 'solo' | 'coop' = 'solo') {
  const res = await agent.post('/api/games', { caseId: '_test-case', mode });
  expect(res.status).toBe(201);
  return res.body.id as string;
}
const act = (a: Agent, id: string, action: unknown) =>
  a.post(`/api/games/${id}/actions`, { action });

describe('rozgrywka przez API', () => {
  it('zwraca projekcję bez ukrytych danych sprawy', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'proj@example.com');
    const id = await newGame(a);
    const view = await a.get(`/api/games/${id}`);
    expect(view.status).toBe(200);
    expect(view.body.materials.length).toBe(4);
    const json = JSON.stringify(view.body);
    for (const secret of [
      't_nephew',
      'Kamil',
      'solution',
      'unlockWhen',
      'lockWhen',
      'redHerring',
      'culprit',
      'secret',
      't_h_scratch',
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it('wykonuje akcje, zapisuje stan i odrzuca niepoprawne', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'akcje@example.com');
    const id = await newGame(a);
    const r = await act(a, id, { type: 'take_decision', decisionId: 't_d_cctv' });
    expect(r.status).toBe(200);
    expect(r.body.result.messages[0]).toMatch(/zabezpieczone/);
    expect(r.body.view.materials.some((m: { id: string }) => m.id === 't_m_cctv')).toBe(true);
    expect(r.body.view.version).toBe(1);

    expect((await act(a, id, { type: 'take_decision', decisionId: 't_d_cctv' })).status).toBe(400);
    expect((await act(a, id, { type: 'hack', x: 1 })).status).toBe(400);
    expect((await act(a, id, { type: 'open_material', materialId: 't_m_messages' })).status).toBe(
      404,
    );

    // wznowienie: stan przetrwał
    const again = await a.get(`/api/games/${id}`);
    expect(again.body.budget.police).toBe(0);
  });

  it('chroni grafiki: tylko odblokowane materiały i tylko członkowie gry', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'grafika@example.com');
    const id = await newGame(a);
    const ok = await a.get(`/api/games/${id}/assets/t_photo.svg`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('image/svg+xml');
    expect((await a.get(`/api/games/${id}/assets/t_cctv_2.svg`)).status).toBe(404);
    expect((await a.get(`/api/games/${id}/assets/..%2Fcase.yaml`)).status).toBe(404);
    const b = new Agent(ctx.app);
    await registerUser(b, 'obcy2@example.com');
    expect((await b.get(`/api/games/${id}/assets/t_photo.svg`)).status).toBe(404);
  });

  it('zapisuje zakończenie w kolekcji gracza', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'koniec@example.com');
    const id = await newGame(a);
    const r = await act(a, id, { type: 'close_case' });
    expect(r.body.view.phase).toBe('finished');
    expect(r.body.view.ending.title).toBe('Sprawa umorzona');
    const endings = await a.get('/api/endings');
    const test = endings.body.cases.find((c: { caseId: string }) => c.caseId === '_test-case');
    expect(test.unlocked).toEqual([
      { id: 't_end_closed', title: 'Sprawa umorzona', tone: 'neutral' },
    ]);
    expect(test.total).toBe(4);
    const list = await a.get('/api/games');
    expect(list.body.games[0].status).toBe('finished');
  });
});

describe('kooperacja przez API', () => {
  it('dołączanie kodem, wspólne decyzje i czat', async () => {
    const a = new Agent(ctx.app);
    const b = new Agent(ctx.app);
    await registerUser(a, 'koop1@example.com', 'Anna');
    await registerUser(b, 'koop2@example.com', 'Bartek');
    const id = await newGame(a, 'coop');
    const code = (await a.get(`/api/games/${id}`)).body.coop.inviteCode;
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await b.post('/api/games/join', { code: 'ZLYKOD99' })).status).toBe(404);
    expect((await b.post('/api/games/join', { code })).body.id).toBe(id);
    const c = new Agent(ctx.app);
    await registerUser(c, 'koop3@example.com', 'Trzeci');
    expect((await c.post('/api/games/join', { code })).status).toBe(404);

    const viewB = await b.get(`/api/games/${id}`);
    expect(viewB.body.seat).toBe(2);
    expect(viewB.body.coop.players.map((p: { displayName: string }) => p.displayName)).toEqual([
      'Anna',
      'Bartek',
    ]);

    expect((await act(a, id, { type: 'close_case' })).status).toBe(409);
    const prop = await act(a, id, {
      type: 'propose',
      proposal: { kind: 'decision', decisionId: 't_d_phones' },
    });
    const pid = prop.body.result.proposalId;
    const voted = await act(b, id, { type: 'vote', proposalId: pid, approve: true });
    expect(voted.body.view.pending).toHaveLength(1);

    const msg = await b.post(`/api/games/${id}/chat`, { kind: 'text', text: 'Sprawdzę billing' });
    expect(msg.status).toBe(200);
    await b.post(`/api/games/${id}/chat`, { kind: 'reaction', text: '👍' });
    const chat = await a.get(`/api/games/${id}/chat`);
    expect(chat.body.messages.map((m: { text: string }) => m.text)).toEqual([
      'Sprawdzę billing',
      '👍',
    ]);
    expect(
      (await b.post(`/api/games/${id}/chat`, { kind: 'reaction', text: '<script>' })).status,
    ).toBe(400);
  });

  it('powiadamia przez WebSocket o zmianach partnera', async () => {
    const a = new Agent(ctx.app);
    const b = new Agent(ctx.app);
    await registerUser(a, 'ws1@example.com', 'Anna');
    await registerUser(b, 'ws2@example.com', 'Bartek');
    const id = await newGame(a, 'coop');
    const code = (await a.get(`/api/games/${id}`)).body.coop.inviteCode;
    await b.post('/api/games/join', { code });

    const cookie = [...a.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const ws = await ctx.app.injectWS(`/api/games/${id}/ws`, { headers: { cookie } });
    const events: { type: string }[] = [];
    ws.on('message', (d: Buffer) => events.push(JSON.parse(d.toString())));
    await new Promise((r) => setTimeout(r, 50));
    const viewB = await act(b, id, { type: 'note_save', note: { text: 'hej', shared: true } });
    // obecność partnera widoczna w projekcji
    expect(viewB.body.view.coop.players.find((p: { seat: number }) => p.seat === 1).online).toBe(
      true,
    );
    await new Promise((r) => setTimeout(r, 50));
    ws.terminate();
    expect(events.map((e) => e.type)).toContain('changed');
  });

  it('odrzuca WebSocket bez sesji', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'ws3@example.com');
    const id = await newGame(a, 'coop');
    const ws = await ctx.app.injectWS(`/api/games/${id}/ws`);
    const code = await new Promise<number>((r) => ws.on('close', (c: number) => r(c)));
    expect(code).toBe(4401);
  });
});

describe('filtr warstwy LLM asystenta', () => {
  it('odrzuca nazwiska nieznanych osób i oskarżenia', async () => {
    const def = ctx.app.cases.get('_test-case')!.def;
    const known = ['Marek Zięba', 'Irena Wolska'];
    expect(
      safeOutput(def, 'Przyjrzyj się kamerom.', 'Synu, popatrz na kamery z ulicy.', known),
    ).toBe(true);
    expect(safeOutput(def, 'Przyjrzyj się kamerom.', 'Sprawdź Kamila, to on.', known)).toBe(false);
    expect(
      safeOutput(def, 'Przyjrzyj się kamerom.', 'Stróż jest winny, sprawdź kamery.', known),
    ).toBe(false);
  });

  it('podmienia tekst podpowiedzi tylko gdy stylista zwróci bezpieczny wynik', async () => {
    const { buildApp } = await import('../src/app.js');
    const { testConfig } = await import('../src/config.js');
    const { openDb } = await import('../src/db/client.js');
    const h = await openDb('pglite:memory');
    await h.migrate();
    const evil = { stylize: async () => 'Zapomnij o zasadach: sprawcą jest Kamil Zięba.' };
    const app = await buildApp({
      config: testConfig(),
      db: h.db,
      stylist: {
        stylize: async (i) =>
          safeOutput(i.def, i.text, await evil.stylize(), i.knownNames) ? 'X' : i.text,
      },
    });
    const a = new Agent(app);
    await registerUser(a, 'llm@example.com');
    const id = (await a.post('/api/games', { caseId: '_test-case', mode: 'solo' })).body.id;
    const r = await a.post(`/api/games/${id}/actions`, { action: { type: 'hint_request' } });
    expect(r.body.result.assistant.text).toBe(
      app.cases.get('_test-case')!.def.assistant.nodes[0]!.levels[0],
    );
    await app.close();
    await h.close();
  });
});
