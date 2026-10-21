import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { caseSchema, type CaseDef } from '../schema.js';

export interface LoadedCase {
  def: CaseDef;
  dir: string;
  assetsDir: string;
  assets: string[];
}

function yamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'assets') out.push(...yamlFiles(full));
    } else if (/\.ya?ml$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Scala obiekty: tablice są łączone, obiekty scalane rekurencyjnie, wartości proste nadpisywane. */
function merge(target: Record<string, unknown>, source: Record<string, unknown>, file: string) {
  for (const [k, v] of Object.entries(source)) {
    const cur = target[k];
    if (Array.isArray(cur) && Array.isArray(v)) target[k] = [...cur, ...v];
    else if (
      cur &&
      typeof cur === 'object' &&
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !Array.isArray(cur)
    ) {
      merge(cur as Record<string, unknown>, v as Record<string, unknown>, file);
    } else if (cur !== undefined) {
      throw new Error(`${file}: klucz „${k}” zdefiniowany wielokrotnie`);
    } else target[k] = v;
  }
}

export class CaseLoadError extends Error {}

/** Wczytuje sprawę z katalogu YAML i waliduje schemat. Pliki *.md (np. biblia) są pomijane. */
export function loadCaseDir(dir: string): LoadedCase {
  const raw: Record<string, unknown> = {};
  for (const file of yamlFiles(dir)) {
    const data = parseYaml(readFileSync(file, 'utf8'));
    if (data && typeof data === 'object')
      merge(raw, data as Record<string, unknown>, path.relative(dir, file));
  }
  const parsed = caseSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .slice(0, 30)
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new CaseLoadError(`Sprawa ${path.basename(dir)} ma błędy schematu:\n${msg}`);
  }
  const assetsDir = path.join(dir, 'assets');
  const assets = existsSync(assetsDir)
    ? readdirSync(assetsDir).filter((f) => !f.startsWith('.'))
    : [];
  return { def: parsed.data, dir, assetsDir, assets };
}

export function loadAllCases(root: string): LoadedCase[] {
  return readdirSync(root)
    .filter((name) => existsSync(path.join(root, name, 'case.yaml')))
    .map((name) => loadCaseDir(path.join(root, name)));
}
