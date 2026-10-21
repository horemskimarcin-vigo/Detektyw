import type { z } from 'zod';
import { HttpError } from './errors.js';

/** Walidacja wejścia: błąd 400 z listą pól do poprawienia. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    (fields[key] ??= []).push(issue.message);
  }
  throw new HttpError(400, 'validation', 'Popraw zaznaczone pola.', fields);
}
