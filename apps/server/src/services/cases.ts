import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { CaseSummary } from '@detektyw/shared';

export interface CaseEntry {
  summary: CaseSummary;
  version: string;
  /** Sprawy testowe nie są pokazywane graczom w produkcji. */
  internal: boolean;
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

/** Rejestr spraw: na tym etapie tylko metadane z case.yaml (silnik w kamieniu 3). */
export function loadCaseRegistry(dir = defaultContentDir()): CaseRegistry {
  const entries = new Map<string, CaseEntry>();
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name, 'case.yaml');
    if (!existsSync(file)) continue;
    const meta = parseYaml(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const id = String(meta.id);
    entries.set(id, {
      version: String(meta.version),
      internal: meta.internal === true,
      summary: {
        id,
        title: String(meta.title),
        teaser: String(meta.teaser ?? ''),
        estimatedHours: String(meta.estimatedHours ?? ''),
        contentWarning: String(meta.contentWarning ?? ''),
      },
    });
  }
  return {
    list: (includeInternal) =>
      [...entries.values()].filter((e) => includeInternal || !e.internal).map((e) => e.summary),
    get: (id) => entries.get(id),
  };
}
