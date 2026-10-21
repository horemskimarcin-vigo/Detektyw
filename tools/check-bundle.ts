/**
 * Sprawdza, że zbudowany klient (apps/client/dist) nie zawiera treści spraw:
 * nazwiska sprawcy, tytułów materiałów i zakończeń, tekstów podpowiedzi ani rozwiązania.
 * Uruchom po `npm run build`: `npm run check:bundle`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadAllCases } from '@detektyw/engine/node';

const dist = path.resolve(import.meta.dirname, '../apps/client/dist');
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|json|webmanifest|map)$/.test(f)) files.push(p);
  }
};
walk(dist);
const bundle = files.map((f) => readFileSync(f, 'utf8')).join('\n');

let leaks = 0;
for (const { def } of loadAllCases(path.resolve(import.meta.dirname, '../content/cases'))) {
  const culprit = def.people.find((p) => p.id === def.solution.culprit)!;
  const secrets = [
    culprit.name,
    ...def.materials.map((m) => m.title),
    ...def.endings.map((e) => e.title),
    ...def.assistant.nodes.flatMap((n) => n.levels),
    ...def.accusation.motives.map((o) => o.text),
    def.briefing.text.slice(0, 60),
  ].filter((s) => s.length >= 8);
  for (const s of secrets) {
    if (bundle.includes(s)) {
      console.error(`✗ [${def.id}] w paczce klienta znaleziono: „${s.slice(0, 60)}”`);
      leaks++;
    }
  }
  console.log(`[${def.id}] sprawdzono ${secrets.length} fraz w ${files.length} plikach`);
}
if (leaks) process.exit(1);
console.log('✓ paczka klienta nie zawiera treści spraw');
