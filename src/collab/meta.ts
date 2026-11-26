import * as Y from 'yjs';
import type { Project, ProjectSettings, TitlePage } from '../types';

/**
 * Título, portada, ajustes y notas del guion, en el mismo Y.Doc que el texto (mapa `meta`).
 * Cada campo es independiente: si una persona cambia la fecha de la portada y otra el autor, quedan los dos.
 * Las notas van por escena. Dentro de un mismo campo gana el último (dos personas escribiendo la misma nota
 * a la vez es raro; el texto del guion sí se mezcla letra por letra).
 */
export const META = 'meta';

/** Origen de los cambios hechos desde este navegador (los demás orígenes son remotos o del estado guardado). */
export const LOCAL_META = Symbol('ampux-meta');

export type SharedMeta = Pick<Project, 'title' | 'titlePage' | 'settings' | 'notes'>;
export const META_KEYS = ['title', 'titlePage', 'settings', 'notes'] as const;

const meta = (doc: Y.Doc) => doc.getMap<unknown>(META);

function subMap(doc: Y.Doc, key: 'titlePage' | 'settings' | 'notes'): Y.Map<unknown> {
  const m = meta(doc);
  let sub = m.get(key);
  if (!(sub instanceof Y.Map)) {
    sub = new Y.Map<unknown>();
    m.set(key, sub);
  }
  return sub as Y.Map<unknown>;
}

/** ¿El documento ya tiene metadatos? (Los documentos de la etapa 1 no los tienen.) */
export function hasMeta(doc: Y.Doc): boolean {
  return meta(doc).has('title');
}

/** Lee lo que haya en el documento (los campos que falten no se devuelven). */
export function readMeta(doc: Y.Doc): Partial<SharedMeta> {
  const m = meta(doc);
  const out: Partial<SharedMeta> = {};
  if (typeof m.get('title') === 'string') out.title = m.get('title') as string;
  for (const key of ['titlePage', 'settings', 'notes'] as const) {
    const sub = m.get(key);
    if (sub instanceof Y.Map) (out as Record<string, unknown>)[key] = sub.toJSON();
  }
  return out;
}

/** Copia a un Y.Map solo lo que cambió (y borra lo que ya no está). */
function syncMap(target: Y.Map<unknown>, value: Record<string, unknown>) {
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (JSON.stringify(target.get(k)) !== JSON.stringify(v)) target.set(k, v);
  }
  for (const k of [...target.keys()]) if (!(k in value) || value[k] === undefined) target.delete(k);
}

/** Escribe los campos que cambiaron. */
export function writeMeta(doc: Y.Doc, patch: Partial<SharedMeta>, origin: unknown = LOCAL_META) {
  doc.transact(() => {
    const m = meta(doc);
    if (patch.title !== undefined && m.get('title') !== patch.title) m.set('title', patch.title);
    if (patch.titlePage) syncMap(subMap(doc, 'titlePage'), patch.titlePage as TitlePage & Record<string, unknown>);
    if (patch.settings) syncMap(subMap(doc, 'settings'), patch.settings as ProjectSettings & Record<string, unknown>);
    if (patch.notes) syncMap(subMap(doc, 'notes'), patch.notes);
  }, origin);
}

/** Escucha los cambios de metadatos que no hizo este navegador. */
export function onRemoteMeta(doc: Y.Doc, cb: (meta: Partial<SharedMeta>) => void): () => void {
  const m = meta(doc);
  const handler = (_events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
    if (tr.origin !== LOCAL_META) cb(readMeta(doc));
  };
  m.observeDeep(handler);
  return () => m.unobserveDeep(handler);
}
