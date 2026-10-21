/**
 * Walidator spraw: `npm run validate` (wszystkie) albo `npm run validate -- <katalog>`.
 * Celowo NIE wypisuje treści rozwiązania – tylko błędy, ostrzeżenia i statystyki.
 */
import path from 'node:path';
import { loadAllCases, loadCaseDir, type LoadedCase } from '@detektyw/engine/node';
import { validateCase } from '@detektyw/engine';

const root = path.resolve(import.meta.dirname, '../content/cases');
const arg = process.argv[2];
let cases: LoadedCase[];
try {
  cases = arg ? [loadCaseDir(path.resolve(arg))] : loadAllCases(root);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

let failed = false;
for (const c of cases) {
  const report = validateCase(c.def, {
    assets: c.assets,
    randomRuns: Number(process.env.RANDOM_RUNS ?? 60),
  });
  console.log(`\n=== ${c.def.id} (${c.def.version}) ===`);
  console.log(
    Object.entries(report.stats)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · '),
  );
  console.log(`Osiągnięte zakończenia: ${report.endingsReached.length}/${c.def.endings.length}`);
  for (const w of report.warnings) console.log(`  ⚠ ${w}`);
  for (const e of report.errors) console.log(`  ✗ ${e}`);
  if (report.errors.length) failed = true;
  else console.log('  ✓ sprawa poprawna');
}
process.exit(failed ? 1 : 0);
