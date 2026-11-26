import * as Y from 'yjs';
import { fromBase64, toBase64 } from 'lib0/buffer';
import { IndexeddbPersistence } from 'y-indexeddb';
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { cloud } from '../storage/cloud';
import { docToElements, elementsToDoc, schema } from '../editor/schema';
import type { Project } from '../types';
import { CollabProvider } from './provider';
import { localTransport, supabaseTransport, type CollabTransport } from './transport';
import { userColor } from './presence';
import { hasMeta, readMeta, writeMeta, type SharedMeta } from './meta';

/** Nombre del fragmento de Yjs que contiene el guion (el documento de ProseMirror). */
export const FRAGMENT = 'script';

/** Dónde se guarda en la nube el estado compartido de cada guion (Yjs). */
export interface DocStore {
  get(id: string): Promise<{ state: Uint8Array; updatedAt: number } | null>;
  /** Guarda solo si todavía no hay nada (dos personas que abren a la vez se quedan con el mismo). */
  insertIfMissing(id: string, state: Uint8Array, updatedAt: number): Promise<void>;
  put(id: string, state: Uint8Array, updatedAt: number): Promise<void>;
}

/**
 * Copia del estado compartido en este navegador. Sirve para editar sin conexión: lo escrito queda en el
 * documento de Yjs y, al volver la red, se mezcla con lo de los demás en vez de pisarlo.
 */
export interface LocalDocCache {
  /** Conecta el documento a la copia local y carga lo que haya. Devuelve si había algo. */
  attach(doc: Y.Doc): Promise<boolean>;
  detach(): void;
}

/** Tabla `project_docs` de Supabase (supabase/realtime.sql). */
function cloudStore(): DocStore | null {
  if (!cloud) return null;
  const client = cloud;
  const table = () => client.from('project_docs');
  return {
    async get(id) {
      const { data, error } = await table().select('state,updated_at').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? { state: fromBase64(data.state as string), updatedAt: data.updated_at as number } : null;
    },
    async insertIfMissing(id, state, updatedAt) {
      const { error } = await table().upsert({ id, state: toBase64(state), updated_at: updatedAt }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    },
    async put(id, state, updatedAt) {
      const { error } = await table().upsert({ id, state: toBase64(state), updated_at: updatedAt });
      if (error) throw error;
    },
  };
}

/** Solo para probar en local: `sessionStorage['ampux.simulateOffline'] = '1'` deja ESTA pestaña sin conexión. */
export const simulatedOffline = () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ampux.simulateOffline') === '1';

/**
 * Para probar sin Supabase (`?collab=local`): el estado "de la nube" queda en localStorage, compartido entre pestañas.
 * Con `simulatedOffline()` la pestaña no llega a esta "nube".
 */
function localStore(): DocStore {
  const key = (id: string) => `ampux.ydoc.${id}`;
  const read = (id: string) => {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const { s, t } = JSON.parse(raw) as { s: string; t: number };
    return { state: fromBase64(s), updatedAt: t };
  };
  const write = (id: string, state: Uint8Array, updatedAt: number) => localStorage.setItem(key(id), JSON.stringify({ s: toBase64(state), t: updatedAt }));
  const offline = () => {
    if (simulatedOffline()) throw new Error('sin conexión (simulado)');
  };
  return {
    get: async (id) => (offline(), read(id)),
    insertIfMissing: async (id, state, updatedAt) => (offline(), void (read(id) ?? write(id, state, updatedAt))),
    put: async (id, state, updatedAt) => (offline(), write(id, state, updatedAt)),
  };
}

/** Base de IndexedDB propia de cada guion (`ampux-ydoc-<id>`), aparte de la base `ampux`. */
export const localDocName = (projectId: string) => `ampux-ydoc-${projectId}`;

function indexedDbCache(projectId: string): LocalDocCache {
  let persistence: IndexeddbPersistence | null = null;
  return {
    async attach(doc) {
      persistence = new IndexeddbPersistence(localDocName(projectId), doc);
      await persistence.whenSynced;
      return doc.store.clients.size > 0;
    },
    detach: () => void persistence?.destroy(),
  };
}

export const localCollabRequested = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('collab') === 'local';

const metaOf = (p: Project): SharedMeta => ({ title: p.title, titlePage: p.titlePage, settings: p.settings, notes: p.notes });

/** Documento de Yjs armado desde el JSON del guion (texto y metadatos). */
export function docFromElements(project: Project): Y.Doc {
  const doc = new Y.Doc();
  prosemirrorToYXmlFragment(elementsToDoc(project.elements), doc.getXmlFragment(FRAGMENT));
  writeMeta(doc, metaOf(project), null);
  return doc;
}

/** Texto y metadatos actuales del documento compartido, con el formato de Project. */
export function projectFromDoc(base: Project, doc: Y.Doc): Project {
  return { ...base, ...readMeta(doc), elements: docToElements(yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(FRAGMENT), schema)) };
}

export interface LoadedDoc {
  doc: Y.Doc;
  /** No se pudo leer la nube: se abrió con la copia local (se sincroniza al volver la conexión). */
  offline: boolean;
}

/**
 * Carga el estado compartido del guion:
 * 1. La copia de este navegador (lo escrito sin conexión), si hay.
 * 2. La de la nube. Si todavía no existe, se crea desde el JSON (o desde la copia local) con
 *    `insert … on conflict do nothing` y se vuelve a leer: quien abrió a la vez se queda con la misma. Si cada uno
 *    armara la suya desde el JSON, al mezclarlas el texto saldría duplicado.
 *    Sin conexión: se sigue con la copia local. Sin copia local, falla (y el editor abre sin tiempo real): nunca se
 *    crea el documento desde el JSON sin conexión, por el mismo motivo.
 * 3. Yjs mezcla las dos sin perder nada.
 * 4. Si el JSON se editó después fuera del tiempo real (con una versión vieja de la app, o sin conexión antes de que
 *    hubiera copia local), se aplica como una edición más. Los guardados en vivo no cuentan: comparar relojes de
 *    dos computadoras podría pisar cambios más nuevos.
 */
export async function loadSharedDoc(project: Project, store: DocStore, cache?: LocalDocCache): Promise<LoadedDoc> {
  const doc = new Y.Doc();
  const hasLocal = cache ? await cache.attach(doc) : false;

  let stored: { state: Uint8Array; updatedAt: number } | null;
  try {
    stored = await store.get(project.id);
    if (!stored) {
      const initial = hasLocal ? doc : docFromElements(project);
      await store.insertIfMissing(project.id, Y.encodeStateAsUpdate(initial), project.updatedAt);
      stored = await store.get(project.id);
      if (!stored) throw new Error('No se pudo guardar el documento compartido');
    }
  } catch (e) {
    if (hasLocal) return { doc, offline: true };
    cache?.detach();
    doc.destroy();
    throw e;
  }
  Y.applyUpdate(doc, stored.state, 'store');

  const editedOutside = project.liveSavedAt !== project.updatedAt;
  if (editedOutside && project.updatedAt > stored.updatedAt) {
    const fragment = doc.getXmlFragment(FRAGMENT);
    const current = docToElements(yXmlFragmentToProseMirrorRootNode(fragment, schema));
    if (JSON.stringify(current) !== JSON.stringify(project.elements)) {
      doc.transact(() => prosemirrorToYXmlFragment(elementsToDoc(project.elements), fragment));
    }
    writeMeta(doc, metaOf(project), null);
  }
  // Documentos de la etapa 1 (solo texto): se completan con los metadatos del JSON.
  if (!hasMeta(doc)) writeMeta(doc, metaOf(project), null);
  return { doc, offline: false };
}

export interface SharedSession {
  doc: Y.Doc;
  fragment: Y.XmlFragment;
  provider: CollabProvider;
  /** Se abrió sin conexión, con la copia local. */
  offline: boolean;
  /** Guarda ya el estado compartido en la nube (se guarda solo cada 3 s mientras hay cambios). */
  persist(): Promise<void>;
  close(): Promise<void>;
}

const PERSIST_MS = 3000;

/**
 * Abre el guion en modo tiempo real. Devuelve null si no se puede (sin Supabase, o sin conexión y sin copia local
 * en este navegador): en ese caso el editor funciona como siempre, solo con el JSON.
 */
export async function openShared(project: Project, username: string): Promise<SharedSession | null> {
  let store: DocStore | null = null;
  let transport: CollabTransport | null = null;
  if (cloud) {
    store = cloudStore();
    transport = supabaseTransport(project.id);
  } else if (localCollabRequested()) {
    store = localStore();
    transport = localTransport(project.id);
  }
  if (!store || !transport) return null;

  const cache = typeof indexedDB !== 'undefined' ? indexedDbCache(project.id) : undefined;
  let loaded: LoadedDoc;
  try {
    loaded = await loadSharedDoc(project, store, cache);
  } catch (e) {
    console.warn('AMPUX: sin tiempo real, se edita solo con la copia local', e);
    transport.destroy();
    return null;
  }
  const { doc, offline } = loaded;
  const s = store;
  const provider = new CollabProvider(doc, transport);
  provider.awareness.setLocalStateField('user', { name: username, color: userColor(username) });

  // Guardado en la nube: antes de escribir se mezcla con lo guardado, para no pisar cambios de alguien que no
  // llegaron por el canal (Yjs mezcla sin perder nada). Sin conexión se reintenta hasta que vuelva.
  let dirty = offline; // lo escrito sin conexión se sube apenas se pueda
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let closed = false;
  const persist = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    chain = chain.then(async () => {
      if (!dirty) return;
      dirty = false;
      try {
        const stored = await s.get(project.id);
        if (stored) Y.applyUpdate(doc, stored.state, 'store');
        await s.put(project.id, Y.encodeStateAsUpdate(doc), Date.now());
      } catch (e) {
        dirty = true;
        console.warn('AMPUX: no se pudo guardar el documento compartido (se reintenta)', e);
        if (!closed) timer ??= setTimeout(persist, PERSIST_MS * 5);
      }
    });
    return chain;
  };
  doc.on('update', (_u: Uint8Array, origin: unknown) => {
    if (origin === 'store') return;
    dirty = true;
    if (!closed) timer ??= setTimeout(persist, PERSIST_MS);
  });
  if (dirty) timer = setTimeout(persist, 0);
  const onOnline = () => void persist();
  window.addEventListener('online', onOnline);

  return {
    doc,
    fragment: doc.getXmlFragment(FRAGMENT),
    provider,
    offline,
    persist,
    async close() {
      provider.flush();
      await persist();
      closed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      provider.destroy();
      cache?.detach();
      doc.destroy();
    },
  };
}
