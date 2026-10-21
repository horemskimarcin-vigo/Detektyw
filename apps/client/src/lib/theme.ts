import { useEffect } from 'react';
import type { UserSettings } from '@detektyw/shared';

/** Ustawienia wyglądu: motyw, skala czcionki, ograniczenie animacji. */
export function useApplySettings(settings: UserSettings | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    const theme = settings?.theme ?? 'dark';
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    root.style.setProperty('--font-scale', String(settings?.fontScale ?? 1));
    root.toggleAttribute('data-reduce-motion', settings?.reduceMotion ?? false);
  }, [settings]);
}
