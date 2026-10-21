// Najprostsze uruchomienie gry bez Dockera: buduje klienta i serwer, a potem startuje grę pod http://localhost:3000.
// Użycie: `npm run play` (dane zapisują się w .data/, konta testowe: `npm run seed`).
import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const port = process.env.PORT ?? '3000';

if (
  !existsSync(path.join(root, 'apps/client/dist/index.html')) ||
  process.argv.includes('--build')
) {
  console.log('Buduję grę (pierwsze uruchomienie trwa ok. minuty)…');
  const r = spawnSync(npm, ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'production',
  PORT: port,
  APP_URL: process.env.APP_URL ?? `http://localhost:${port}`,
  DATABASE_URL: process.env.DATABASE_URL ?? `pglite:${path.join(root, '.data', 'pglite')}`,
  CLIENT_DIST: path.join(root, 'apps/client/dist'),
  CONTENT_DIR: path.join(root, 'content/cases'),
};
console.log(`\nGra startuje: http://localhost:${port}  (Ctrl+C kończy)\n`);
const child = spawn(process.execPath, [path.join(root, 'apps/server/dist/index.js')], {
  env,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
