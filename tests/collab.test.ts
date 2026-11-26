// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { createEditor } from '../src/editor';
import { docToElements, schema } from '../src/editor/schema';
import { CollabProvider } from '../src/collab/provider';
import { FRAGMENT, docFromElements, loadSharedDoc } from '../src/collab/shared';
import type { CollabTransport } from '../src/collab/transport';
import { DEFAULT_SETTINGS, newProject, type Project, type ProjectSettings, type RevisionColor, type ScriptElement } from '../src/types';

/** Canal en memoria entre varios "navegadores". */
function bus() {
  const peers: { h: (e: string, d: Uint8Array) => void; c: () => void; t: CollabTransport }[] = [];
  return {
    join(): CollabTransport {
      const peer = { h: (_e: string, _d: Uint8Array) => {}, c: () => {}, t: null as unknown as CollabTransport };
      peer.t = {
        send: (e, d) => peers.filter((p) => p !== peer).forEach((p) => p.h(e, d.slice())),
        onMessage: (cb) => void (peer.h = cb),
        onConnect: (cb) => void (peer.c = cb),
        destroy: () => void peers.splice(peers.indexOf(peer), 1),
      };
      peers.push(peer);
      return peer.t;
    },
    connectAll: () => peers.forEach((p) => p.c()),
  };
}

let n = 0;
const el = (type: ScriptElement['type'], text: string, extra: Partial<ScriptElement> = {}): ScriptElement => ({ id: `c${n++}`, type, text, ...extra });

interface Peer {
  view: EditorView;
  provider: CollabProvider;
  doc: Y.Doc;
  elements: () => ScriptElement[];
  settings: ProjectSettings;
}
const open: Peer[] = [];
afterEach(() => {
  for (const p of open.splice(0)) {
    p.view.destroy();
    p.provider.destroy();
  }
});

/** Un navegador con el editor completo de AMPUX, conectado al canal. */
function peer(state: Uint8Array, transport: CollabTransport, revision: RevisionColor | null = null): Peer {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  const provider = new CollabProvider(doc, transport);
  const settings = { ...DEFAULT_SETTINGS, revisionMode: !!revision, revisionColor: revision ?? 'blue' };
  const mount = document.createElement('div');
  document.body.append(mount);
  const view = createEditor(
    mount,
    [],
    {
      getSettings: () => settings,
      getMode: () => 'draft',
      getLang: () => 'es',
      typeLabel: (t) => t,
      tagLabel: (c) => c,
      removeTagLabel: () => 'x',
      getBreakdown: () => false,
      getHighlighter: () => false,
      toggleHighlighter: () => {},
      exitHighlighter: () => {},
      getRevision: () => revision,
      onChange: () => {},
      onPaginate: () => {},
      onSelection: () => {},
      onSave: () => {},
      onFind: () => {},
    },
    { fragment: doc.getXmlFragment(FRAGMENT), awareness: provider.awareness },
  );
  const p = { view, provider, doc, settings, elements: () => docToElements(view.state.doc) };
  open.push(p);
  return p;
}

/** Escribe al final del elemento `index`, como si fuera el teclado. */
function typeAt(p: Peer, index: number, text: string) {
  let pos = 0;
  p.view.state.doc.forEach((node, offset, i) => {
    if (i === index) pos = offset + 1 + node.content.size;
  });
  p.view.dispatch(p.view.state.tr.setSelection(TextSelection.create(p.view.state.doc, pos)));
  for (const ch of text) p.view.dispatch(p.view.state.tr.insertText(ch));
}
const sync = (...peers: Peer[]) => peers.forEach((p) => p.provider.flush());
const texts = (p: Peer) => p.elements().map((e) => `${e.type}:${e.text}`);

function twoPeers(elements: ScriptElement[], revA: RevisionColor | null = null, revB: RevisionColor | null = null) {
  const project = { ...newProject('Prueba'), elements };
  const state = Y.encodeStateAsUpdate(docFromElements(project));
  const b = bus();
  const A = peer(state, b.join(), revA);
  const B = peer(state, b.join(), revB);
  b.connectAll();
  return { A, B };
}

describe('Tiempo real', () => {
  it('lo que escribe uno aparece en el otro', () => {
    const { A, B } = twoPeers([el('scene', 'INT. CASA - DÍA'), el('action', 'Ana entra.')]);
    typeAt(A, 1, ' Se sienta.');
    sync(A);
    expect(texts(B)).toEqual(['scene:INT. CASA - DÍA', 'action:Ana entra. Se sienta.']);
  });

  it('dos personas escribiendo a la vez en lugares distintos: no se pierde nada', () => {
    const { A, B } = twoPeers([el('scene', 'INT. CASA - DÍA'), el('action', 'Ana entra.'), el('action', 'Suena el teléfono.')]);
    typeAt(A, 1, ' Se sienta.');
    typeAt(B, 2, ' Nadie atiende.');
    sync(A, B);
    expect(texts(A)).toEqual(texts(B));
    expect(texts(A)).toEqual(['scene:INT. CASA - DÍA', 'action:Ana entra. Se sienta.', 'action:Suena el teléfono. Nadie atiende.']);
  });

  it('en el mismo elemento a la vez también se mezclan', () => {
    const { A, B } = twoPeers([el('action', 'Ana entra.')]);
    typeAt(A, 0, ' Uno.');
    typeAt(B, 0, ' Dos.');
    sync(A, B);
    expect(texts(A)).toEqual(texts(B));
    expect(A.elements()[0].text).toMatch(/^Ana entra\.( Uno\.| Dos\.){2}$/);
  });

  it('“INT.” convierte en escena una sola vez (no se duplica el elemento)', () => {
    const { A, B } = twoPeers([el('scene', 'INT. CASA - DÍA'), el('action', '')]);
    typeAt(A, 1, 'EXT. CALLE');
    sync(A, B);
    expect(texts(A)).toEqual(['scene:INT. CASA - DÍA', 'scene:EXT. CALLE']);
    expect(texts(B)).toEqual(texts(A));
    const ids = B.elements().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Enter en un navegador: el elemento nuevo tiene id único en los dos', () => {
    const { A, B } = twoPeers([el('action', 'Una línea.')]);
    typeAt(A, 0, '');
    A.view.dispatch(A.view.state.tr.split(A.view.state.selection.from));
    typeAt(A, 1, 'Otra.');
    sync(A, B);
    const ids = B.elements().map((e) => e.id);
    expect(ids.length).toBe(2);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(2);
    expect(A.elements().map((e) => e.id)).toEqual(ids);
  });

  it('el modo revisión de cada uno marca solo sus propios cambios', () => {
    const { A, B } = twoPeers([el('action', 'Uno.'), el('action', 'Dos.')], null, 'pink');
    typeAt(A, 0, ' (cambio de A)');
    sync(A, B);
    expect(B.elements().map((e) => e.revision ?? null)).toEqual([null, null]);
    typeAt(B, 1, ' (cambio de B)');
    sync(A, B);
    expect(A.elements().map((e) => e.revision ?? null)).toEqual([null, 'pink']);
  });

  it('⌘Z deshace solo lo propio', async () => {
    const { A, B } = twoPeers([el('action', 'Ana entra.'), el('action', 'Suena el teléfono.')]);
    typeAt(A, 0, ' A');
    sync(A);
    // El historial de Yjs agrupa lo escrito en menos de medio segundo.
    await new Promise((r) => setTimeout(r, 600));
    typeAt(B, 1, ' B');
    sync(B);
    const { undoCommand } = await import('y-prosemirror');
    undoCommand(B.view.state, B.view.dispatch);
    sync(B);
    expect(texts(A)).toEqual(['action:Ana entra. A', 'action:Suena el teléfono.']);
    expect(texts(B)).toEqual(texts(A));
  });

  it('negrita, resaltado y etiquetas superpuestas viajan intactos', () => {
    const els = [
      el('action', 'Ana toma el revólver.', {
        styles: [{ style: 'bold', from: 0, to: 3 }],
        highlights: [{ from: 12, to: 20 }],
        tags: [
          { category: 'props', from: 12, to: 20 },
          { category: 'sfx', from: 12, to: 20 },
        ],
      }),
    ];
    const { B } = twoPeers(els);
    const got = B.elements()[0];
    expect(got.styles).toEqual(els[0].styles);
    expect(got.highlights).toEqual(els[0].highlights);
    expect([...(got.tags ?? [])].sort((a, b) => a.category.localeCompare(b.category))).toEqual(els[0].tags);
  });
});

describe('Estado compartido guardado', () => {
  const memoryStore = (delay = 0) => {
    const rows = new Map<string, { state: Uint8Array; updatedAt: number }>();
    const wait = () => new Promise((r) => setTimeout(r, delay));
    return {
      rows,
      get: async (id: string) => (await wait(), rows.get(id) ?? null),
      insertIfMissing: async (id: string, state: Uint8Array, updatedAt: number) => {
        await wait();
        if (!rows.has(id)) rows.set(id, { state, updatedAt });
      },
      put: async (id: string, state: Uint8Array, updatedAt: number) => void rows.set(id, { state, updatedAt }),
    };
  };
  const project = (extra: Partial<Project> = {}): Project => ({ ...newProject('P'), id: 'p1', elements: [el('scene', 'INT. CASA'), el('action', 'Hola.')], ...extra });
  const textOf = (doc: Y.Doc) => docToElements(yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(FRAGMENT), schema)).map((e) => e.text);

  it('dos personas que abren a la vez se quedan con el mismo documento (no se duplica el texto al mezclar)', async () => {
    const store = memoryStore(5);
    const [a, b] = await Promise.all([loadSharedDoc(project(), store), loadSharedDoc(project(), store)]);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(textOf(a)).toEqual(['INT. CASA', 'Hola.']);
  });

  it('si el JSON se editó fuera del tiempo real, se aplica al documento compartido', async () => {
    const store = memoryStore();
    await loadSharedDoc(project({ updatedAt: 1000 }), store);
    const offline = project({ updatedAt: 2000, liveSavedAt: 1000, elements: [el('scene', 'INT. CASA'), el('action', 'Hola, editado sin conexión.')] });
    expect(textOf(await loadSharedDoc(offline, store))).toEqual(['INT. CASA', 'Hola, editado sin conexión.']);
  });

  it('si el JSON se guardó en vivo, no se aplica aunque su reloj vaya adelantado', async () => {
    const store = memoryStore();
    await loadSharedDoc(project({ updatedAt: 1000 }), store);
    const live = project({ updatedAt: 9_999_999, liveSavedAt: 9_999_999, elements: [el('scene', 'INT. CASA'), el('action', 'Versión vieja.')] });
    expect(textOf(await loadSharedDoc(live, store))).toEqual(['INT. CASA', 'Hola.']);
  });
});
