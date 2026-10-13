import type { ElementType } from '../types';

/**
 * Tablas de flujo del editor. Ajustá acá el comportamiento de Enter y Tab
 * sin tocar la lógica del keymap.
 */

/** Enter al final de un elemento con texto. */
export const ENTER_FLOW: Record<ElementType, ElementType> = {
  scene: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'action',
  transition: 'scene',
  shot: 'action',
  act: 'scene',
  general: 'general',
};

/** Tab en un elemento vacío. Shift+Tab recorre el ciclo al revés. */
export const TAB_FLOW: Partial<Record<ElementType, ElementType>> = {
  action: 'character',
  character: 'transition',
  transition: 'scene',
  scene: 'action',
  dialogue: 'parenthetical',
  parenthetical: 'dialogue',
};

/** Tab en un elemento con texto. */
export type TabWithTextAction = 'insert-parenthetical' | { convert: ElementType };
export const TAB_WITH_TEXT: Partial<Record<ElementType, TabWithTextAction>> = {
  dialogue: 'insert-parenthetical',
  action: { convert: 'character' },
};

/** Inverso de TAB_FLOW, para Shift+Tab. */
export function shiftTabTarget(type: ElementType): ElementType | undefined {
  const entry = (Object.entries(TAB_FLOW) as [ElementType, ElementType][]).find(([, to]) => to === type);
  return entry?.[0];
}

/** Cmd/Ctrl + 1…8 */
export const SHORTCUT_TYPES: ElementType[] = [
  'scene',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
  'general',
];
