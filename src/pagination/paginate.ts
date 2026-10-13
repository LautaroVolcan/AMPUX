import type { ElementType, ProjectSettings, ScriptElement } from '../types';
import { METRICS, displayCase, pageGeometry, spaceBefore } from './metrics';
import { characterBaseName, endsSentence, hasContd, labels, wrapText, type WrappedLine } from './rules';
import { computeSceneNumbers } from './numbering';
import { dualMetrics, dualSides, findDualPairs, type DualPair } from './dual';

export { computeSceneNumbers };

export type PaginateSettings = Pick<
  ProjectSettings,
  'pageSize' | 'showMoreContd' | 'language' | 'sceneSpacing' | 'autoContd'
> &
  Partial<Pick<ProjectSettings, 'lockedNumbers'>>;

export interface Block {
  /** Índice del elemento en el guion; -1 para bloques sintéticos (MÁS / CONT.). */
  elementIndex: number;
  type: ElementType;
  synthetic?: 'more' | 'contd';
  /** Líneas en blanco antes del bloque (ya resuelto: 0 al inicio de página). */
  spaceBefore: number;
  /** Línea de la página (0-based) donde empieza el texto del bloque. */
  line: number;
  /** Columna, si el bloque es parte de un diálogo dual. */
  dual?: 'left' | 'right';
  lines: string[];
  /** Rango de offsets del texto del elemento que cubre este bloque. */
  startOffset: number;
  endOffset: number;
  /** Número de escena (solo para encabezados). */
  sceneNumber?: string;
}

export interface Page {
  number: number;
  blocks: Block[];
  /** Líneas de cuerpo usadas (incluye espacios). */
  usedLines: number;
}

export interface PaginationResult {
  pages: Page[];
  linesPerPage: number;
  /** Página (1-based) donde empieza cada elemento. */
  elementPage: number[];
  /** Sufijo automático "(CONT.)" para personajes que retoman. */
  autoContd: Set<number>;
  sceneNumbers: Map<number, string>;
  dualPairs: DualPair[];
}

interface Prepared {
  el: ScriptElement;
  index: number;
  text: string; // texto tal como se imprime
  lines: WrappedLine[];
}

/** Personajes que vuelven a hablar tras una acción, dentro de la misma escena. */
export function computeAutoContd(elements: ScriptElement[]): Set<number> {
  const out = new Set<number>();
  let last: string | null = null;
  let sawOther = false;
  elements.forEach((el, i) => {
    if (el.type === 'scene' || el.type === 'act' || el.type === 'transition') {
      last = null;
      sawOther = false;
    } else if (el.type === 'character') {
      const name = characterBaseName(el.text);
      if (name && last === name && sawOther && !hasContd(el.text)) out.add(i);
      last = name;
      sawOther = false;
    } else if (el.type === 'action' || el.type === 'general' || el.type === 'shot') {
      if (el.text.trim()) sawOther = true;
    }
  });
  return out;
}

export function paginate(elements: ScriptElement[], settings: PaginateSettings): PaginationResult {
  const geo = pageGeometry(settings.pageSize);
  const max = geo.lines;
  const lab = labels(settings.language);
  const autoContd = settings.autoContd ? computeAutoContd(elements) : new Set<number>();
  const sceneNumbers = computeSceneNumbers(elements, !!settings.lockedNumbers);
  const dualPairs = findDualPairs(elements);
  const sides = dualSides(dualPairs);
  const pairAt = new Map(dualPairs.map((p) => [p.left[0], p]));

  const prepared: Prepared[] = elements.map((el, index) => {
    let text = displayCase(el.type, el.text);
    if (autoContd.has(index)) text = `${text} ${lab.contd}`;
    const side = sides.get(index);
    const chars = side ? dualMetrics(side, el.type).chars : METRICS[el.type].chars;
    return { el, index, text, lines: wrapText(text, chars) };
  });
  // Los offsets de los bloques refieren al texto del elemento, no al sufijo automático.
  const clampOffset = (p: Prepared, off: number) => Math.min(off, p.el.text.length);

  const pages: Page[] = [];
  let page: Page = { number: 1, blocks: [], usedLines: 0 };
  pages.push(page);
  const elementPage: number[] = new Array(elements.length).fill(1);

  const newPage = () => {
    page = { number: pages.length + 1, blocks: [], usedLines: 0 };
    pages.push(page);
  };
  const free = () => max - page.usedLines;
  const sb = (type: ElementType) => (page.usedLines === 0 ? 0 : spaceBefore(type, settings));

  const push = (p: Prepared, from: number, to: number, opts: { forceSb?: number; dual?: 'left' | 'right'; atLine?: number } = {}) => {
    const lines = p.lines.slice(from, to);
    const space = opts.forceSb ?? sb(p.el.type);
    const line = opts.atLine ?? page.usedLines + space;
    if (from === 0) elementPage[p.index] = page.number;
    page.blocks.push({
      elementIndex: p.index,
      type: p.el.type,
      spaceBefore: space,
      line,
      dual: opts.dual,
      lines: lines.map((l) => l.text),
      startOffset: clampOffset(p, lines[0]?.start ?? 0),
      endOffset: clampOffset(p, to >= p.lines.length ? p.el.text.length : p.lines[to].start),
      sceneNumber: p.el.type === 'scene' ? sceneNumbers.get(p.index) : undefined,
    });
    page.usedLines = Math.max(page.usedLines, line + lines.length);
  };

  const pushSynthetic = (kind: 'more' | 'contd', text: string) => {
    page.blocks.push({
      elementIndex: -1,
      type: 'character',
      synthetic: kind,
      spaceBefore: 0,
      line: page.usedLines,
      lines: [text],
      startOffset: 0,
      endOffset: 0,
    });
    page.usedLines += 1;
  };

  /** Mejor punto de corte (cantidad de líneas en esta página) para un elemento partible. */
  const findSplit = (p: Prepared, from: number, avail: number): number => {
    const total = p.lines.length - from;
    for (let k = Math.min(avail, total - 2); k >= 2; k--) {
      if (endsSentence(p.lines[from + k - 1].text)) return k;
    }
    return 0;
  };

  /** Coloca un elemento de acción/general, partiéndolo por oración si hace falta. */
  const placeSplittable = (p: Prepared) => {
    let from = 0;
    for (;;) {
      const space = sb(p.el.type);
      const remaining = p.lines.length - from;
      if (space + remaining <= free()) {
        push(p, from, p.lines.length, from > 0 ? { forceSb: 0 } : {});
        return;
      }
      const avail = free() - space;
      let k = avail >= 2 ? findSplit(p, from, avail) : 0;
      // Un bloque más largo que una página entera se corta donde sea.
      if (k === 0 && page.usedLines === 0) k = Math.max(1, avail);
      if (k > 0) {
        push(p, from, from + k, from > 0 ? { forceSb: 0 } : {});
        from += k;
      }
      newPage();
    }
  };

  /** Mínimo de líneas que el elemento siguiente necesita junto a un encabezado. */
  const keepWithNext = (i: number): number => {
    const next = prepared[i + 1];
    if (!next) return 0;
    const space = spaceBefore(next.el.type, settings);
    if (next.el.type === 'character') {
      const dlg = prepared[i + 2];
      return space + next.lines.length + (dlg ? Math.min(2, dlg.lines.length) : 0);
    }
    if (next.el.type === 'scene' || next.el.type === 'act') return 0;
    return space + Math.min(2, next.lines.length);
  };

  /** Coloca un bloque de diálogo: personaje + (acotación | diálogo)*. Devuelve el índice siguiente. */
  const placeDialogueUnit = (start: number): number => {
    let end = start + 1;
    while (end < prepared.length && (prepared[end].el.type === 'dialogue' || prepared[end].el.type === 'parenthetical')) end++;
    const items = prepared.slice(start, end);
    const charName = items[0].text.replace(/\s*\((CONT\.?|CONT'D)\)\s*$/i, '');
    const contdLine = `${characterBaseName(charName) || charName} ${lab.contd}`;
    const total = () => items.reduce((s, it) => s + it.lines.length, 0);


    // Entra entero.
    if (sb('character') + total() <= free()) {
      items.forEach((it, j) => push(it, 0, it.lines.length, j === 0 ? {} : { forceSb: 0 }));
      return end;
    }

    // Estado de lo que queda por colocar: item j desde la línea `from`.
    let j = 0;
    let from = 0;
    let first = true; // ¿todavía no se colocó el personaje?
    for (;;) {
      const space = first ? sb('character') : 0;
      const restLines = items.slice(j).reduce((s, it) => s + it.lines.length, 0) - from;
      if (space + restLines <= free()) {
        for (let q = j; q < items.length; q++) {
          push(items[q], q === j ? from : 0, items[q].lines.length, q === 0 && first ? {} : { forceSb: 0 });
        }
        return end;
      }

      // Buscar el corte más tardío que entre, reservando una línea para (MÁS).
      const reserve = settings.showMoreContd ? 1 : 0;
      const avail = free() - space - reserve;
      type Cut = { item: number; lines: number; total: number };
      let best: Cut | null = null;
      let acc = 0;
      for (let q = j; q < items.length; q++) {
        const it = items[q];
        const start = q === j ? from : 0;
        const len = it.lines.length - start;
        const isLast = q === items.length - 1;
        if (it.el.type === 'dialogue') {
          // Corte dentro del diálogo, por oración, 2 líneas a cada lado.
          for (let k = Math.min(len - 2, avail - acc); k >= 2; k--) {
            if (endsSentence(it.lines[start + k - 1].text)) {
              if (!best || acc + k > best.total) best = { item: q, lines: k, total: acc + k };
              break;
            }
          }
          // Corte después del diálogo completo (si queda algo más del bloque).
          if (!isLast && acc + len <= avail) best = { item: q, lines: len, total: acc + len };
        }
        acc += len;
        if (acc > avail) break;
      }
      // El personaje no puede quedar solo: tiene que haber al menos un diálogo antes del corte.
      const hasDialogueBefore =
        best && items.slice(j, best.item + 1).some((it) => it.el.type === 'dialogue');

      if (!best || !hasDialogueBefore || (first && best.total === 0)) {
        if (page.blocks.every((b) => b.synthetic)) {
          // Ni en una página vacía entra: cortar donde sea posible.
          best = forceCut(items, j, from, Math.max(1, avail));
        } else {
          newPage();
          if (!first) pushSynthetic('contd', contdLine);
          continue;
        }
      }

      // Colocar hasta el corte.
      const cut = best!;
      for (let q = j; q <= cut.item; q++) {
        const startLine = q === j ? from : 0;
        const stop = q === cut.item ? startLine + cut.lines : items[q].lines.length;
        push(items[q], startLine, stop, q === 0 && first ? {} : { forceSb: 0 });
      }
      first = false;
      const cutItem = items[cut.item];
      const cutStart = cut.item === j ? from : 0;
      if (cutStart + cut.lines >= cutItem.lines.length) {
        j = cut.item + 1;
        from = 0;
      } else {
        j = cut.item;
        from = cutStart + cut.lines;
      }
      if (j >= items.length) return end;
      if (settings.showMoreContd) pushSynthetic('more', lab.more);
      newPage();
      if (settings.showMoreContd) pushSynthetic('contd', contdLine);
    }
  };

  const forceCut = (items: Prepared[], j: number, from: number, avail: number) => {
    let acc = 0;
    for (let q = j; q < items.length; q++) {
      const len = items[q].lines.length - (q === j ? from : 0);
      if (acc + len >= avail) return { item: q, lines: avail - acc, total: avail };
      acc += len;
    }
    return { item: items.length - 1, lines: items[items.length - 1].lines.length, total: acc };
  };

  /** Diálogo dual: las dos columnas van enteras en la misma página. Devuelve false si no entra ni en una hoja vacía. */
  const placeDualPair = (pair: DualPair): boolean => {
    const height = (a: number, b: number) => prepared.slice(a, b).reduce((s, p) => s + p.lines.length, 0);
    const h = Math.max(height(...pair.left), height(...pair.right));
    if (h > max) return false;
    if (sb('character') + h > free() && page.usedLines > 0) newPage();
    const space0 = sb('character');
    const start = page.usedLines + space0;
    let line = start;
    for (let q = pair.left[0]; q < pair.left[1]; q++) {
      const p = prepared[q];
      push(p, 0, p.lines.length, { forceSb: q === pair.left[0] ? space0 : 0, dual: 'left', atLine: line });
      line += p.lines.length;
    }
    line = start;
    for (let q = pair.right[0]; q < pair.right[1]; q++) {
      const p = prepared[q];
      push(p, 0, p.lines.length, { forceSb: q === pair.right[0] ? space0 : 0, dual: 'right', atLine: line });
      line += p.lines.length;
    }
    return true;
  };

  // Estado guardado al inicio de cada unidad, para que una transición pueda arrastrar el bloque anterior.
  interface Snapshot {
    index: number;
    pages: number;
    blocks: number;
    used: number;
  }
  let lastUnit: Snapshot | null = null;
  const forced = new Set<number>();

  let i = 0;
  while (i < prepared.length) {
    const p = prepared[i];
    const type = p.el.type;

    if (forced.has(i) && page.usedLines > 0) newPage();

    const snap: Snapshot = { index: i, pages: pages.length, blocks: page.blocks.length, used: page.usedLines };

    if (type === 'act') {
      if (page.usedLines > 0) newPage();
      push(p, 0, p.lines.length);
      lastUnit = snap;
      i++;
      continue;
    }

    if (type === 'character' && pairAt.has(i) && placeDualPair(pairAt.get(i)!)) {
      i = pairAt.get(i)!.right[1];
      lastUnit = snap;
      continue;
    }

    if (type === 'character') {
      i = placeDialogueUnit(i);
      lastUnit = snap;
      continue;
    }

    if (type === 'action' || type === 'general' || type === 'dialogue' || type === 'parenthetical') {
      // Diálogo/acotación sueltos (sin personaje) se tratan como texto partible.
      placeSplittable(p);
      lastUnit = snap;
      i++;
      continue;
    }

    if (type === 'transition') {
      const need = sb(type) + p.lines.length;
      if (need > free() && lastUnit && page.usedLines > 0 && lastUnit.pages === pages.length && lastUnit.blocks > 0 && !forced.has(lastUnit.index)) {
        // Regla 6: la transición no abre página; arrastra el bloque anterior.
        pages.length = lastUnit.pages;
        page = pages[pages.length - 1];
        page.blocks.length = lastUnit.blocks;
        page.usedLines = lastUnit.used;
        forced.add(lastUnit.index);
        i = lastUnit.index;
        lastUnit = null;
        continue;
      }
      if (need > free()) newPage();
      push(p, 0, p.lines.length);
      lastUnit = snap;
      i++;
      continue;
    }

    // scene / shot: no pueden quedar solos al pie.
    const need = sb(type) + p.lines.length + keepWithNext(i);
    if (need > free() && page.usedLines > 0) newPage();
    push(p, 0, p.lines.length);
    lastUnit = snap;
    i++;
  }

  return { pages, linesPerPage: max, elementPage, autoContd, sceneNumbers, dualPairs };
}
