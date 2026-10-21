import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Agent, makeApp, PASSWORD, registerUser } from './helpers.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.close());

describe('konta graczy', () => {
  it('rejestruje, loguje i wylogowuje', async () => {
    const a = new Agent(ctx.app);
    const user = await registerUser(a, 'jan@example.com', 'Jan');
    expect(user).toMatchObject({ email: 'jan@example.com', displayName: 'Jan' });
    expect(user).not.toHaveProperty('passwordHash');

    expect((await a.get('/api/auth/me')).body.user.email).toBe('jan@example.com');
    expect((await a.post('/api/auth/logout')).status).toBe(204);
    expect((await a.get('/api/auth/me')).body.user).toBeNull();

    const login = await a.post('/api/auth/login', {
      email: 'JAN@example.com ',
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
    expect((await a.get('/api/auth/me')).body.user.displayName).toBe('Jan');
  });

  it('ustawia ciasteczko sesji httpOnly i SameSite', async () => {
    const a = new Agent(ctx.app);
    await a.get('/api/auth/me');
    const res = await a.post('/api/auth/register', {
      email: 'cookie@example.com',
      password: PASSWORD,
      displayName: 'Ciastko',
      acceptAdultContent: true,
    });
    const cookies = [res.headers['set-cookie']].flat().join('\n');
    expect(cookies).toMatch(/dt_session=[^;]+;.*HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Lax/i);
  });

  it('wymaga akceptacji ostrzeżenia o treściach i waliduje dane', async () => {
    const a = new Agent(ctx.app);
    const res = await a.post('/api/auth/register', {
      email: 'zly-email',
      password: 'krotkie',
      displayName: 'X',
      acceptAdultContent: false,
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields)).toEqual(
      expect.arrayContaining(['email', 'password', 'displayName', 'acceptAdultContent']),
    );
  });

  it('odrzuca duplikat adresu e-mail', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'dup@example.com');
    const res = await new Agent(ctx.app).post('/api/auth/register', {
      email: 'dup@example.com',
      password: PASSWORD,
      displayName: 'Inny',
      acceptAdultContent: true,
    });
    expect(res.status).toBe(409);
  });

  it('odrzuca żądania modyfikujące bez tokenu CSRF', async () => {
    const a = new Agent(ctx.app);
    const res = await a.post(
      '/api/auth/login',
      { email: 'jan@example.com', password: PASSWORD },
      { csrf: false },
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('csrf');
  });

  it('blokuje logowanie po serii błędnych haseł', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'lock@example.com');
    const b = new Agent(ctx.app);
    for (let i = 0; i < 8; i++) {
      const r = await b.post('/api/auth/login', {
        email: 'lock@example.com',
        password: 'zle-haslo-xx',
      });
      expect(r.status).toBe(401);
    }
    const blocked = await b.post('/api/auth/login', {
      email: 'lock@example.com',
      password: PASSWORD,
    });
    expect(blocked.status).toBe(429);
  });

  it('nie zdradza, czy konto istnieje', async () => {
    const a = new Agent(ctx.app);
    const r1 = await a.post('/api/auth/login', {
      email: 'brak@example.com',
      password: 'cokolwiek',
    });
    const r2 = await a.post('/api/auth/password-reset/request', { email: 'brak@example.com' });
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(204);
  });

  it('resetuje hasło jednorazowym linkiem i wylogowuje inne urządzenia', async () => {
    const phone = new Agent(ctx.app);
    await registerUser(phone, 'reset@example.com', 'Reset');
    const outbox = ctx.app.mailer.outbox!;
    const before = outbox.length;
    expect(
      (
        await new Agent(ctx.app).post('/api/auth/password-reset/request', {
          email: 'reset@example.com',
        })
      ).status,
    ).toBe(204);
    expect(outbox.length).toBe(before + 1);
    const token = outbox.at(-1)!.text.match(/reset-hasla\/([\w-]+)/)![1]!;

    const laptop = new Agent(ctx.app);
    const ok = await laptop.post('/api/auth/password-reset/confirm', {
      token,
      password: 'nowe-haslo-456',
    });
    expect(ok.status).toBe(204);
    const again = await laptop.post('/api/auth/password-reset/confirm', {
      token,
      password: 'jeszcze-inne-789',
    });
    expect(again.status).toBe(400);

    expect((await phone.get('/api/auth/me')).body.user).toBeNull();
    expect(
      (
        await laptop.post('/api/auth/login', {
          email: 'reset@example.com',
          password: 'nowe-haslo-456',
        })
      ).status,
    ).toBe(200);
  });
});

describe('konto i RODO', () => {
  it('zmienia profil i ustawienia', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'profil@example.com', 'Profil');
    const res = await a.patch('/api/account', {
      displayName: 'Komisarz',
      settings: { theme: 'light' },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Komisarz');
    expect(res.body.user.settings).toMatchObject({ theme: 'light', assistantProactive: true });
  });

  it('eksportuje dane i usuwa konto po podaniu hasła', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'usun@example.com', 'Usun');
    await a.post('/api/games', { caseId: '_test-case', mode: 'solo' });
    const exp = await a.get('/api/account/export');
    expect(exp.status).toBe(200);
    expect(exp.body.profile.email).toBe('usun@example.com');
    expect(exp.body.games).toHaveLength(1);

    expect((await a.delete('/api/account', { password: 'zle' })).status).toBe(400);
    expect((await a.delete('/api/account', { password: PASSWORD })).status).toBe(204);
    expect((await a.get('/api/auth/me')).body.user).toBeNull();
    const relogin = await a.post('/api/auth/login', {
      email: 'usun@example.com',
      password: PASSWORD,
    });
    expect(relogin.status).toBe(401);
  });
});

describe('zapis gier', () => {
  it('tworzy grę, listuje ją i chroni przed dostępem obcych graczy', async () => {
    const a = new Agent(ctx.app);
    await registerUser(a, 'gracz@example.com', 'Gracz');
    const created = await a.post('/api/games', { caseId: '_test-case', mode: 'solo' });
    expect(created.status).toBe(201);
    const list = await a.get('/api/games');
    expect(list.body.games).toHaveLength(1);
    expect(list.body.games[0]).toMatchObject({
      caseId: '_test-case',
      status: 'active',
      mode: 'solo',
    });

    const b = new Agent(ctx.app);
    await registerUser(b, 'obcy@example.com', 'Obcy');
    expect((await b.get(`/api/games/${created.body.id}`)).status).toBe(404);
    expect((await a.get(`/api/games/${created.body.id}`)).status).toBe(200);
  });

  it('wymaga logowania', async () => {
    const res = await new Agent(ctx.app).get('/api/games');
    expect(res.status).toBe(401);
  });
});
