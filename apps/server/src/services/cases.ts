import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaseSummary } from '@detektyw/shared';
import type { CaseDef } from '@detektyw/engine';
import { loadAllCases } from '@detektyw/engine/node';

export interface CaseEntry {
  summary: CaseSummary;
  version: string;
  /** Sprawy testowe nie są pokazywane graczom w produkcji. */
  internal: boolean;
  def: CaseDef;
  assetsDir: string;
  assets: Set<string>;
}

export interface CaseRegistry {
  list(includeInternal: boolean): CaseSummary[];
  get(id: string): CaseEntry | undefined;
}

export function defaultContentDir(): string {
  if (process.env.CONTENT_DIR) return process.env.CONTENT_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../../content/cases'), // src/services (dev)
    path.resolve(here, '../../../content/cases'), // apps/server/dist
    path.resolve(here, '../content/cases'), // obraz Docker: /app/dist
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error('Nie znaleziono katalogu content/cases (ustaw CONTENT_DIR)');
  return found;
}

/** Rejestr spraw: definicje wczytane i zwalidowane schematem przy starcie serwera. */
export function loadCaseRegistry(dir = defaultContentDir()): CaseRegistry {
  const entries = new Map<string, CaseEntry>();
  for (const c of loadAllCases(dir)) {
    entries.set(c.def.id, {
      def: c.def,
      version: c.def.version,
      internal: c.def.internal,
      assetsDir: c.assetsDir,
      assets: new Set(c.assets),
      summary: {
        id: c.def.id,
        title: c.def.title,
        teaser: c.def.teaser,
        estimatedHours: c.def.estimatedHours,
        contentWarning: c.def.contentWarning,
      },
    });
  }
  return {
    list: (includeInternal) =>
      [...entries.values()].filter((e) => includeInternal || !e.internal).map((e) => e.summary),
    get: (id) => entries.get(id),
  };
}
