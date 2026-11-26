import * as Y from 'yjs';
import { fromBase64, toBase64 } from 'lib0/buffer';
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { cloud } from '../storage/cloud';
import { docToElements, elementsToDoc, schema } from '../editor/schema';
import type { Project } from '../types';
import { CollabProvider } from './provider';
import { localTransport, supabaseTransport, type CollabTransport } from './transport';
import { userColor } from './presence';

/** Nombre del fragmento de Yjs que contiene el guion (el documento de ProseMirror). */
export const FRAGMENT = 'script';

/** Dónde se guarda el estado compartido de cada guion (Yjs). */
interface DocStore {
  get(id: string): Promise<{ state: Uint8Array; updatedAt: number } | null>;
  /** Guarda solo si todavía no hay nada (dos personas que abren a la vez se quedan con el mismo). */
  insertIfMissing(id: string, state: Uint8Array, updatedAt: number): Promise<void>;
  put(id: string, state: Uint8Array, updatedAt: number): Promise<void>;
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

/** Para probar sin Supabase (`?collab=local`): el estado queda en localStorage, compartido entre pestañas. */
function localStore(): DocStore {
  const key = (id: string) => `ampux.ydoc.${id}`;
  const read = (id: string) => {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const { s, t } = JSON.parse(raw) as { s: string; t: number };
    return { state: fromBase64(s), updatedAt: t };
  };
  const write = (id: string, state: Uint8Array, updatedAt: number) => localStorage.setItem(key(id), JSON.stringify({ s: toBase64(state), t: updatedAt }));
  return {
    get: async (id) => read(id),
    insertIfMissing: async (id, state, updatedAt) => void (read(id) ?? write(id, state, updatedAt)),
    put: async (id, state, updatedAt) => write(id, state, updatedAt),
  };
}

export const localCollabRequested = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('collab') === 'local';

/** Documento de Yjs armado desde los elementos del guion. */
export function docFromElements(project: Project): Y.Doc {
  const doc = new Y.Doc();
  prosemirrorToYXmlFragment(elementsToDoc(project.elements), doc.getXmlFragment(FRAGMENT));
  return doc;
}

/**
 * Carga el estado compartido del guion. Si todavía no existe, se crea desde el JSON y se guarda;
 * después se vuelve a leer, así quien abrió a la vez se queda con el mismo (si cada uno armara el suyo,
 * al mezclarlos el texto saldría duplicado). Si el JSON se editó después fuera del tiempo real (sin conexión
 * o con una versión vieja de la app), el documento compartido se actualiza a ese contenido, como una edición más.
 */
export async function loadSharedDoc(project: Project, store: DocStore): Promise<Y.Doc> {
  let stored = await store.get(project.id);
  if (!stored) {
    await store.insertIfMissing(project.id, Y.encodeStateAsUpdate(docFromElements(project)), project.updatedAt);
    stored = await store.get(project.id);
    if (!stored) throw new Error('No se pudo guardar el documento compartido');
  }
  const doc = new Y.Doc();
  Y.applyUpdate(doc, stored.state);
  const fragment = doc.getXmlFragment(FRAGMENT);
  // Solo si la última edición del JSON se hizo fuera del tiempo real; si no, el documento compartido ya la tiene
  // (y comparar relojes de dos computadoras distintas podría pisar cambios más nuevos).
  const editedOffline = project.liveSavedAt !== project.updatedAt;
  if (editedOffline && project.updatedAt > stored.updatedAt) {
    const current = docToElements(yXmlFragmentToProseMirrorRootNode(fragment, schema));
    if (JSON.stringify(current) !== JSON.stringify(project.elements)) {
      doc.transact(() => prosemirrorToYXmlFragment(elementsToDoc(project.elements), fragment));
    }
  }
  return doc;
}

export interface SharedSession {
  doc: Y.Doc;
  fragment: Y.XmlFragment;
  provider: CollabProvider;
  /** Guarda ya el estado compartido (se guarda solo cada 3 s mientras hay cambios). */
  persist(): Promise<void>;
  close(): Promise<void>;
}

const PERSIST_MS = 3000;

/**
 * Abre el guion en modo tiempo real. Devuelve null si no se puede (sin Supabase, sin conexión o sin sesión):
 * en ese caso el editor funciona como siempre, solo con la copia local.
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

  let doc: Y.Doc;
  try {
    doc = await loadSharedDoc(project, store);
  } catch (e) {
    console.warn('AMPUX: sin tiempo real, se edita solo con la copia local', e);
    transport.destroy();
    return null;
  }
  const s = store;
  const provider = new CollabProvider(doc, transport);
  provider.awareness.setLocalStateField('user', { name: username, color: userColor(username) });

  // Guardado del estado compartido: antes de escribir se mezcla con lo guardado, para no pisar cambios
  // de alguien que no llegaron por el canal (Yjs mezcla sin perder nada).
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
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
        console.warn('AMPUX: no se pudo guardar el documento compartido', e);
        timer ??= setTimeout(persist, PERSIST_MS * 5);
      }
    });
    return chain;
  };
  doc.on('update', (_u: Uint8Array, origin: unknown) => {
    if (origin === 'store') return;
    dirty = true;
    timer ??= setTimeout(persist, PERSIST_MS);
  });

  return {
    doc,
    fragment: doc.getXmlFragment(FRAGMENT),
    provider,
    persist,
    async close() {
      provider.flush();
      await persist();
      provider.destroy();
      doc.destroy();
    },
  };
}
