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

/** Canal en memoria entre varios "navegadores". Cada uno puede quedarse sin conexión y volver. */
function bus() {
  type P = { h: (e: string, d: Uint8Array) => void; c: () => void; t: CollabTransport; online: boolean };
  const peers: P[] = [];
  return {
    join(): CollabTransport {
      const peer: P = { h: () => {}, c: () => {}, t: null as unknown as CollabTransport, online: true };
      peer.t = {
        send: (e, d) => {
          if (!peer.online) return;
          peers.filter((p) => p !== peer && p.online).forEach((p) => p.h(e, d.slice()));
        },
        onMessage: (cb) => void (peer.h = cb),
        onConnect: (cb) => void (peer.c = cb),
        destroy: () => void peers.splice(peers.indexOf(peer), 1),
      };
      peers.push(peer);
      return peer.t;
    },
    connectAll: () => peers.forEach((p) => p.c()),
    setOnline(t: CollabTransport, online: boolean) {
      const p = peers.find((x) => x.t === t)!;
      p.online = online;
      if (online) p.c(); // al reconectar se vuelve a saludar (como hace el canal de Supabase)
    },
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
  const tA = b.join();
  const tB = b.join();
  const A = peer(state, tA, revA);
  const B = peer(state, tB, revB);
  b.connectAll();
  return { A, B, net: { offline: (p: Peer) => b.setOnline(p === A ? tA : tB, false), online: (p: Peer) => b.setOnline(p === A ? tA : tB, true) } };
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

describe('Sin conexión', () => {
  it('uno escribe sin red, el otro sigue escribiendo: al reconectar está todo (nada se pisa)', () => {
    const { A, B, net } = twoPeers([el('scene', 'INT. CASA - DÍA'), el('action', 'Ana entra.'), el('action', 'Suena el teléfono.')]);
    net.offline(B);
    typeAt(B, 2, ' Nadie atiende.');
    typeAt(A, 1, ' Se sienta.');
    typeAt(A, 1, ' Mira la puerta.');
    sync(A, B);
    expect(texts(A)).not.toEqual(texts(B));
    net.online(B);
    sync(A, B);
    expect(texts(A)).toEqual(texts(B));
    expect(texts(A)).toEqual(['scene:INT. CASA - DÍA', 'action:Ana entra. Se sienta. Mira la puerta.', 'action:Suena el teléfono. Nadie atiende.']);
  });
});

describe('Título, portada, ajustes y notas', () => {
  it('cada campo se mezcla por separado y las notas por escena', async () => {
    const { writeMeta, readMeta } = await import('../src/collab/meta');
    const project = { ...newProject('Original'), elements: [el('scene', 'INT. A')] };
    const state = Y.encodeStateAsUpdate(docFromElements(project));
    const docs = [new Y.Doc(), new Y.Doc()];
    docs.forEach((d) => Y.applyUpdate(d, state));
    writeMeta(docs[0], { titlePage: { ...project.titlePage, author: 'Lautaro' }, notes: { s1: 'Nota de A' } });
    writeMeta(docs[1], { titlePage: { ...project.titlePage, draftDate: 'Noviembre 2026' }, notes: { s2: 'Nota de B' } });
    writeMeta(docs[1], { settings: { ...project.settings, sceneNumbers: 'both' } });
    // Se intercambian los cambios (lo que haría el canal).
    const [u0, u1] = docs.map((d) => Y.encodeStateAsUpdate(d));
    Y.applyUpdate(docs[0], u1);
    Y.applyUpdate(docs[1], u0);
    const [m0, m1] = docs.map(readMeta);
    expect(m0).toEqual(m1);
    expect(m0.titlePage).toMatchObject({ author: 'Lautaro', draftDate: 'Noviembre 2026', title: 'Original' });
    expect(m0.notes).toEqual({ s1: 'Nota de A', s2: 'Nota de B' });
    expect(m0.settings?.sceneNumbers).toBe('both');
    expect(m0.title).toBe('Original');
  });

  it('avisa los cambios de otros, no los propios', async () => {
    const { writeMeta, onRemoteMeta } = await import('../src/collab/meta');
    const doc = docFromElements({ ...newProject('T'), elements: [el('scene', 'INT. A')] });
    const seen: string[] = [];
    const stop = onRemoteMeta(doc, (m) => seen.push(m.title ?? ''));
    writeMeta(doc, { title: 'Propio' });
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    writeMeta(other, { title: 'De otro' });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other), 'remoto');
    stop();
    expect(seen).toEqual(['De otro']);
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
  /** Copia local en memoria (en la app es IndexedDB): guarda cada cambio del documento. */
  const memoryCache = () => {
    let state: Uint8Array | null = null;
    return {
      attach: async (doc: Y.Doc) => {
        const had = !!state;
        if (state) Y.applyUpdate(doc, state);
        doc.on('update', (u: Uint8Array) => (state = state ? Y.mergeUpdates([state, u]) : u));
        return had;
      },
      detach: () => {},
    };
  };
  const offlineStore = () => ({
    get: async () => {
      throw new Error('sin conexión');
    },
    insertIfMissing: async () => {
      throw new Error('sin conexión');
    },
    put: async () => {
      throw new Error('sin conexión');
    },
  });
  const textOf = (doc: Y.Doc) => docToElements(yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(FRAGMENT), schema)).map((e) => e.text);

  it('dos personas que abren a la vez se quedan con el mismo documento (no se duplica el texto al mezclar)', async () => {
    const store = memoryStore(5);
    const [{ doc: a }, { doc: b }] = await Promise.all([loadSharedDoc(project(), store), loadSharedDoc(project(), store)]);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(textOf(a)).toEqual(['INT. CASA', 'Hola.']);
  });

  it('si el JSON se editó fuera del tiempo real, se aplica al documento compartido', async () => {
    const store = memoryStore();
    await loadSharedDoc(project({ updatedAt: 1000 }), store);
    const offline = project({ updatedAt: 2000, liveSavedAt: 1000, elements: [el('scene', 'INT. CASA'), el('action', 'Hola, editado sin conexión.')] });
    expect(textOf((await loadSharedDoc(offline, store)).doc)).toEqual(['INT. CASA', 'Hola, editado sin conexión.']);
  });

  it('si el JSON se guardó en vivo, no se aplica aunque su reloj vaya adelantado', async () => {
    const store = memoryStore();
    await loadSharedDoc(project({ updatedAt: 1000 }), store);
    const live = project({ updatedAt: 9_999_999, liveSavedAt: 9_999_999, elements: [el('scene', 'INT. CASA'), el('action', 'Versión vieja.')] });
    expect(textOf((await loadSharedDoc(live, store)).doc)).toEqual(['INT. CASA', 'Hola.']);
  });

  it('sin conexión y con copia local: se abre con la copia, en vivo', async () => {
    const store = memoryStore();
    const cache = memoryCache();
    await loadSharedDoc(project(), store, cache);
    const reopened = await loadSharedDoc(project(), offlineStore(), cache);
    expect(reopened.offline).toBe(true);
    expect(textOf(reopened.doc)).toEqual(['INT. CASA', 'Hola.']);
  });

  it('sin conexión y sin copia local: no se crea nada desde el JSON (se abre sin tiempo real)', async () => {
    await expect(loadSharedDoc(project(), offlineStore(), memoryCache())).rejects.toThrow();
  });

  it('lo escrito sin conexión se mezcla con lo de la nube al reabrir, sin duplicar', async () => {
    const store = memoryStore();
    const cache = memoryCache();
    // Abro con conexión (queda la copia local) y después escribo sin conexión.
    const { doc: mine } = await loadSharedDoc(project(), store, cache);
    const xml = mine.getXmlFragment(FRAGMENT);
    const action = xml.get(1) as Y.XmlElement;
    (action.get(0) as Y.XmlText).insert(5, ' Sin red.');
    // Mientras tanto, otra persona escribe en la nube.
    const { doc: theirs } = await loadSharedDoc(project(), store);
    ((theirs.getXmlFragment(FRAGMENT).get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(9, ' - NOCHE');
    await store.put('p1', Y.encodeStateAsUpdate(theirs), Date.now());
    // Reabro con conexión: copia local + nube.
    const { doc: merged, offline } = await loadSharedDoc(project(), store, cache);
    expect(offline).toBe(false);
    expect(textOf(merged)).toEqual(['INT. CASA - NOCHE', 'Hola. Sin red.']);
  });
});
