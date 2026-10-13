import type { ScriptElement } from '../types';

/** "Z" → "AA", "B" → "C". */
function nextLetters(s: string): string {
  if (!s) return 'A';
  const chars = s.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] !== 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
    i--;
  }
  return 'A' + chars.join('');
}

/** Siguiente número "intercalado" después de `prev`: 5 → 5A, 5A → 5B, null → A{next}. */
function insertAfter(prev: string | null, next: string): string {
  if (prev === null) return `A${next}`;
  const m = /^(.*?\d+)([A-Z]*)$/i.exec(prev);
  if (!m) return `${prev}A`;
  return `${m[1]}${nextLetters(m[2].toUpperCase())}`;
}

/**
 * Números de escena.
 * - Sin bloquear: correlativos 1, 2, 3…
 * - Bloqueados: se respetan los guardados; una escena nueva entre la 5 y la 6 es la 5A,
 *   y una nueva al final continúa la numeración entera.
 */
export function computeSceneNumbers(elements: ScriptElement[], locked = false): Map<number, string> {
  const map = new Map<number, string>();
  const scenes = elements.flatMap((e, i) => (e.type === 'scene' ? [i] : []));
  if (!locked) {
    scenes.forEach((i, n) => map.set(i, String(n + 1)));
    return map;
  }
  const used = new Set(scenes.map((i) => elements[i].sceneNumber).filter(Boolean) as string[]);
  let prev: string | null = null;
  let maxInt = 0;
  scenes.forEach((i, k) => {
    const stored = elements[i].sceneNumber;
    let num: string;
    if (stored) {
      num = stored;
    } else {
      const nextLocked = scenes.slice(k + 1).map((j) => elements[j].sceneNumber).find(Boolean);
      if (nextLocked) {
        num = insertAfter(prev, nextLocked);
        while (used.has(num)) num = insertAfter(num, nextLocked);
      } else {
        num = String(maxInt + 1);
        while (used.has(num)) num = String(Number(num) + 1);
      }
      used.add(num);
    }
    const int = parseInt(num.replace(/^[A-Z]+/i, ''), 10);
    if (!isNaN(int)) maxInt = Math.max(maxInt, int);
    prev = num;
    map.set(i, num);
  });
  return map;
}
