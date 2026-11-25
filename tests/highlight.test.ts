import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { docToElements, elementsToDoc } from '../src/editor/schema';
import { isFullyHighlighted, toggleHighlight } from '../src/editor/highlighter';
import { revisionPlugin } from '../src/editor/revision';
import { idsPlugin } from '../src/editor/autodetect';
import { normalizeProject } from '../src/storage/db';
import { newProject, type ElementType, type ScriptElement } from '../src/types';

let n = 0;
const el = (type: ElementType, text: string, extra: Partial<ScriptElement> = {}): ScriptElement => ({ id: `h${n++}`, type, text, ...extra });

const stateOf = (els: ScriptElement[], plugins = [idsPlugin()]) => EditorState.create({ doc: elementsToDoc(els), plugins });
/** Selecciona [a, b) del texto del primer elemento. */
const select = (s: EditorState, a: number, b: number) => s.apply(s.tr.setSelection(TextSelection.create(s.doc, 1 + a, 1 + b)));
const run = (s: EditorState) => {
  let next = s;
  toggleHighlight(s, (tr) => (next = s.apply(tr)));
  return next;
};
const hl = (s: EditorState, i = 0) => docToElements(s.doc)[i].highlights;

describe('Resaltador', () => {
  it('ida y vuelta por el documento, con saltos de línea y etiquetas superpuestas', () => {
    const els = [
      el('action', 'Ana toma el revólver.\nSuena un disparo.', {
        tags: [{ category: 'props', from: 13, to: 20 }],
        highlights: [{ from: 4, to: 30 }],
      }),
    ];
    const back = docToElements(elementsToDoc(els))[0];
    expect(back.text).toBe(els[0].text);
    expect(back.highlights).toEqual([{ from: 4, to: 30 }]);
    expect(back.tags).toEqual(els[0].tags);
  });

  it('los elementos sin resaltar no llevan el campo', () => {
    expect(docToElements(elementsToDoc([el('action', 'Nada.')]))[0]).not.toHaveProperty('highlights');
  });

  it('resaltar, y volver a pasar sobre lo resaltado lo despinta', () => {
    let s = select(stateOf([el('action', 'Una casa vieja.')]), 4, 8);
    s = run(s);
    expect(hl(s)).toEqual([{ from: 4, to: 8 }]);
    expect(s.selection.empty).toBe(true);
    s = run(select(s, 4, 8));
    expect(hl(s)).toBeUndefined();
  });

  it('si la selección está resaltada a medias, la completa', () => {
    let s = stateOf([el('action', 'Una casa vieja.', { highlights: [{ from: 4, to: 8 }] })]);
    s = run(select(s, 0, 14));
    expect(hl(s)).toEqual([{ from: 0, to: 14 }]);
  });

  it('tramos que se tocan quedan como uno solo', () => {
    let s = stateOf([el('action', 'Una casa vieja.', { highlights: [{ from: 0, to: 4 }] })]);
    s = run(select(s, 4, 8));
    expect(hl(s)).toEqual([{ from: 0, to: 8 }]);
  });

  it('abarca varios elementos', () => {
    let s = stateOf([el('action', 'Uno.'), el('action', 'Dos.')]);
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 1, s.doc.content.size - 1)));
    expect(isFullyHighlighted(s, s.selection.from, s.selection.to)).toBe(false);
    s = run(s);
    expect(docToElements(s.doc).map((e) => e.highlights)).toEqual([[{ from: 0, to: 4 }], [{ from: 0, to: 4 }]]);
  });

  it('sigue al texto al editar y no se estira al escribir justo después', () => {
    let s = stateOf([el('action', 'Una casa.', { highlights: [{ from: 4, to: 8 }] })]);
    s = s.apply(s.tr.insertText('Hay ', 1));
    expect(hl(s)).toEqual([{ from: 8, to: 12 }]);
    s = s.apply(s.tr.insertText(' grande', 1 + 12));
    expect(hl(s)).toEqual([{ from: 8, to: 12 }]);
    expect(docToElements(s.doc)[0].text).toBe('Hay Una casa grande.');
  });

  it('resaltar no cuenta como revisión', () => {
    let s = stateOf([el('action', 'Una casa.')], [idsPlugin(), revisionPlugin(() => 'blue')]);
    s = run(select(s, 0, 3));
    expect(docToElements(s.doc)[0].revision).toBeUndefined();
  });

  it('los proyectos guardados sin resaltado se abren igual', () => {
    const old = newProject('Viejo');
    old.elements = [el('scene', 'INT. CASA - DÍA'), el('action', 'Entra Ana.')];
    const p = normalizeProject(JSON.parse(JSON.stringify(old)));
    expect(p.elements).toEqual(old.elements);
    expect(docToElements(elementsToDoc(p.elements))).toEqual(old.elements);
  });
});
