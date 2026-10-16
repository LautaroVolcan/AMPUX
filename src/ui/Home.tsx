import { useEffect, useState, type DragEvent } from 'react';
import { useT } from '../i18n';
import {
  deleteFolder,
  deleteProject,
  duplicateProject,
  flushPushes,
  getProject,
  listFolders,
  listProjects,
  moveProject,
  saveFolder,
  saveProject,
  type ProjectMeta,
} from '../storage/db';
import { newId, newProject, type Folder } from '../types';
import { fileToProject, IMPORT_ACCEPT, pickFile } from './files';
import { Icon } from './icons';

function formatDate(ts: number, lang: string) {
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ts);
}

// Carpeta abierta: se recuerda al volver de un guion.
let lastFolder: string | null = null;

const DRAG_TYPE = 'application/x-ampux-project';

export function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderIdState] = useState<string | null>(lastFolder);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const setFolderId = (id: string | null) => {
    lastFolder = id;
    setFolderIdState(id);
  };

  const refresh = async () => {
    const [p, f] = await Promise.all([listProjects(), listFolders()]);
    setProjects(p);
    setFolders(f);
  };
  useEffect(() => {
    refresh();
    // Al volver a la pestaña, traer lo que otros hayan cambiado.
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = () => (setMenu(null), setMoving(null));
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const folder = folders.find((f) => f.id === folderId) ?? null;
  // Si la carpeta abierta ya no existe (otro la borró), volver a la raíz.
  useEffect(() => {
    if (folderId && projects && !folder) setFolderId(null);
  }, [folderId, projects, folder]);

  const visible = projects?.filter((p) => (p.folderId ?? null) === (folder?.id ?? null) || (!folder && !folders.some((f) => f.id === p.folderId)));
  const countIn = (id: string) => projects?.filter((p) => p.folderId === id).length ?? 0;

  const create = async () => {
    const p = newProject(t.home.untitled);
    p.titlePage.credit = t.home.defaultCredit;
    p.folderId = folder?.id;
    await saveProject(p);
    onOpen(p.id);
  };

  const importFile = async () => {
    const file = await pickFile(IMPORT_ACCEPT);
    if (!file) return;
    try {
      const p = await fileToProject(file);
      p.folderId = folder?.id;
      await saveProject(p);
      onOpen(p.id);
    } catch (e) {
      console.error(e);
      alert(t.importMenu.error);
    }
  };

  const rename = async (id: string, title: string) => {
    setRenaming(null);
    const p = await getProject(id);
    if (!p || !title.trim() || title === p.title) return;
    await saveProject({ ...p, title: title.trim(), updatedAt: Date.now() });
    await flushPushes();
    refresh();
  };

  const createFolder = async (name: string) => {
    setCreatingFolder(false);
    if (!name.trim()) return;
    const now = Date.now();
    await saveFolder({ id: newId(), name: name.trim(), createdAt: now, updatedAt: now });
    refresh();
  };

  const renameFolder = async (f: Folder, name: string) => {
    setRenaming(null);
    if (!name.trim() || name === f.name) return;
    await saveFolder({ ...f, name: name.trim(), updatedAt: Date.now() });
    refresh();
  };

  const move = async (id: string, to: string | undefined) => {
    setMenu(null);
    setMoving(null);
    setProjects((list) => list?.map((p) => (p.id === id ? { ...p, folderId: to } : p)) ?? null);
    await moveProject(id, to);
    refresh();
  };

  // Arrastrar un guion a una carpeta (o a "Proyectos" para sacarlo).
  const dropProps = (target: string | undefined) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDropTarget(target ?? 'root');
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(DRAG_TYPE);
      setDropTarget(null);
      if (id) move(id, target);
    },
  });

  const renameInput = (value: string, label: string, onDone: (v: string) => void, onCancel: () => void) => (
    <input
      className="card-rename"
      autoFocus
      defaultValue={value}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') onCancel();
      }}
    />
  );

  return (
    <div className="home">
      <header className="home-head">
        <div className="wordmark">AMPUX</div>
        <div className="home-actions">
          {!folder && (
            <button className="btn" onClick={() => setCreatingFolder(true)}>
              <Icon.folder /> {t.home.newFolder}
            </button>
          )}
          <button className="btn" onClick={importFile}>
            <Icon.upload /> {t.home.import}
          </button>
          <button className="btn primary" onClick={create}>
            <Icon.plus /> {t.home.newProject}
          </button>
        </div>
      </header>

      <main className="home-main">
        <h1 className="home-title">
          {folder ? (
            <>
              <button className={`crumb${dropTarget === 'root' ? ' drop' : ''}`} onClick={() => setFolderId(null)} {...dropProps(undefined)}>
                {t.home.projects}
              </button>
              <span className="crumb-sep">/</span>
              <span>{folder.name}</span>
            </>
          ) : (
            t.home.projects
          )}
        </h1>

        {!folder && (folders.length > 0 || creatingFolder) && (
          <div className="folders">
            {folders.map((f) => (
              <div
                key={f.id}
                className={`folder${dropTarget === f.id ? ' drop' : ''}`}
                onClick={() => renaming !== f.id && setFolderId(f.id)}
                {...dropProps(f.id)}
              >
                <Icon.folder />
                <div className="folder-body">
                  {renaming === f.id ? (
                    renameInput(f.name, t.home.folderName, (v) => renameFolder(f, v), () => setRenaming(null))
                  ) : (
                    <div className="card-title">{f.name}</div>
                  )}
                  <div className="card-meta">{t.home.scripts(countIn(f.id))}</div>
                </div>
                <button
                  className="icon-btn folder-menu-btn"
                  aria-label="…"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenu(menu === f.id ? null : f.id);
                  }}
                >
                  <Icon.more />
                </button>
                {menu === f.id && (
                  <div className="menu card-menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => (setMenu(null), setRenaming(f.id))}>{t.home.rename}</button>
                    <button
                      className="danger"
                      onClick={async () => {
                        setMenu(null);
                        if (!confirm(t.home.confirmDeleteFolder(f.name))) return;
                        await deleteFolder(f);
                        refresh();
                      }}
                    >
                      {t.home.delete}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {creatingFolder && (
              <div className="folder">
                <Icon.folder />
                <div className="folder-body">
                  {renameInput('', t.home.folderName, createFolder, () => setCreatingFolder(false))}
                </div>
              </div>
            )}
          </div>
        )}

        {visible && visible.length === 0 && <p className="muted">{folder ? t.home.emptyFolder : t.home.empty}</p>}
        <div className="grid">
          {visible?.map((p) => (
            <article
              key={p.id}
              className="card"
              draggable={renaming !== p.id}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, p.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => renaming !== p.id && onOpen(p.id)}
            >
              <div className="card-sheet" aria-hidden="true">
                <span>{p.title.toLocaleUpperCase()}</span>
              </div>
              <div className="card-body">
                {renaming === p.id ? (
                  renameInput(p.title, t.home.newName, (v) => rename(p.id, v), () => setRenaming(null))
                ) : (
                  <div className="card-title">{p.title}</div>
                )}
                <div className="card-meta">
                  {formatDate(p.updatedAt, document.documentElement.lang || 'es')} · {t.home.pages(p.pageCount)}
                </div>
              </div>
              <button
                className="icon-btn card-menu-btn"
                aria-label="…"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoving(null);
                  setMenu(menu === p.id ? null : p.id);
                }}
              >
                <Icon.more />
              </button>
              {menu === p.id && (
                <div className="menu card-menu" onClick={(e) => e.stopPropagation()}>
                  {moving === p.id ? (
                    <>
                      <button className={!p.folderId ? 'current' : ''} onClick={() => move(p.id, undefined)}>
                        {t.home.root}
                      </button>
                      {folders.map((f) => (
                        <button key={f.id} className={p.folderId === f.id ? 'current' : ''} onClick={() => move(p.id, f.id)}>
                          {f.name}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <button onClick={() => (setMenu(null), setRenaming(p.id))}>{t.home.rename}</button>
                      {folders.length > 0 && <button onClick={() => setMoving(p.id)}>{t.home.moveTo}</button>}
                      <button
                        onClick={async () => {
                          setMenu(null);
                          await duplicateProject(p.id, t.home.copy);
                          refresh();
                        }}
                      >
                        {t.home.duplicate}
                      </button>
                      <button
                        className="danger"
                        onClick={async () => {
                          setMenu(null);
                          if (!confirm(t.home.confirmDelete(p.title))) return;
                          await deleteProject(p.id);
                          refresh();
                        }}
                      >
                        {t.home.delete}
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
