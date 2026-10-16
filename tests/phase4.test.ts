import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { docToElements, elementsToDoc, schema } from '../src/editor/schema';
import { revisionPlugin } from '../src/editor/revision';
import { idsPlugin } from '../src/editor/autodetect';
import { paginate } from '../src/pagination/paginate';
import { characterReport, formatEighths, locationReport, parseHeading, sceneReports, timeReport, toCSV } from '../src/reports/reports';
import { isBlankProject, normalizeProject } from '../src/storage/db';
import { DEFAULT_SETTINGS, type ElementType, type ScriptElement } from '../src/types';

let n = 0;
const el = (type: ElementType, text: string, extra: Partial<ScriptElement> = {}): ScriptElement => ({ id: `e${n++}`, type, text, ...extra });

describe('Etiquetas de desglose', () => {
  it('ida y vuelta por el documento, superpuestas y con saltos de línea', () => {
    const els = [el('action', 'Ana toma el revólver.\nSuena un disparo.', { tags: [
      { category: 'cast', from: 0, to: 3 },
      { category: 'props', from: 13, to: 20 },
      { category: 'sound', from: 30, to: 38 },
      { category: 'sfx', from: 30, to: 38 },
    ] })];
    const back = docToElements(elementsToDoc(els));
    expect(back[0].text).toBe(els[0].text);
    const sorted = (t: ScriptElement['tags']) => [...(t ?? [])].sort((a, b) => a.from - b.from || a.category.localeCompare(b.category));
    expect(sorted(back[0].tags)).toEqual(sorted(els[0].tags));
  });
  it('las etiquetas siguen al texto al editar antes', () => {
    const state = EditorState.create({ doc: elementsToDoc([el('action', 'Un revólver.', { tags: [{ category: 'props', from: 3, to: 11 }] })]) });
    const next = state.apply(state.tr.insertText('Hay ', 1));
    const tags = docToElements(next.doc)[0].tags!;
    expect(next.doc.firstChild!.textContent.slice(tags[0].from, tags[0].to)).toBe('revólver');
  });
});

describe('Modo revisión', () => {
  const setup = (rev: 'blue' | null) => {
    const els = [el('scene', 'INT. A'), el('action', 'Uno.'), el('action', 'Dos.'), el('action', 'Tres.')];
    return EditorState.create({ doc: elementsToDoc(els), plugins: [idsPlugin(), revisionPlugin(() => rev)] });
  };
  const revs = (s: EditorState) => docToElements(s.doc).map((e) => e.revision ?? null);
  it('marca el elemento editado', () => {
    const s = setup('blue');
    const pos = 1 + s.doc.child(0).nodeSize + 1; // dentro de "Uno."
    const next = s.applyTransaction(s.tr.insertText('X', pos)).state;
    expect(revs(next)).toEqual([null, 'blue', null, null]);
  });
  it('sin modo revisión no marca nada', () => {
    const s = setup(null);
    const next = s.applyTransaction(s.tr.insertText('X', 3)).state;
    expect(revs(next)).toEqual([null, null, null, null]);
  });
  it('al borrar un elemento marca el que ocupa su lugar', () => {
    const s = setup('blue');
    const from = s.doc.child(0).nodeSize + s.doc.child(1).nodeSize;
    const to = from + s.doc.child(2).nodeSize;
    const next = s.applyTransaction(s.tr.delete(from, to)).state;
    expect(docToElements(next.doc).map((e) => [e.text, e.revision ?? null])).toEqual([['INT. A', null], ['Uno.', null], ['Tres.', 'blue']]);
  });
  it('un elemento nuevo queda marcado', () => {
    const s = setup('blue');
    const end = s.doc.content.size;
    const tr = s.tr.insert(end, schema.nodes.action.create({ id: null }, schema.text('Cuatro.')));
    const next = s.applyTransaction(tr).state;
    expect(revs(next)).toEqual([null, null, null, null, 'blue']);
  });
  it('etiquetar no cuenta como revisión', () => {
    const s = setup('blue');
    const tr = s.tr.addMark(2, 4, schema.marks.tag.create({ category: 'props' }));
    expect(revs(s.applyTransaction(tr).state)).toEqual([null, null, null, null]);
  });
  it('importar (noRevision) no marca', () => {
    const s = setup('blue');
    const tr = s.tr.insertText('X', 3).setMeta('noRevision', true);
    expect(revs(s.applyTransaction(tr).state)).toEqual([null, null, null, null]);
  });
  void TextSelection;
});

describe('Reportes', () => {
  const els = [
    el('scene', 'INT. CASA DE ANA - NOCHE'),
    el('action', 'Ana entra con un perro.', { tags: [{ category: 'animals', from: 17, to: 22 }, { category: 'cast', from: 0, to: 3 }] }),
    el('character', 'ANA'), el('dialogue', 'Hola.'),
    el('character', 'JUAN (O.S.)'), el('dialogue', 'Acá.'),
    el('scene', 'EXT. CALLE - DÍA'),
    el('character', 'ANA'), el('dialogue', 'Chau.'), el('dialogue', 'Otra vez.'),
    el('scene', 'INT. CASA DE ANA - DÍA'),
    el('action', 'Vacía. El MOZO limpia.', { tags: [{ category: 'cast', from: 10, to: 14 }] }),
  ];
  const result = paginate(els, { ...DEFAULT_SETTINGS });
  const scenes = sceneReports(els, result);

  it('parsea encabezados', () => {
    expect(parseHeading('int./ext. auto - día')).toEqual({ intExt: 'INT/EXT', location: 'AUTO', time: 'DÍA' });
    expect(parseHeading('EXT. CAMPO')).toEqual({ intExt: 'EXT', location: 'CAMPO', time: '' });
  });
  it('octavos', () => {
    expect([formatEighths(3), formatEighths(8), formatEighths(11)]).toEqual(['3/8', '1', '1 3/8']);
  });
  it('desglose por escena', () => {
    expect(scenes.map((s) => s.number)).toEqual(['1', '2', '3']);
    expect(scenes[0].characters).toEqual(['ANA', 'JUAN']);
    expect(scenes[0].tags).toEqual({ animals: ['perro'], cast: ['ANA'] });
    expect(scenes.every((s) => s.eighths >= 1)).toBe(true);
  });
  it('personajes: diálogos, escenas y elenco que no habla', () => {
    const chars = characterReport(els, scenes, result);
    expect(chars.find((c) => c.name === 'ANA')).toMatchObject({ dialogues: 3, scenes: ['1', '2'] });
    expect(chars.find((c) => c.name === 'JUAN')).toMatchObject({ dialogues: 1, scenes: ['1'] });
    expect(chars.find((c) => c.name === 'MOZO')).toMatchObject({ dialogues: 0, scenes: ['3'] });
  });
  it('locaciones y día/noche', () => {
    const locs = locationReport(scenes);
    expect(locs.find((l) => l.location === 'CASA DE ANA')).toMatchObject({ scenes: ['1', '3'], times: ['NOCHE', 'DÍA'], intExt: ['INT'] });
    expect(timeReport(scenes).map((r) => [r.time, r.scenes])).toEqual([['DÍA', ['2', '3']], ['NOCHE', ['1']]]);
  });
  it('CSV con comillas y BOM', () => {
    const csv = toCSV({ title: 'x', columns: ['a', 'b'], rows: [['1, 2', 'di "hola"']] });
    expect(csv).toBe('﻿a,b\r\n"1, 2","di ""hola"""\r\n');
  });
});

describe('Compatibilidad con proyectos guardados antes de la fase 4', () => {
  it('normalizeProject completa los ajustes nuevos sin tocar el contenido', () => {
    const old = { id: 'p1', title: 'Viejo', elements: [{ id: 'a', type: 'scene', text: 'INT. A' }], settings: { pageSize: 'a4', language: 'en' }, titlePage: { title: 'Viejo' } } as never;
    const p = normalizeProject(old);
    expect(p.elements).toEqual([{ id: 'a', type: 'scene', text: 'INT. A' }]);
    expect(p.settings).toMatchObject({ pageSize: 'a4', language: 'en', revisionMode: false, revisionColor: 'blue', lockedNumbers: false });
  });
});

describe('carpetas y nube', () => {
  it('un guion sin texto se considera vacío (no se sube a Supabase)', () => {
    const blank = normalizeProject({ title: 'Sin título' });
    expect(isBlankProject(blank)).toBe(true);
    const written = normalizeProject({ title: 'Sin título', elements: [{ id: 'a', type: 'scene', text: 'INT. CASA - DÍA' }] });
    expect(isBlankProject(written)).toBe(false);
  });

  it('normalizeProject conserva la carpeta y no la inventa en proyectos viejos', () => {
    expect(normalizeProject({ title: 'Viejo' }).folderId).toBeUndefined();
    expect(normalizeProject({ title: 'Nuevo', folderId: 'f1' }).folderId).toBe('f1');
  });
});
