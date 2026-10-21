// Pakuje serwer (wraz z pakietami workspace) do jednego pliku dist/index.js.
// Zależności z npm zostają zewnętrzne (moduły natywne, np. argon2).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@detektyw/'));

await build({
  entryPoints: ['src/index.ts', 'src/db/migrate-cli.ts', 'src/seed.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
