import type { StyleRange, TextStyle } from '../../types';
import { rangesFromChars, styleRuns } from '../styleRuns';

interface Char {
  c: string;
  /** Escapado con "\": es literal, nunca delimitador. */
  esc: boolean;
  st: Set<TextStyle>;
}

const STARS = /(\*{1,3})(?=\S)([^*\n]+?)(?<=\S)\1/;
const UNDERSCORE = /_(?=\S)([^_\n]+?)(?<=\S)_/;
const STAR_STYLES: Record<number, TextStyle[]> = { 1: ['italic'], 2: ['bold'], 3: ['bold', 'italic'] };

/**
 * Lee el énfasis de Fountain: *cursiva*, **negrita**, ***ambas*** y _subrayado_ (combinables, p. ej. _**así**_).
 * \* y \_ son literales. Devuelve el texto sin marcas y los rangos de estilo.
 */
export function parseEmphasis(source: string): { text: string; styles: StyleRange[] } {
  const chars: Char[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\\' && (source[i + 1] === '*' || source[i + 1] === '_')) {
      chars.push({ c: source[++i], esc: true, st: new Set() });
    } else chars.push({ c: source[i], esc: false, st: new Set() });
  }
  // Los escapados se ven como otro carácter, así las expresiones no los toman como delimitadores.
  const view = () => chars.map((ch) => (ch.esc ? '\u0001' : ch.c)).join('');
  const apply = (re: RegExp, stylesFor: (delim: number) => TextStyle[]) => {
    for (let m = re.exec(view()); m; m = re.exec(view())) {
      const d = re === STARS ? m[1].length : 1;
      const start = m.index;
      const end = m.index + m[0].length;
      for (let k = start + d; k < end - d; k++) for (const st of stylesFor(d)) chars[k].st.add(st);
      chars.splice(end - d, d);
      chars.splice(start, d);
    }
  };
  apply(STARS, (d) => STAR_STYLES[d]);
  apply(UNDERSCORE, () => ['underline']);
  return { text: chars.map((ch) => ch.c).join(''), styles: rangesFromChars(chars.map((ch) => ch.st)) };
}

const escape = (s: string) => s.replace(/[*_]/g, (c) => `\\${c}`);

/** Escribe el texto con el énfasis de Fountain. Los espacios de los bordes quedan fuera de las marcas. */
export function serializeEmphasis(text: string, styles: StyleRange[] = []): string {
  return styleRuns(text, styles, true)
    .map(({ text: run, styles: st }) => {
      if (!st.length || run === '\n') return escape(run);
      const core = run.trim();
      if (!core) return run;
      const lead = run.slice(0, run.indexOf(core));
      const trail = run.slice(lead.length + core.length);
      const bold = st.includes('bold');
      const italic = st.includes('italic');
      const stars = bold && italic ? '***' : bold ? '**' : italic ? '*' : '';
      let out = `${stars}${escape(core)}${stars}`;
      if (st.includes('underline')) out = `_${out}_`;
      return lead + out + trail;
    })
    .join('');
}
