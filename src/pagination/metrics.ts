import type { ElementType, ProjectSettings } from '../types';

/** Courier 12 pt: 10 caracteres por pulgada, 6 líneas por pulgada. */
export const CPI = 10;
export const LPI = 6;

export interface ElementMetrics {
  /** Margen izquierdo desde el borde de la hoja, en pulgadas. */
  left: number;
  /** Ancho máximo en pulgadas. */
  width: number;
  /** Caracteres por línea. */
  chars: number;
  upper: boolean;
  align: 'left' | 'right' | 'center';
}

function m(left: number, width: number, upper: boolean, align: ElementMetrics['align'] = 'left'): ElementMetrics {
  return { left, width, chars: Math.round(width * CPI), upper, align };
}

export const METRICS: Record<ElementType, ElementMetrics> = {
  scene: m(1.5, 6.0, true),
  action: m(1.5, 6.0, false),
  character: m(3.7, 3.3, true),
  parenthetical: m(3.1, 2.0, false),
  dialogue: m(2.5, 3.5, false),
  transition: m(1.5, 6.0, true, 'right'),
  shot: m(1.5, 6.0, true),
  general: m(1.5, 6.0, false),
  act: m(1.5, 6.0, true, 'center'),
};

export interface PageGeometry {
  width: number; // pulgadas
  height: number;
  top: number;
  bottom: number;
  /** Líneas de cuerpo por página. */
  lines: number;
  /** Borde derecho del texto (transiciones, número de página). */
  rightEdge: number;
}

export function pageGeometry(size: ProjectSettings['pageSize']): PageGeometry {
  const width = size === 'a4' ? 8.27 : 8.5;
  const height = size === 'a4' ? 11.69 : 11;
  const top = 1;
  const bottom = 1;
  // Letter: (11 - 2) * 6 + 1 = 55 líneas. A4: 59.
  const lines = Math.round((height - top - bottom) * LPI) + 1;
  return { width, height, top, bottom, lines, rightEdge: 7.5 };
}

export function spaceBefore(type: ElementType, settings: Pick<ProjectSettings, 'sceneSpacing'>): number {
  switch (type) {
    case 'parenthetical':
    case 'dialogue':
      return 0;
    case 'scene':
      return settings.sceneSpacing;
    default:
      return 1;
  }
}

export function displayCase(type: ElementType, text: string): string {
  return METRICS[type].upper ? text.toLocaleUpperCase() : text;
}
