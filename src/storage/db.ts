import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, newId, newProject, type Project } from '../types';

interface AmpuxDB extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
}

export interface ProjectMeta {
  id: string;
  title: string;
  updatedAt: number;
  pageCount: number;
}

let dbPromise: Promise<IDBPDatabase<AmpuxDB>> | null = null;

function db() {
  dbPromise ??= openDB<AmpuxDB>('ampux', 1, {
    upgrade(database) {
      const store = database.createObjectStore('projects', { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
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

export async function listProjects(): Promise<ProjectMeta[]> {
  const all = await (await db()).getAll('projects');
  return all
    .map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt, pageCount: p.pageCount ?? 1 }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const p = await (await db()).get('projects', id);
  return p ? normalizeProject(p) : undefined;
}

export async function saveProject(project: Project): Promise<void> {
  await (await db()).put('projects', project);
}

export async function deleteProject(id: string): Promise<void> {
  await (await db()).delete('projects', id);
}

export async function duplicateProject(id: string, suffix: string): Promise<Project | undefined> {
  const p = await getProject(id);
  if (!p) return;
  const now = Date.now();
  const copy: Project = structuredClone({ ...p, id: newId(), title: `${p.title} ${suffix}`, createdAt: now, updatedAt: now });
  await saveProject(copy);
  return copy;
}
