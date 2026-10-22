import { speakable, type TranscriptEntry } from '@detektyw/shared';
import type { PersonDef } from './schema.js';

/** Wszystkie kwestie mówione, które postać może wypowiedzieć w przesłuchaniu (bez powtórzeń). */
export function voiceLines(p: PersonDef): string[] {
  const iv = p.interview;
  if (!iv) return [];
  const entries: Pick<TranscriptEntry, 'kind' | 'text'>[] = [
    { kind: 'opening', text: iv.opening },
    { kind: 'system', text: iv.breakText },
    { kind: 'answer', text: iv.confrontDefault },
    ...iv.questions.flatMap((q) =>
      q.responses.map((r) => ({ kind: 'answer' as const, text: r.text })),
    ),
    ...iv.confrontations.flatMap((c) =>
      c.responses.map((r) => ({ kind: 'answer' as const, text: r.text })),
    ),
  ];
  return [...new Set(entries.map(speakable).filter(Boolean))];
}
