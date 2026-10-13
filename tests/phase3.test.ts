import { describe, expect, it } from 'vitest';
import { computeSceneNumbers } from '../src/pagination/numbering';
import { findDualPairs } from '../src/pagination/dual';
import { paginate, type PaginateSettings } from '../src/pagination/paginate';
import { parseFountain } from '../src/formats/fountain/parse';
import { serializeFountain } from '../src/formats/fountain/serialize';
import type { ElementType, ScriptElement } from '../src/types';

let n = 0;
const el = (type: ElementType, text: string, extra: Partial<ScriptElement> = {}): ScriptElement => ({ id: String(n++), type, text, ...extra });
const scene = (num?: string) => el('scene', 'INT. X', num ? { sceneNumber: num } : {});
const nums = (els: ScriptElement[], locked = true) => [...computeSceneNumbers(els, locked).values()];
const S: PaginateSettings = { pageSize: 'letter', showMoreContd: true, language: 'es', sceneSpacing: 1, autoContd: true };

describe('Numeración de escenas', () => {
  it('sin bloquear es correlativa e ignora los guardados', () => {
    expect(nums([scene('7'), scene(), scene('2')], false)).toEqual(['1', '2', '3']);
  });
  it('bloqueada: escena nueva entre 5 y 6 es 5A, luego 5B', () => {
    expect(nums([scene('5'), scene(), scene(), scene('6')])).toEqual(['5', '5A', '5B', '6']);
  });
  it('bloqueada: después de 5A viene 5B', () => {
    expect(nums([scene('5'), scene('5A'), scene(), scene('6')])).toEqual(['5', '5A', '5B', '6']);
  });
  it('bloqueada: antes de la primera es A1', () => {
    expect(nums([scene(), scene('1'), scene('2')])).toEqual(['A1', '1', '2']);
  });
  it('bloqueada: al final continúa la numeración', () => {
    expect(nums([scene('1'), scene('2'), scene()])).toEqual(['1', '2', '3']);
  });
  it('bloqueada: escenas borradas dejan el hueco', () => {
    expect(nums([scene('1'), scene('3')])).toEqual(['1', '3']);
  });
  it('bloqueada: Z pasa a AA', () => {
    expect(nums([scene('5Z'), scene(), scene('6')])).toEqual(['5Z', '5AA', '6']);
  });
});

describe('Diálogo dual', () => {
  const pair = () => [
    el('character', 'ANA'), el('dialogue', 'Hola.'),
    el('character', 'JUAN', { dual: true }), el('parenthetical', '(a la vez)'), el('dialogue', 'Hola.'),
    el('action', 'Se miran.'),
  ];
  it('detecta el par', () => {
    expect(findDualPairs(pair())).toEqual([{ left: [0, 2], right: [2, 5] }]);
  });
  it('sin bloque anterior no hay par', () => {
    expect(findDualPairs([el('action', 'x'), el('character', 'JUAN', { dual: true }), el('dialogue', 'y')])).toEqual([]);
  });
  it('las columnas comparten líneas y la altura es la de la más alta', () => {
    const r = paginate(pair(), S);
    const blocks = r.pages[0].blocks;
    const ana = blocks.find((b) => b.lines[0] === 'ANA')!;
    const juan = blocks.find((b) => b.lines[0] === 'JUAN')!;
    expect(ana.dual).toBe('left');
    expect(juan.dual).toBe('right');
    expect(ana.line).toBe(juan.line);
    // ANA: 2 líneas, JUAN: 3 → la acción va después de 3 líneas + 1 en blanco.
    const action = blocks.find((b) => b.type === 'action')!;
    expect(action.line).toBe(juan.line + 3 + 1);
  });
  it('un par que no entra pasa entero a la página siguiente', () => {
    const filler = el('action', Array.from({ length: 52 }, () => 'x'.repeat(59) + '.').join(' '));
    const r = paginate([filler, ...pair()], S);
    expect(r.elementPage.slice(1, 6)).toEqual([2, 2, 2, 2, 2]);
  });
  it('Fountain ^ ida y vuelta', () => {
    const out = serializeFountain(pair());
    expect(out).toContain('JUAN ^');
    expect(parseFountain(out).elements[2].dual).toBe(true);
  });
});

describe('Fountain: sinopsis', () => {
  it('= después de una escena va a la tarjeta', () => {
    const doc = parseFountain('INT. CASA - DÍA\n\n= Ana descubre la carta.\n\nAcción.');
    expect(doc.elements[0].synopsis).toBe('Ana descubre la carta.');
    expect(doc.elements.map((e) => e.type)).toEqual(['scene', 'action']);
  });
  it('se exporta y vuelve', () => {
    const out = serializeFountain([el('scene', 'INT. CASA', { synopsis: 'Algo pasa.' }), el('action', 'x')]);
    expect(parseFountain(out).elements[0].synopsis).toBe('Algo pasa.');
  });
  it('exporta números de escena bloqueados', () => {
    const els = [scene('5'), scene()];
    expect(serializeFountain(els, undefined, { sceneNumbers: computeSceneNumbers(els, true) })).toContain('INT. X #6#');
  });
});
