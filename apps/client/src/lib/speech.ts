import { useCallback, useEffect, useRef, useState } from 'react';
import type { PersonVoice, TranscriptEntry } from '@detektyw/shared';

/**
 * Głos postaci w przesłuchaniu: synteza mowy wbudowana w przeglądarkę (Web Speech API, polskie głosy systemu).
 * Bez polskiego głosu (albo z wyłączonym dźwiękiem) napisy i animacja biegną według szacowanego tempa mowy.
 */

const STORAGE_KEY = 'detektyw.voice';
const FEMALE = /zofia|zosia|paulina|agnieszka|ewa|maja|female|kobiet/i;
const MALE = /marek|krzysztof|adam|jacek|(?<!fe)male|mężczyzn/i;

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

/** Część wpisu, którą postać mówi na głos: kwestia po pauzie dialogowej, bez narracji i formatowania. */
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

/** Głos dopasowany do płci postaci; gdy system ma tylko jeden polski głos – zmiana wysokości tonu. */
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
    if (!v) synth()?.cancel();
  }, []);
  return [on, set];
}

/** Odblokowuje mowę na iOS/Safari: pierwsze wywołanie musi nastąpić w geście użytkownika. */
let primed = false;
export function primeSpeech() {
  const s = synth();
  if (primed || !s) return;
  primed = true;
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  s.speak(u);
}

export interface SpeechState {
  text: string;
  /** Indeks słowa wypowiadanego teraz (−1 przed startem). */
  word: number;
  talking: boolean;
  /** false – brak polskiego głosu albo dźwięk wyłączony: napisy bez dźwięku. */
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
  const timer = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    run.current++;
    window.clearInterval(timer.current);
    synth()?.cancel();
    setState((s) => ({ ...s, talking: false, word: s.text ? wordStarts(s.text).length : -1 }));
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(async (text: string, voice: PersonVoice, sound: boolean) => {
    const id = ++run.current;
    window.clearInterval(timer.current);
    synth()?.cancel();
    if (!text) return setState(IDLE);
    const starts = wordStarts(text);
    const picked = sound ? await pickVoice(voice) : null;
    if (id !== run.current) return;
    const at = (char: number) => {
      let w = 0;
      while (w + 1 < starts.length && starts[w + 1]! <= char) w++;
      return w;
    };

    // Tryb bez dźwięku albo zapasowy: słowa według szacowanego tempa (~13 znaków na sekundę).
    // Gdy gra dźwięk (withAudio), koniec wyznacza zdarzenie „end” ostatniego zdania, nie zegar.
    const simulate = (fromChar: number, withAudio = false) => {
      const cps = 13 * voice.rate;
      const t0 = performance.now() - (fromChar / cps) * 1000;
      timer.current = window.setInterval(() => {
        if (id !== run.current) return window.clearInterval(timer.current);
        const char = ((performance.now() - t0) / 1000) * cps;
        if (char >= text.length) {
          window.clearInterval(timer.current);
          if (withAudio) return setState((s) => ({ ...s, word: starts.length - 1 }));
          setState((s) => ({ ...s, word: starts.length, talking: false }));
        } else setState((s) => ({ ...s, word: at(char) }));
      }, 90);
    };

    setState({ text, word: 0, talking: true, audible: !!picked });
    if (!picked) return simulate(0);

    // Zdania po kolei – Chrome ucina długie wypowiedzi
    const sentences: { from: number; text: string }[] = [];
    const re = /[^.!?…]+[.!?…]*["”»)]*\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) if (m[0].trim()) sentences.push({ from: m.index, text: m[0] });
    let boundaries = false;
    sentences.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part.text);
      u.voice = picked.v;
      u.lang = picked.v.lang;
      u.pitch = picked.pitch;
      u.rate = voice.rate;
      u.onstart = () => {
        if (id !== run.current) return;
        setState((s) => ({ ...s, word: at(part.from), talking: true }));
      };
      u.onboundary = (e) => {
        if (id !== run.current || e.name !== 'word') return;
        boundaries = true;
        setState((s) => ({ ...s, word: at(part.from + e.charIndex) }));
      };
      u.onend = () => {
        if (id !== run.current || i < sentences.length - 1) return;
        window.clearInterval(timer.current);
        setState((s) => ({ ...s, word: starts.length, talking: false }));
      };
      u.onerror = (e) => {
        if (id !== run.current || e.error === 'interrupted' || e.error === 'canceled') return;
        // np. zablokowane odtwarzanie – napisy bez dźwięku
        synth()?.cancel();
        setState((s) => ({ ...s, audible: false }));
        simulate(part.from);
      };
      synth()!.speak(u);
    });
    // Głosy bez zdarzeń „boundary” (część systemów): słowa według czasu, start z pierwszym zdaniem
    window.setTimeout(() => {
      if (id === run.current && !boundaries && synth()?.speaking) simulate(0, true);
    }, 700);
  }, []);

  return { state, speak, stop };
}
