import type { ElementType, ScriptElement } from '../types';
import type { ElementMetrics } from './metrics';
import { CPI } from './metrics';

/** Un par de diálogo dual: [inicio, fin) de cada columna, en índices de elementos. */
export interface DualPair {
  left: [number, number];
  right: [number, number];
}

const inUnit = (t: ElementType) => t === 'dialogue' || t === 'parenthetical';

/**
 * Un personaje con `dual` forma columna derecha junto al bloque de diálogo anterior
 * (personaje + acotaciones/diálogos), que pasa a ser la columna izquierda.
 */
export function findDualPairs(elements: Pick<ScriptElement, 'type' | 'dual'>[]): DualPair[] {
  const pairs: DualPair[] = [];
  let lastRightEnd = -1;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type !== 'character' || !el.dual) continue;
    let j = i - 1;
    while (j >= 0 && inUnit(elements[j].type)) j--;
    if (j < 0 || j === i - 1 || elements[j].type !== 'character' || j < lastRightEnd) continue;
    let end = i + 1;
    while (end < elements.length && inUnit(elements[end].type)) end++;
    pairs.push({ left: [j, i], right: [i, end] });
    lastRightEnd = end;
  }
  return pairs;
}

/** Posición de cada elemento dentro de un par dual. */
export function dualSides(pairs: DualPair[]): Map<number, 'left' | 'right'> {
  const map = new Map<number, 'left' | 'right'>();
  for (const p of pairs) {
    for (let i = p.left[0]; i < p.left[1]; i++) map.set(i, 'left');
    for (let i = p.right[0]; i < p.right[1]; i++) map.set(i, 'right');
  }
  return map;
}

/** Columnas del diálogo dual: izquierda desde 1.5", derecha desde 4.5". */
export const DUAL_COLUMN = { left: 1.5, right: 4.5 };

const DUAL_OFFSETS: Partial<Record<ElementType, { offset: number; width: number; upper: boolean }>> = {
  character: { offset: 0.9, width: 2.0, upper: true },
  parenthetical: { offset: 0.4, width: 2.0, upper: false },
  dialogue: { offset: 0, width: 2.8, upper: false },
};

export function dualMetrics(side: 'left' | 'right', type: ElementType): ElementMetrics {
  const d = DUAL_OFFSETS[type] ?? DUAL_OFFSETS.dialogue!;
  return { left: DUAL_COLUMN[side] + d.offset, width: d.width, chars: Math.round(d.width * CPI), upper: d.upper, align: 'left' };
}
