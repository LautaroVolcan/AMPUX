import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, newId, newProject, type Folder, type Project, type Snapshot } from '../types';
import { cloud } from './cloud';

interface AmpuxDB extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
  snapshots: { key: string; value: Snapshot; indexes: { projectId: string } };
  folders: { key: string; value: Folder };
}

export interface ProjectMeta {
  id: string;
  title: string;
  updatedAt: number;
  pageCount: number;
  folderId?: string;
}

let dbPromise: Promise<IDBPDatabase<AmpuxDB>> | null = null;

function db() {
  // Versión 2 agrega el historial y la 3 las carpetas. Las migraciones solo suman almacenes: nunca tocan los proyectos.
  dbPromise ??= openDB<AmpuxDB>('ampux', 3, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const store = database.createObjectStore('projects', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (oldVersion < 2) {
        const snaps = database.createObjectStore('snapshots', { keyPath: 'id' });
        snaps.createIndex('projectId', 'projectId');
      }
      if (oldVersion < 3) {
        database.createObjectStore('folders', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

/** Completa campos faltantes de proyectos viejos o importados. */
export function normalizeProject(p: Partial<Project>): Project {
  const base = newProject(p.title ?? 'Sin título');
  return {
    ...base,
    ...p,
    id: p.id ?? base.id,
    titlePage: { ...base.titlePage, ...p.titlePage },
    settings: { ...DEFAULT_SETTINGS, ...p.settings },
    notes: p.notes ?? {},
    elements: p.elements?.length ? p.elements : base.elements,
  } as Project;
}

/** Un guion sin ningún texto escrito. */
export function isBlankProject(p: Project): boolean {
  return p.elements.every((e) => !e.text.trim());
}

const toMeta = (p: Project): ProjectMeta => ({
  id: p.id,
  title: p.title,
  updatedAt: p.updatedAt,
  pageCount: p.pageCount ?? 1,
  folderId: p.folderId,
});

// --- Estado de la sincronización con Supabase ---
// 'off': sin Supabase configurado. 'pending': hay cambios esperando subirse. 'error': no se pudo subir (quedan en el navegador).

export type SyncStatus = 'off' | 'ok' | 'pending' | 'error';
let status: SyncStatus = cloud ? 'ok' : 'off';
const listeners = new Set<(s: SyncStatus) => void>();

export const getSyncStatus = () => status;
export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setStatus(s: SyncStatus) {
  if (!cloud || s === status) return;
  status = s;
  listeners.forEach((fn) => fn(s));
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// --- Subida de proyectos ---
// Cada guardado deja el proyecto en una cola; se sube a lo sumo cada 2 s y siempre en orden.

const pending = new Map<string, Project>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();

function queuePush(p: Project) {
  if (!cloud) return;
  pending.set(p.id, p);
  // Sin conexión se sigue mostrando "guardado en este equipo"; el reintento ya está programado.
  if (status !== 'error') setStatus('pending');
  pushTimer ??= setTimeout(() => void flushPushes(), 2000);
}

/** Sube ya todo lo que está en cola. */
export function flushPushes(): Promise<void> {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  chain = chain.then(async () => {
    if (!cloud || !pending.size) return;
    const batch = [...pending.values()];
    pending.clear();
    try {
      check(
        await cloud.from('projects').upsert(
          batch.map((p) => ({
            id: p.id,
            title: p.title,
            folder_id: p.folderId ?? null,
            page_count: p.pageCount ?? 1,
            created_at: p.createdAt,
            updated_at: p.updatedAt,
            deleted: false,
            data: p,
          })),
        ),
      );
      if (!pending.size) setStatus('ok');
    } catch (e) {
      console.warn('AMPUX: no se pudo subir a Supabase', e);
      for (const p of batch) if (!pending.has(p.id)) pending.set(p.id, p);
      setStatus('error');
      pushTimer ??= setTimeout(() => void flushPushes(), 15000);
    }
  });
  return chain;
}

// --- Proyectos ---

async function removeLocal(id: string) {
  const database = await db();
  pending.delete(id);
  await database.delete('projects', id);
  const snaps = await database.getAllKeysFromIndex('snapshots', 'projectId', id);
  await Promise.all(snaps.map((k) => database.delete('snapshots', k)));
}

interface ProjectRow {
  id: string;
  title: string;
  folder_id: string | null;
  page_count: number;
  updated_at: number;
  deleted: boolean;
}

/**
 * Lista los guiones. Con Supabase, la lista sale de la nube; los guiones que solo están en este navegador
 * (o que tienen cambios más nuevos) se suben. Los que solo están acá y no tienen texto se descartan.
 */
export async function listProjects(): Promise<ProjectMeta[]> {
  const locals = await (await db()).getAll('projects');
  const sort = (list: ProjectMeta[]) => list.sort((a, b) => b.updatedAt - a.updatedAt);
  if (!cloud) return sort(locals.map(toMeta));
  try {
    const rows = check(await cloud.from('projects').select('id,title,folder_id,page_count,updated_at,deleted')) as ProjectRow[];
    const remote = new Map(rows.map((r) => [r.id, r]));
    const metas = new Map<string, ProjectMeta>();
    for (const r of rows) {
      if (!r.deleted) {
        metas.set(r.id, { id: r.id, title: r.title, updatedAt: r.updated_at, pageCount: r.page_count, folderId: r.folder_id ?? undefined });
      }
    }
    for (const p of locals) {
      const r = remote.get(p.id);
      if (!r && isBlankProject(p)) await removeLocal(p.id);
      else if (!r || p.updatedAt > r.updated_at) {
        queuePush(p);
        metas.set(p.id, toMeta(p));
      } else if (r.deleted) await removeLocal(p.id);
    }
    if (!pending.size) setStatus('ok');
    void flushPushes();
    void uploadLocalSnapshots();
    return sort([...metas.values()]);
  } catch (e) {
    console.warn('AMPUX: sin conexión con Supabase', e);
    setStatus('error');
    return sort(locals.map(toMeta));
  }
}

/** Abre un guion: usa la copia más nueva entre la del navegador y la de la nube. */
export async function getProject(id: string): Promise<Project | undefined> {
  const database = await db();
  const raw = await database.get('projects', id);
  const local = raw ? normalizeProject(raw) : undefined;
  if (!cloud) return local;
  try {
    const row = check(await cloud.from('projects').select('data,updated_at,deleted').eq('id', id).maybeSingle()) as {
      data: Project;
      updated_at: number;
      deleted: boolean;
    } | null;
    if (!pending.size) setStatus('ok');
    if (local && (!row || local.updatedAt > row.updated_at)) {
      queuePush(local);
      return local;
    }
    if (!row || row.deleted) {
      if (local) await removeLocal(id);
      return undefined;
    }
    const p = normalizeProject(row.data);
    await database.put('projects', p);
    return p;
  } catch (e) {
    console.warn('AMPUX: sin conexión con Supabase', e);
    setStatus('error');
    return local;
  }
}

export async function saveProject(project: Project): Promise<void> {
  await (await db()).put('projects', project);
  queuePush(project);
}

export async function deleteProject(id: string): Promise<void> {
  await removeLocal(id);
  if (!cloud) return;
  try {
    check(await cloud.from('projects').update({ deleted: true, updated_at: Date.now() }).eq('id', id));
  } catch (e) {
    console.warn('AMPUX: no se pudo borrar en Supabase', e);
    setStatus('error');
  }
}

export async function moveProject(id: string, folderId: string | undefined): Promise<void> {
  const p = await getProject(id);
  if (!p || p.folderId === folderId) return;
  await saveProject({ ...p, folderId, updatedAt: Date.now() });
  await flushPushes();
}

export async function duplicateProject(id: string, suffix: string): Promise<Project | undefined> {
  const p = await getProject(id);
  if (!p) return;
  const now = Date.now();
  const copy: Project = structuredClone({ ...p, id: newId(), title: `${p.title} ${suffix}`, createdAt: now, updatedAt: now });
  await saveProject(copy);
  await flushPushes();
  return copy;
}

// --- Carpetas ---

interface FolderRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  deleted: boolean;
}

const folderRow = (f: Folder, deleted = false): FolderRow => ({
  id: f.id,
  name: f.name,
  created_at: f.createdAt,
  updated_at: f.updatedAt,
  deleted,
});

export async function listFolders(): Promise<Folder[]> {
  const database = await db();
  const locals = await database.getAll('folders');
  const sort = (list: Folder[]) => list.sort((a, b) => a.name.localeCompare(b.name));
  if (!cloud) return sort(locals);
  try {
    const rows = check(await cloud.from('folders').select('*')) as FolderRow[];
    const remote = new Map(rows.map((r) => [r.id, r]));
    const result = new Map<string, Folder>();
    for (const r of rows) {
      if (!r.deleted) result.set(r.id, { id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at });
    }
    const toPush: FolderRow[] = [];
    for (const f of locals) {
      const r = remote.get(f.id);
      if (!r || f.updatedAt > r.updated_at) {
        toPush.push(folderRow(f));
        result.set(f.id, f);
      } else if (r.deleted) await database.delete('folders', f.id);
    }
    if (toPush.length) check(await cloud.from('folders').upsert(toPush));
    await Promise.all([...result.values()].map((f) => database.put('folders', f)));
    return sort([...result.values()]);
  } catch (e) {
    console.warn('AMPUX: sin conexión con Supabase', e);
    setStatus('error');
    return sort(locals);
  }
}

export async function saveFolder(folder: Folder): Promise<void> {
  await (await db()).put('folders', folder);
  if (!cloud) return;
  try {
    check(await cloud.from('folders').upsert(folderRow(folder)));
  } catch (e) {
    console.warn('AMPUX: no se pudo subir la carpeta', e);
    setStatus('error');
  }
}

/** Borra la carpeta; sus guiones pasan a la raíz. */
export async function deleteFolder(folder: Folder): Promise<void> {
  const inside = (await listProjects()).filter((p) => p.folderId === folder.id);
  for (const p of inside) await moveProject(p.id, undefined);
  await (await db()).delete('folders', folder.id);
  if (!cloud) return;
  try {
    check(await cloud.from('folders').upsert(folderRow({ ...folder, updatedAt: Date.now() }, true)));
  } catch (e) {
    console.warn('AMPUX: no se pudo borrar la carpeta en Supabase', e);
    setStatus('error');
  }
}

// --- Historial de versiones ---

interface SnapshotRow {
  id: string;
  project_id: string;
  name: string;
  created_at: number;
  page_count: number;
  deleted: boolean;
  data?: Project;
}

const snapshotRow = (s: Snapshot): SnapshotRow => ({
  id: s.id,
  project_id: s.projectId,
  name: s.name,
  created_at: s.createdAt,
  page_count: s.pageCount,
  deleted: false,
  data: s.project,
});

export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  const database = await db();
  const locals = await database.getAllFromIndex('snapshots', 'projectId', projectId);
  const sort = (list: Snapshot[]) => list.sort((a, b) => b.createdAt - a.createdAt);
  if (!cloud) return sort(locals);
  try {
    const rows = check(
      await cloud.from('snapshots').select('id,project_id,name,created_at,page_count,deleted').eq('project_id', projectId),
    ) as SnapshotRow[];
    const remote = new Map(rows.map((r) => [r.id, r]));
    const result = new Map<string, Snapshot>();
    for (const s of locals) {
      const r = remote.get(s.id);
      if (r?.deleted) await database.delete('snapshots', s.id);
      else result.set(s.id, s);
    }
    const toPush = locals.filter((s) => !remote.has(s.id)).map(snapshotRow);
    if (toPush.length) check(await cloud.from('snapshots').upsert(toPush));
    const missing = rows.filter((r) => !r.deleted && !result.has(r.id)).map((r) => r.id);
    if (missing.length) {
      const full = check(await cloud.from('snapshots').select('*').in('id', missing)) as SnapshotRow[];
      for (const r of full) {
        const s: Snapshot = {
          id: r.id,
          projectId: r.project_id,
          name: r.name,
          createdAt: r.created_at,
          pageCount: r.page_count,
          project: normalizeProject(r.data!),
        };
        await database.put('snapshots', s);
        result.set(s.id, s);
      }
    }
    return sort([...result.values()]);
  } catch (e) {
    console.warn('AMPUX: sin conexión con Supabase', e);
    setStatus('error');
    return sort(locals);
  }
}

/** Sube una vez por sesión las versiones que solo están en este navegador (por ejemplo, las de antes de Supabase). */
let snapshotsUploaded = false;
async function uploadLocalSnapshots() {
  if (!cloud || snapshotsUploaded) return;
  snapshotsUploaded = true;
  try {
    const locals = await (await db()).getAll('snapshots');
    if (!locals.length) return;
    const rows = check(await cloud.from('snapshots').select('id').in('id', locals.map((s) => s.id))) as { id: string }[];
    const known = new Set(rows.map((r) => r.id));
    const toPush = locals.filter((s) => !known.has(s.id)).map(snapshotRow);
    if (toPush.length) check(await cloud.from('snapshots').upsert(toPush));
  } catch (e) {
    console.warn('AMPUX: no se pudieron subir las versiones', e);
    snapshotsUploaded = false;
  }
}

export async function saveSnapshot(project: Project, name: string): Promise<Snapshot> {
  const snap: Snapshot = {
    id: newId(),
    projectId: project.id,
    name,
    createdAt: Date.now(),
    pageCount: project.pageCount ?? 1,
    project: structuredClone(project),
  };
  await (await db()).put('snapshots', snap);
  if (cloud) {
    try {
      check(await cloud.from('snapshots').upsert(snapshotRow(snap)));
    } catch (e) {
      // Queda en el navegador; se sube la próxima vez que se abra el historial.
      console.warn('AMPUX: no se pudo subir la versión', e);
      setStatus('error');
    }
  }
  return snap;
}

export async function deleteSnapshot(id: string): Promise<void> {
  await (await db()).delete('snapshots', id);
  if (!cloud) return;
  try {
    check(await cloud.from('snapshots').update({ deleted: true }).eq('id', id));
  } catch (e) {
    console.warn('AMPUX: no se pudo borrar la versión en Supabase', e);
    setStatus('error');
  }
}
