import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { deleteProject, duplicateProject, getProject, listProjects, saveProject, type ProjectMeta } from '../storage/db';
import { newProject } from '../types';
import { fileToProject, IMPORT_ACCEPT, pickFile } from './files';
import { Icon } from './icons';

function formatDate(ts: number, lang: string) {
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ts);
}

export function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const refresh = () => listProjects().then(setProjects);
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const create = async () => {
    const p = newProject(t.home.untitled);
    p.titlePage.credit = t.home.defaultCredit;
    await saveProject(p);
    onOpen(p.id);
  };

  const importFile = async () => {
    const file = await pickFile(IMPORT_ACCEPT);
    if (!file) return;
    try {
      const p = await fileToProject(file);
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
    refresh();
  };

  return (
    <div className="home">
      <header className="home-head">
        <div className="wordmark">AMPUX</div>
        <div className="home-actions">
          <button className="btn" onClick={importFile}>
            <Icon.upload /> {t.home.import}
          </button>
          <button className="btn primary" onClick={create}>
            <Icon.plus /> {t.home.newProject}
          </button>
        </div>
      </header>

      <main className="home-main">
        <h1 className="home-title">{t.home.projects}</h1>
        {projects && projects.length === 0 && <p className="muted">{t.home.empty}</p>}
        <div className="grid">
          {projects?.map((p) => (
            <article key={p.id} className="card" onClick={() => renaming !== p.id && onOpen(p.id)}>
              <div className="card-sheet" aria-hidden="true">
                <span>{p.title.toLocaleUpperCase()}</span>
              </div>
              <div className="card-body">
                {renaming === p.id ? (
                  <input
                    className="card-rename"
                    autoFocus
                    defaultValue={p.title}
                    aria-label={t.home.newName}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => rename(p.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
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
                  setMenu(menu === p.id ? null : p.id);
                }}
              >
                <Icon.more />
              </button>
              {menu === p.id && (
                <div className="menu card-menu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => (setMenu(null), setRenaming(p.id))}>{t.home.rename}</button>
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
                </div>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
