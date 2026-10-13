import { describe, expect, it } from 'vitest';
import { paginate, type PaginateSettings } from '../src/pagination/paginate';
import { wrapText } from '../src/pagination/rules';
import type { ElementType, ScriptElement } from '../src/types';

const S: PaginateSettings = { pageSize: 'letter', showMoreContd: true, language: 'es', sceneSpacing: 1, autoContd: true };
let n = 0;
const el = (type: ElementType, text: string): ScriptElement => ({ id: String(n++), type, text });
const sentence = (k: number) => Array.from({ length: k }, (_, i) => `Oración número ${i} del texto.`).join(' ');
/** Acción de exactamente `lines` líneas de 60 caracteres. */
const actionLines = (lines: number) => el('action', Array.from({ length: lines }, () => 'x'.repeat(59) + '.').join(' '));

describe('wrapText', () => {
  it('corta por palabra', () => {
    expect(wrapText('aaa bbb ccc', 7).map((l) => l.text)).toEqual(['aaa bbb', 'ccc']);
  });
  it('un espacio en la columna límite cuelga', () => {
    expect(wrapText('aaaaa bbb', 5).map((l) => l.text)).toEqual(['aaaaa', 'bbb']);
  });
  it('palabra larga se corta', () => {
    expect(wrapText('abcdefghij', 4).map((l) => l.text)).toEqual(['abcd', 'efgh', 'ij']);
  });
  it('saltos forzados', () => {
    expect(wrapText('a\n\nb', 10).map((l) => l.text)).toEqual(['a', '', 'b']);
  });
  it('offsets', () => {
    const l = wrapText('hola que tal', 8);
    expect(l.map((x) => [x.start, x.end])).toEqual([[0, 8], [9, 12]]);
  });
  it('corta después de un guion entre palabras', () => {
    expect(wrapText('aaaa owner-and-ringmaster', 16).map((l) => l.text)).toEqual(['aaaa owner-and-', 'ringmaster']);
  });
  it('no corta en guiones sueltos', () => {
    expect(wrapText('aaaa -- bbbbbbb', 10).map((l) => l.text)).toEqual(['aaaa --', 'bbbbbbb']);
  });
  it('texto vacío = una línea', () => {
    expect(wrapText('', 10)).toHaveLength(1);
  });
});

describe('paginate', () => {
  it('55 líneas por página en Letter, 59 en A4', () => {
    expect(paginate([], S).linesPerPage).toBe(55);
    expect(paginate([], { ...S, pageSize: 'a4' }).linesPerPage).toBe(59);
  });

  it('espacio antes por tipo y 0 al inicio de página', () => {
    const r = paginate([el('scene', 'INT. A'), el('action', 'x'), el('character', 'ANA'), el('parenthetical', '(a)'), el('dialogue', 'Hola')], S);
    expect(r.pages[0].blocks.map((b) => b.spaceBefore)).toEqual([0, 1, 1, 0, 0]);
    expect(r.pages[0].usedLines).toBe(7);
  });

  it('escena con espaciado doble', () => {
    const r = paginate([el('action', 'x'), el('scene', 'INT. A')], { ...S, sceneSpacing: 2 });
    expect(r.pages[0].blocks[1].spaceBefore).toBe(2);
  });

  it('regla 1: encabezado no queda solo al pie', () => {
    // 52 líneas usadas: el encabezado (1 + 1 espacio) + 2 de acción no entran.
    const r = paginate([actionLines(52), el('scene', 'INT. CASA'), actionLines(3)], S);
    expect(r.elementPage[1]).toBe(2);
  });

  it('regla 2: personaje no queda separado del diálogo', () => {
    const r = paginate([actionLines(53), el('character', 'ANA'), el('dialogue', 'Hola.')], S);
    expect(r.elementPage[1]).toBe(2);
    expect(r.elementPage[2]).toBe(2);
  });

  it('regla 3: acotación no queda sola al pie', () => {
    const r = paginate([actionLines(50), el('character', 'ANA'), el('dialogue', 'Hola.'), el('parenthetical', '(pausa)'), el('dialogue', sentence(8))], S);
    const p1 = r.pages[0].blocks;
    expect(p1[p1.length - 1].type).not.toBe('parenthetical');
    const lastReal = p1.filter((b) => !b.synthetic).pop()!;
    expect(lastReal.type).not.toBe('parenthetical');
  });

  it('regla 4: diálogo partido con (MÁS) y (CONT.)', () => {
    const r = paginate([actionLines(44), el('character', 'ANA'), el('dialogue', sentence(20))], S);
    const p1 = r.pages[0].blocks;
    const p2 = r.pages[1].blocks;
    expect(p1[p1.length - 1]).toMatchObject({ synthetic: 'more', lines: ['(MÁS)'] });
    expect(p2[0]).toMatchObject({ synthetic: 'contd', lines: ['ANA (CONT.)'] });
    const before = p1[p1.length - 2];
    const after = p2[1];
    expect(before.lines.length).toBeGreaterThanOrEqual(2);
    expect(after.lines.length).toBeGreaterThanOrEqual(2);
    expect(before.endOffset).toBe(after.startOffset);
    expect(r.pages[0].usedLines).toBeLessThanOrEqual(55);
  });

  it('regla 4: en inglés usa (MORE) / (CONT\'D)', () => {
    const r = paginate([actionLines(44), el('character', 'ANA'), el('dialogue', sentence(20))], { ...S, language: 'en' });
    expect(r.pages[1].blocks[0].lines[0]).toBe("ANA (CONT'D)");
  });

  it('regla 4: si no hay 2 líneas de cada lado se pasa entero', () => {
    const r = paginate([actionLines(51), el('character', 'ANA'), el('dialogue', sentence(4))], S);
    expect(r.elementPage[1]).toBe(2);
    expect(r.pages[0].blocks.some((b) => b.synthetic)).toBe(false);
  });

  it('regla 5: acción partida por oración con 2 líneas mínimo', () => {
    const r = paginate([actionLines(50), actionLines(10)], S);
    const tail = r.pages[0].blocks[1];
    expect(tail.lines.length).toBeGreaterThanOrEqual(2);
    expect(r.pages[1].blocks[0].lines.length).toBeGreaterThanOrEqual(2);
    expect(r.pages[1].blocks[0].spaceBefore).toBe(0);
  });

  it('regla 5: no deja 1 línea sola', () => {
    const r = paginate([actionLines(52), actionLines(3)], S);
    expect(r.pages[0].blocks).toHaveLength(1);
  });

  it('regla 6: transición no abre página', () => {
    const r = paginate([actionLines(51), actionLines(2), el('transition', 'CORTE A:')], S);
    expect(r.pages[1].blocks[0].type).not.toBe('transition');
    expect(r.elementPage[2]).toBe(2);
  });

  it('regla 7: (CONT.) automático tras una acción', () => {
    const r = paginate([el('scene', 'INT. A'), el('character', 'ANA'), el('dialogue', 'Hola.'), el('action', 'Se va.'), el('character', 'ANA'), el('dialogue', 'Vuelvo.')], S);
    expect(r.autoContd.has(4)).toBe(true);
    expect(r.pages[0].blocks[4].lines[0]).toBe('ANA (CONT.)');
  });

  it('regla 7: desactivable y se reinicia por escena', () => {
    const els = [el('character', 'ANA'), el('dialogue', 'a'), el('action', 'b'), el('scene', 'INT. B'), el('character', 'ANA'), el('dialogue', 'c')];
    expect(paginate(els, S).autoContd.size).toBe(0);
    const els2 = [el('character', 'ANA'), el('dialogue', 'a'), el('action', 'b'), el('character', 'ANA'), el('dialogue', 'c')];
    expect(paginate(els2, { ...S, autoContd: false }).autoContd.size).toBe(0);
  });

  it('acto fuerza salto de página', () => {
    const r = paginate([el('action', 'x'), el('act', 'ACTO DOS'), el('scene', 'INT. A')], S);
    expect(r.elementPage[1]).toBe(2);
  });

  it('nunca pasa del máximo de líneas', () => {
    const els: ScriptElement[] = [];
    for (let i = 0; i < 300; i++) {
      els.push(el('scene', `INT. LUGAR ${i} - DÍA`), el('action', sentence(i % 9 + 1)), el('character', 'ANA'), el('dialogue', sentence(i % 13 + 1)), el('transition', 'CORTE A:'));
    }
    const r = paginate(els, S);
    for (const p of r.pages) expect(p.usedLines).toBeLessThanOrEqual(55);
    // Todo el texto aparece exactamente una vez.
    const covered = new Map<number, number>();
    for (const p of r.pages) for (const b of p.blocks) if (b.elementIndex >= 0) covered.set(b.elementIndex, (covered.get(b.elementIndex) ?? 0) + (b.endOffset - b.startOffset));
    els.forEach((e, i) => expect(covered.get(i) ?? 0).toBeGreaterThanOrEqual(e.text.length - 1));
  });

  it('es rápida (120+ páginas)', () => {
    const els: ScriptElement[] = [];
    for (let i = 0; i < 600; i++) els.push(el('scene', 'INT. A'), el('action', sentence(5)), el('character', 'ANA'), el('dialogue', sentence(4)));
    const t = performance.now();
    const r = paginate(els, S);
    expect(r.pages.length).toBeGreaterThan(100);
    expect(performance.now() - t).toBeLessThan(200);
  });
});
