import { useCallback, useEffect, useRef, useState } from 'react';
import type { PersonVoice } from '@detektyw/shared';

/**
 * Głos postaci w przesłuchaniu. Kolejność: nagranie kwestii (pliki z ElevenLabs) → synteza mowy
 * przeglądarki (polskie głosy systemu) → same napisy według szacowanego tempa mowy.
 * Napisy podświetlają się słowo po słowie: przy nagraniu według postępu odtwarzania,
 * przy syntezie według zdarzeń „boundary”, a bez dźwięku według zegara.
 */

const STORAGE_KEY = 'detektyw.voice';
const FEMALE = /zofia|zosia|paulina|agnieszka|ewa|maja|female|kobiet/i;
const MALE = /marek|krzysztof|adam|jacek|(?<!fe)male|mężczyzn/i;

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

async function polishVoices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return [];
  let voices = s.getVoices();
  if (!voices.length) {
    // Chrome wczytuje listę głosów asynchronicznie
    voices = await new Promise((resolve) => {
      const done = () => resolve(s.getVoices());
      s.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1200);
    });
  }
  return voices.filter((v) => v.lang.toLowerCase().startsWith('pl'));
}

/** Głos dopasowany do płci postaci; gdy system ma tylko głos drugiej płci – zmiana wysokości tonu. */
async function pickVoice(voice: PersonVoice) {
  const all = await polishVoices();
  if (!all.length) return null;
  const want = voice.gender === 'female' ? FEMALE : MALE;
  const other = voice.gender === 'female' ? MALE : FEMALE;
  const exact = all.filter(
    (v) => want.test(v.name) && !(voice.gender === 'male' && FEMALE.test(v.name)),
  );
  // głosy „Natural/Online” (Edge) brzmią najlepiej
  const best = (list: SpeechSynthesisVoice[]) =>
    list.find((v) => /natural|online|neural/i.test(v.name)) ?? list[0];
  if (exact.length) return { v: best(exact)!, pitch: voice.pitch };
  const neutral = all.filter((v) => !other.test(v.name));
  const v = best(neutral.length ? neutral : all)!;
  const fallbackPitch = voice.gender === 'male' ? 0.75 : 1.2;
  return { v, pitch: voice.pitch * (other.test(v.name) ? fallbackPitch : 1) };
}

export function useVoiceSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const set = useCallback((v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? 'on' : 'off');
    } catch {
      /* brak dostępu do pamięci przeglądarki – ustawienie tylko na tę sesję */
    }
  }, []);
  return [on, set];
}

/**
 * Odblokowuje dźwięk na iOS/Safari: pierwsze odtworzenie musi nastąpić w geście użytkownika.
 * Wołane przy stuknięciu w przesłuchanie (zanim przyjdzie odpowiedź z serwera).
 */
let primed = false;
const unlockAudio = typeof Audio !== 'undefined' ? new Audio() : null;
export function primeSpeech() {
  if (primed) return;
  primed = true;
  const s = synth();
  if (s) {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    s.speak(u);
  }
  if (unlockAudio) {
    // krótka cisza w formacie WAV
    unlockAudio.src =
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    void unlockAudio.play().catch(() => undefined);
  }
}

export interface SpeechPart {
  text: string;
  /** Nagranie tej kwestii, jeśli jest. */
  audio?: string;
}

export interface SpeechState {
  text: string;
  /** Indeks słowa wypowiadanego teraz (−1 przed startem, liczba słów po końcu). */
  word: number;
  talking: boolean;
  /** false – brak nagrania i polskiego głosu albo dźwięk wyłączony: napisy bez dźwięku. */
  audible: boolean;
}

const IDLE: SpeechState = { text: '', word: -1, talking: false, audible: true };

export function wordStarts(text: string): number[] {
  const starts: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) starts.push(m.index);
  return starts;
}

export function useSpeech() {
  const [state, setState] = useState<SpeechState>(IDLE);
  const run = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cleanup = useRef<(() => void)[]>([]);

  const halt = useCallback(() => {
    run.current++;
    cleanup.current.forEach((f) => f());
    cleanup.current = [];
    synth()?.cancel();
    audio.current?.pause();
  }, []);

  const stop = useCallback(() => {
    halt();
    setState((s) => ({ ...s, talking: false, word: s.text ? wordStarts(s.text).length : -1 }));
  }, [halt]);

  useEffect(() => halt, [halt]);

  const speak = useCallback(
    async (parts: SpeechPart[], voice: PersonVoice, sound: boolean) => {
      halt();
      const id = run.current;
      const alive = () => id === run.current;
      parts = parts.filter((p) => p.text);
      if (!parts.length) return setState(IDLE);

      // Pełny tekst napisów i położenie każdej części w nim
      let text = '';
      const placed = parts.map((p) => {
        const from = text ? text.length + 1 : 0;
        text = text ? `${text} ${p.text}` : p.text;
        return { ...p, from };
      });
      const starts = wordStarts(text);
      const at = (char: number) => {
        let w = 0;
        while (w + 1 < starts.length && starts[w + 1]! <= char) w++;
        return w;
      };
      const show = (char: number) => alive() && setState((s) => ({ ...s, word: at(char) }));
      setState({ text, word: 0, talking: true, audible: true });

      const tts = sound && parts.some((p) => !p.audio) ? await pickVoice(voice) : null;
      if (!alive()) return;

      /** Napisy według zegara (~13 znaków na sekundę); kończy się po przejściu całej części. */
      const simulate = (from: number, length: number) =>
        new Promise<void>((resolve) => {
          const cps = 13 * voice.rate;
          const t0 = performance.now();
          const timer = window.setInterval(() => {
            const char = ((performance.now() - t0) / 1000) * cps;
            if (!alive() || char >= length) {
              window.clearInterval(timer);
              return resolve();
            }
            show(from + char);
          }, 90);
          cleanup.current.push(() => {
            window.clearInterval(timer);
            resolve();
          });
        });

      const playAudio = (src: string, from: number, length: number) =>
        new Promise<boolean>((resolve) => {
          const el = audio.current ?? (audio.current = unlockAudio ?? new Audio());
          let frame = 0;
          const tick = () => {
            if (!alive()) return;
            if (el.duration > 0) show(from + (el.currentTime / el.duration) * length);
            frame = requestAnimationFrame(tick);
          };
          const finish = (ok: boolean) => {
            cancelAnimationFrame(frame);
            el.onended = el.onerror = null;
            resolve(ok);
          };
          el.onended = () => finish(true);
          el.onerror = () => finish(false);
          cleanup.current.push(() => finish(true));
          el.src = src;
          el.play().then(
            () => (frame = requestAnimationFrame(tick)),
            () => finish(false), // np. przeglądarka zablokowała dźwięk
          );
        });

      const sayTts = (part: { text: string; from: number }, picked: NonNullable<typeof tts>) =>
        new Promise<boolean>((resolve) => {
          // Zdania po kolei – Chrome ucina długie wypowiedzi
          const sentences: { from: number; text: string }[] = [];
          const re = /[^.!?…]+[.!?…]*["”»)]*\s*/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(part.text)))
            if (m[0].trim()) sentences.push({ from: part.from + m.index, text: m[0] });
          let boundaries = false;
          let estimating = false;
          sentences.forEach((sentence, i) => {
            const u = new SpeechSynthesisUtterance(sentence.text);
            u.voice = picked.v;
            u.lang = picked.v.lang;
            u.pitch = picked.pitch;
            u.rate = voice.rate;
            u.onstart = () => {
              show(sentence.from);
              // głosy bez zdarzeń „boundary”: słowa według zegara w obrębie zdania
              if (!boundaries && !estimating) {
                estimating = true;
                void simulate(sentence.from, sentence.text.length).then(() => (estimating = false));
              }
            };
            u.onboundary = (e) => {
              if (e.name !== 'word') return;
              boundaries = true;
              show(sentence.from + e.charIndex);
            };
            u.onend = () => i === sentences.length - 1 && resolve(true);
            u.onerror = (e) => {
              if (e.error === 'interrupted' || e.error === 'canceled') return resolve(true);
              synth()?.cancel();
              resolve(false);
            };
            synth()!.speak(u);
          });
          cleanup.current.push(() => resolve(true));
        });

      let audible = true;
      for (const part of placed) {
        if (!alive()) return;
        let ok = false;
        if (sound && part.audio) ok = await playAudio(part.audio, part.from, part.text.length);
        else if (sound && tts) ok = await sayTts(part, tts);
        if (!ok && alive()) {
          audible = false;
          setState((s) => ({ ...s, audible: false }));
          await simulate(part.from, part.text.length);
        }
      }
      if (alive())
        setState((s) => ({ ...s, word: starts.length, talking: false, audible: audible }));
    },
    [halt],
  );

  return { state, speak, stop };
}
