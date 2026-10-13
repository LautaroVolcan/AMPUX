import { useCallback, useState } from 'react';
import type { Language } from '../types';

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  uiLang: Language;
  typeLabels: boolean;
  zoom: number;
  showNav: boolean;
  showNotes: boolean;
  mode: 'page' | 'draft' | 'cards';
  breakdown: boolean;
  rightTab: 'notes' | 'breakdown';
}

const DEFAULTS: Prefs = { theme: 'system', uiLang: 'es', typeLabels: false, zoom: 1, showNav: true, showNotes: false, mode: 'page', breakdown: false, rightTab: 'notes' };
const KEY = 'ampux.prefs';

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Preferencias de este navegador (no del guion). */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* almacenamiento no disponible */
      }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}
