import type { TranscriptEntry } from './game.js';

/**
 * Część wpisu protokołu, którą postać mówi na głos: kwestia od pauzy dialogowej („– …”),
 * bez narracji przed nią i bez formatowania. Pytania gracza i opisy bez kwestii – pusty tekst.
 */
export function speakable(e: Pick<TranscriptEntry, 'kind' | 'text'>): string {
  if (e.kind === 'question' || e.kind === 'confront') return '';
  const text = e.text.replace(/\*\*|__|[*_`]/g, '').trim();
  const dash = text.search(/(^|\s)[–—-]\s/);
  if (dash < 0) return e.kind === 'answer' ? text : '';
  return text
    .slice(dash)
    .replace(/^\s*[–—-]\s*/, '')
    .trim();
}

/** Skrót tekstu (cyrb53) – nazwa pliku nagrania nie zdradza treści, a zmiana tekstu daje nowy plik. */
function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Plik nagrania kwestii w katalogu assets sprawy. */
export function voiceFile(personId: string, spoken: string): string {
  return `v-${personId}-${hash(spoken)}.mp3`;
}

const VOICE_FILE = /^v-([\w-]+?)-([0-9a-z]+)\.mp3$/;

/** Osoba, do której należy plik nagrania (albo undefined, gdy to nie nagranie). */
export function voiceFilePerson(file: string): string | undefined {
  return VOICE_FILE.exec(file)?.[1];
}
