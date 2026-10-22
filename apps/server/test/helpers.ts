import { buildApp } from '../src/app.js';
import { testConfig } from '../src/config.js';
import { openDb } from '../src/db/client.js';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/plugins/security.js';

export async function makeApp() {
  const handle = await openDb('pglite:memory');
  await handle.migrate();
  const app = await buildApp({ config: testConfig(), db: handle.db });
  await app.ready();
  return {
    app,
    async close() {
      await app.close();
      await handle.close();
    },
  };
}

type App = Awaited<ReturnType<typeof makeApp>>['app'];

/** Klient HTTP z „przeglądarkowym” słoikiem ciasteczek i nagłówkiem CSRF. */
export class Agent {
  cookies = new Map<string, string>();
  constructor(private app: App) {}

  private store(setCookie: string | string[] | undefined) {
    for (const raw of [setCookie ?? []].flat()) {
      const [pair, ...attrs] = raw.split(';');
      const [name, ...v] = pair!.split('=');
      const value = v.join('=');
      const expired = attrs.some((a) => /expires=Thu, 01 Jan 1970/i.test(a)) || value === '';
      if (expired) this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), value);
    }
  }

  async request(
    method: string,
    url: string,
    body?: unknown,
    opts: { csrf?: boolean; headers?: Record<string, string> } = {},
  ) {
    if (!this.cookies.has(CSRF_COOKIE) && method !== 'GET')
      await this.request('GET', '/api/auth/me');
    const headers: Record<string, string> = {
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      ...opts.headers,
    };
    if (opts.csrf !== false && this.cookies.has(CSRF_COOKIE))
      headers[CSRF_HEADER] = this.cookies.get(CSRF_COOKIE)!;
    const res = await this.app.inject({
      method: method as 'GET',
      url,
      payload: body as object,
      headers,
    });
    this.store(res.headers['set-cookie']);
    return {
      status: res.statusCode,
      body: res.body ? safeJson(res.body) : undefined,
      headers: res.headers,
    };
  }
  get(url: string, headers?: Record<string, string>) {
    return this.request('GET', url, undefined, { headers });
  }
  post(url: string, body?: unknown, opts?: { csrf?: boolean }) {
    return this.request('POST', url, body ?? {}, opts);
  }
  patch(url: string, body?: unknown) {
    return this.request('PATCH', url, body ?? {});
  }
  delete(url: string, body?: unknown) {
    return this.request('DELETE', url, body ?? {});
  }
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export const PASSWORD = 'tajne-haslo-123';

export async function registerUser(agent: Agent, email = 'anna@example.com', displayName = 'Anna') {
  const res = await agent.post('/api/auth/register', {
    email,
    password: PASSWORD,
    displayName,
    acceptAdultContent: true,
  });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return res.body.user;
}
