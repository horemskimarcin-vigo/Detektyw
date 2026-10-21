import { describe, expect, it } from 'vitest';
import { validateCase } from '../src/index.js';
import { def } from './helpers.js';

describe('walidator sprawy', () => {
  it('sprawa testowa jest poprawna i każde zakończenie osiągalne', () => {
    const r = validateCase(def, { randomRuns: 30 });
    expect(r.errors).toEqual([]);
    expect(r.endingsReached.sort()).toEqual(def.endings.map((e) => e.id).sort());
  });

  it('wykrywa odwołania do nieistniejących elementów', () => {
    const bad = structuredClone(def);
    bad.decisions[0]!.outcomes[0]!.effects = { unlock: ['nie_ma'] };
    expect(validateCase(bad, { randomRuns: 0 }).errors.join('\n')).toMatch(
      /nieznany materiał „nie_ma”/,
    );
  });

  it('wykrywa martwy punkt (brak drogi do wymaganego dowodu)', () => {
    const bad = structuredClone(def);
    bad.decisions = bad.decisions.filter((d) => d.id !== 't_d_phones');
    bad.materials.find((m) => m.id === 't_m_phones')!.unlockWhen = { flag: 'nigdy' };
    const errors = validateCase(bad, { randomRuns: 5 }).errors.join('\n');
    expect(errors).toMatch(/martwy punkt|Martwe punkty|Żadna strategia/i);
  });

  it('wykrywa niepełną drabinkę podpowiedzi', () => {
    const bad = structuredClone(def);
    bad.assistant.nodes[0]!.levels = ['Poziom pierwszy wskazówki', 'Poziom pierwszy wskazówki', ''];
    const errors = validateCase(bad, { randomRuns: 0 }).errors.join('\n');
    expect(errors).toMatch(/niepełna drabinka/);
  });
});

describe('sprawa główna', () => {
  it('przechodzi walidator (zakończenia, martwe punkty, drabinki, wycieki)', async () => {
    const path = await import('node:path');
    const { loadCaseDir } = await import('../src/node/index.js');
    const loaded = loadCaseDir(
      path.resolve(import.meta.dirname, '../../../content/cases/zawierzbie'),
    );
    const r = validateCase(loaded.def, { assets: loaded.assets, randomRuns: 25 });
    expect(r.errors).toEqual([]);
    expect(r.endingsReached.length).toBe(loaded.def.endings.length);
  }, 120_000);
});
