import type { Language } from '../types';

const WORD = /[\p{L}\p{N}]/u;
const LETTER = /\p{L}/u;

export interface WrappedLine {
  /** Offset de inicio dentro del texto del elemento. */
  start: number;
  /** Offset de fin (exclusivo, sin espacios colgantes). */
  end: number;
  text: string;
}

/**
 * Corte de línea por cantidad de caracteres (greedy), igual al que hace el
 * navegador con `white-space: pre-wrap` en una fuente monoespaciada:
 * los espacios al final de una línea "cuelgan" y no ocupan la línea siguiente.
 */
export function wrapText(text: string, width: number): WrappedLine[] {
  const lines: WrappedLine[] = [];
  const paragraphs = text.split('\n');
  let base = 0;
  for (const para of paragraphs) {
    let pos = 0;
    if (para.length === 0) lines.push({ start: base, end: base, text: '' });
    while (pos < para.length) {
      const rest = para.length - pos;
      if (rest <= width) {
        lines.push({ start: base + pos, end: base + para.length, text: para.slice(pos) });
        break;
      }
      // Último espacio dentro del ancho (un espacio justo en la columna `width` también vale).
      const brk = para.lastIndexOf(' ', pos + width);
      // También se puede cortar después de un guion entre palabras ("owner-|and").
      let hyphen = -1;
      for (let h = Math.min(pos + width - 1, para.length - 2); h > pos; h--) {
        if (para[h] === '-' && WORD.test(para[h - 1]) && LETTER.test(para[h + 1])) {
          hyphen = h;
          break;
        }
      }
      let lineEnd: number;
      let next: number;
      if (hyphen >= 0 && hyphen + 1 > brk) {
        lineEnd = hyphen + 1;
        next = lineEnd;
      } else if (brk > pos) {
        lineEnd = brk;
        // Los espacios consecutivos cuelgan al final de la línea.
        while (lineEnd > pos && para[lineEnd - 1] === ' ') lineEnd--;
        next = brk;
        while (next < para.length && para[next] === ' ') next++;
        if (lineEnd === pos) {
          lineEnd = pos + width;
          next = lineEnd;
        }
      } else {
        // Palabra más larga que la línea: se corta a la fuerza.
        lineEnd = pos + width;
        next = lineEnd;
      }
      lines.push({ start: base + pos, end: base + lineEnd, text: para.slice(pos, lineEnd) });
      pos = next;
      if (pos >= para.length) break;
    }
    base += para.length + 1;
  }
  return lines;
}

/** ¿La línea termina una oración? Sirve para elegir dónde partir acción y diálogo. */
export function endsSentence(line: string): boolean {
  return /[.!?…:;]["'”’»)\]]*\s*$/.test(line) || /--\s*$/.test(line);
}

export interface Labels {
  more: string;
  contd: string;
}

export function labels(lang: Language): Labels {
  return lang === 'en' ? { more: "(MORE)", contd: "(CONT'D)" } : { more: '(MÁS)', contd: '(CONT.)' };
}

/** Nombre "base" del personaje, sin extensiones como (V.O.) o (CONT.). */
export function characterBaseName(text: string): string {
  return text
    .replace(/\(.*?\)/g, '')
    .replace(/\^\s*$/, '')
    .trim()
    .toLocaleUpperCase();
}

export function hasContd(text: string): boolean {
  return /\((CONT\.?|CONT'D|CONT’D|CONTD|CONTINÚA|CONTINUA)\)/i.test(text);
}
