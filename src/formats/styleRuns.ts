import { TEXT_STYLES, type StyleRange, type TextStyle } from '../types';

export interface StyleRun {
  text: string;
  /** Offset del tramo dentro del texto. */
  from: number;
  styles: TextStyle[];
}

/** Parte el texto en tramos con el mismo conjunto de estilos (y, si se pide, también en cada salto de línea). */
export function styleRuns(text: string, styles: StyleRange[] = [], splitLines = false): StyleRun[] {
  const cuts = new Set<number>([0, text.length]);
  for (const r of styles) {
    cuts.add(Math.max(0, Math.min(text.length, r.from)));
    cuts.add(Math.max(0, Math.min(text.length, r.to)));
  }
  if (splitLines) for (let i = 0; i < text.length; i++) if (text[i] === '\n') cuts.add(i).add(i + 1);
  const points = [...cuts].sort((a, b) => a - b);
  const runs: StyleRun[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const [a, b] = [points[k], points[k + 1]];
    if (a === b) continue;
    const set = TEXT_STYLES.filter((st) => styles.some((r) => r.style === st && r.from <= a && r.to >= b));
    const seg = text.slice(a, b);
    const prev = runs[runs.length - 1];
    // Une tramos vecinos con los mismos estilos (sin pasar por encima de un salto, si se pidieron aparte).
    const lineBreak = splitLines && (seg === '\n' || prev?.text.endsWith('\n'));
    if (prev && !lineBreak && prev.styles.join() === set.join()) prev.text += seg;
    else runs.push({ text: seg, from: a, styles: set });
  }
  return runs;
}

/** Rangos de estilo a partir de los estilos de cada carácter (los vecinos se unen). */
export function rangesFromChars(chars: ReadonlyArray<ReadonlySet<TextStyle>>): StyleRange[] {
  const out: StyleRange[] = [];
  for (const style of TEXT_STYLES) {
    let open: StyleRange | null = null;
    chars.forEach((set, i) => {
      if (set.has(style)) {
        if (open) open.to = i + 1;
        else out.push((open = { style, from: i, to: i + 1 }));
      } else open = null;
    });
  }
  return out;
}

/** Recorta los estilos a [from, to) (y descarta los que quedan vacíos). */
export function clipStyles(styles: StyleRange[] = [], from: number, to: number): StyleRange[] {
  return styles
    .map((r) => ({ ...r, from: Math.max(r.from, from), to: Math.min(r.to, to) }))
    .filter((r) => r.to > r.from);
}
