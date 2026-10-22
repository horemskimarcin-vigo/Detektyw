/**
 * Nagrania kwestii postaci przez ElevenLabs: `npm run voices`.
 *
 *   npm run voices                          wszystkie postacie z `voice.elevenlabs` we wszystkich sprawach
 *   npm run voices -- --person p_agnieszka  tylko jedna postać
 *   npm run voices -- --dry                 tylko policz (bez wysyłania, bez kosztów)
 *   npm run voices -- --person p_agnieszka --voice <ID>   głos z ElevenLabs podany ręcznie (do prób)
 *   npm run voices -- --prune               usuń nagrania kwestii, których już nie ma w sprawie
 *
 * Klucz: ELEVENLABS_API_KEY w pliku .env (nigdy w repozytorium). Pliki trafiają do assets/ sprawy
 * jako v-<osoba>-<skrót>.mp3; istniejące nagrania są pomijane, więc skrypt można przerwać i wznowić.
 * Celowo NIE wypisuje treści kwestii – można go uruchomić bez spoilerów.
 */
import { existsSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { voiceFile, voiceFilePerson } from '@detektyw/shared';
import { loadAllCases } from '@detektyw/engine/node';
import { voiceLines, type PersonDef } from '@detektyw/engine';

const root = path.resolve(import.meta.dirname, '..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyPerson = option('person');
const voiceOverride = option('voice');
const dry = flag('dry');
const prune = flag('prune');
const MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';
const KEY = process.env.ELEVENLABS_API_KEY;

async function synthesize(p: PersonDef, text: string): Promise<Buffer> {
  const el = p.voice!.elevenlabs!;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(el.voiceId)}?output_format=mp3_44100_128`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: {
          stability: el.stability,
          similarity_boost: el.similarity,
          style: el.style,
          use_speaker_boost: true,
        },
      }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const detail = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (res.status === 401)
      throw new Error('ElevenLabs odrzucił klucz API (401). Sprawdź ELEVENLABS_API_KEY w .env.');
    throw new Error(`ElevenLabs: błąd ${res.status}. ${detail}`);
  }
}

if (voiceOverride && !onlyPerson) {
  console.error('Opcja --voice wymaga --person <id postaci>.');
  process.exit(1);
}
const cases = loadAllCases(path.join(root, 'content/cases'));
const jobs: { person: PersonDef; text: string; file: string; dir: string }[] = [];
let voiced = 0;
for (const c of cases) {
  for (const p of c.def.people) {
    if (onlyPerson && p.id !== onlyPerson) continue;
    if (voiceOverride && p.voice)
      p.voice.elevenlabs = {
        stability: 0.45,
        similarity: 0.8,
        style: 0.25,
        ...p.voice.elevenlabs,
        voiceId: voiceOverride,
      };
    if (!p.voice?.elevenlabs) {
      if (onlyPerson)
        console.error(
          `${p.id}: brak „voice.elevenlabs.voiceId” w danych sprawy – najpierw wybierz głos w ElevenLabs.`,
        );
      continue;
    }
    voiced++;
    const wanted = voiceLines(p).map((text) => ({ text, file: voiceFile(p.id, text) }));
    const have = new Set(c.assets);
    const missing = wanted.filter((w) => !have.has(w.file));
    const chars = missing.reduce((n, w) => n + w.text.length, 0);
    console.log(
      `${c.def.id} / ${p.name}: kwestii ${wanted.length}, do nagrania ${missing.length} (${chars} znaków)`,
    );
    for (const w of missing) jobs.push({ person: p, ...w, dir: c.assetsDir });
    if (prune) {
      const keep = new Set(wanted.map((w) => w.file));
      const stale = c.assets.filter((f) => voiceFilePerson(f) === p.id && !keep.has(f));
      for (const f of stale) unlinkSync(path.join(c.assetsDir, f));
      if (stale.length) console.log(`  usunięto nieaktualnych nagrań: ${stale.length}`);
    }
  }
}

if (!voiced) {
  console.log('Żadna postać nie ma ustawionego głosu ElevenLabs (voice.elevenlabs.voiceId).');
  process.exit(onlyPerson ? 1 : 0);
}
if (dry || !jobs.length) {
  console.log(jobs.length ? 'Tryb próbny – nic nie wysłano.' : 'Wszystkie nagrania są aktualne.');
  process.exit(0);
}
if (!KEY) {
  console.error(
    'Brak ELEVENLABS_API_KEY. Dodaj do pliku .env w katalogu gry linię:\n  ELEVENLABS_API_KEY=twój-klucz\n' +
      '(klucz: elevenlabs.io → Developers → API Keys). Pliku .env nie wysyłaj na GitHuba.',
  );
  process.exit(1);
}

let done = 0;
let failed = 0;
const queue = [...jobs];
async function worker() {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try {
      writeFileSync(path.join(job.dir, job.file), await synthesize(job.person, job.text));
      done++;
      process.stdout.write(`\r  nagrano ${done}/${jobs.length}`);
    } catch (e) {
      failed++;
      console.error(`\n${job.person.id}: ${(e as Error).message}`);
      if (/401/.test((e as Error).message)) process.exit(1);
    }
  }
}
await Promise.all([worker(), worker()]);
console.log(
  `\nGotowe: ${done} nagrań${failed ? `, błędów: ${failed} (uruchom ponownie, aby dokończyć)` : ''}.`,
);
console.log(
  `Pliki w assets/ sprawy (${readdirSync(jobs[0]!.dir).filter((f) => f.startsWith('v-')).length} nagrań łącznie).`,
);
process.exit(failed ? 1 : 0);
