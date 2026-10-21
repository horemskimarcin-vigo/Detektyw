/**
 * Szybka ścieżka „przejdź sprawę”: uruchamia scenariusze z playthroughs.yaml oraz automatycznego śledczego
 * i wypisuje wynik (bez treści rozwiązania). Użycie: `npm run playthrough -- [id_sprawy]`.
 */
import path from 'node:path';
import { loadAllCases } from '@detektyw/engine/node';
import {
  newSolverState,
  runPlaythrough,
  runSolver,
  solutionDerivable,
  type PlaythroughAction,
} from '@detektyw/engine';

const only = process.argv[2];
for (const { def } of loadAllCases(path.resolve(import.meta.dirname, '../content/cases'))) {
  if (only && def.id !== only) continue;
  console.log(`\n=== ${def.title} (${def.id}) ===`);
  for (const p of def.playthroughs) {
    const t0 = performance.now();
    const end = runPlaythrough(def, p.actions as PlaythroughAction[], p.mode);
    const ok = end.ending?.id === p.expectEnding;
    console.log(
      `${ok ? '✓' : '✗'} ${p.name.padEnd(45)} → ${end.ending?.id ?? 'brak'} (${Math.round(performance.now() - t0)} ms)`,
    );
  }
  const { state, steps } = runSolver(def, newSolverState(def));
  const d = solutionDerivable(def, state);
  console.log(
    `Automatyczny śledczy: ${steps.length} akcji, ${state.time / 2} dni, materiały ${Object.keys(state.materials).length}/${def.materials.length}, ` +
      `szczegóły ${Object.keys(state.hotspots).length}, rozwiązanie do uzasadnienia: ${d.ok ? 'tak' : 'nie'}`,
  );
}
