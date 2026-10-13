import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { getProject, saveProject } from '../storage/db';
import type { CardColor, ElementType, Project, ProjectSettings, ScriptElement, TitlePage } from '../types';
import { computeSceneNumbers } from '../pagination/numbering';
import { serializeFDX } from '../formats/fdx/fdx';
import { CardBoard, type Card } from './CardBoard';
import type { PaginationResult } from '../pagination/paginate';
import { moveScene, replaceDocument, scrollToElement, type SelectionInfo } from '../editor';
import { setElementAttrs, setElementType, toggleDual } from '../editor/commands';
import { serializeFountain } from '../formats/fountain/serialize';
import { exportJSON, exportPlainText } from '../formats/text/plain';
import { download, renderPDF } from '../formats/pdf/render';
import { ScriptEditor, type ScriptEditorHandle } from './ScriptEditor';
import { TopBar, type ExportKind } from './TopBar';
import { SceneNavigator, type SceneItem } from './SceneNavigator';
import { FindBar } from './FindBar';
import { StatsDialog, TitlePageDialog } from './Dialogs';
import { SettingsDialog } from './Settings';
import { fileToProject, IMPORT_ACCEPT, pickFile, safeFilename } from './files';
import type { Prefs } from './prefs';

interface Props {
  projectId: string;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  onClose: () => void;
}

export function ProjectView(props: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    getProject(props.projectId).then((p) => (p ? setProject(p) : setMissing(true)));
  }, [props.projectId]);
  useEffect(() => {
    if (missing) props.onClose();
  }, [missing, props]);
  if (!project) return <div className="loading" />;
  return <Workspace {...props} initial={project} />;
}

function Workspace({ initial, prefs, setPrefs, onClose }: Props & { initial: Project }) {
  const t = useT();
  const editor = useRef<ScriptEditorHandle>(null);
  const [project, setProject] = useState<Project>(initial);
  const projectRef = useRef(project);
  projectRef.current = project;
  const elementsRef = useRef<ScriptElement[]>(initial.elements);
  const pagesRef = useRef(initial.pageCount ?? 1);

  const [saving, setSaving] = useState(false);
  const [pages, setPages] = useState(initial.pageCount ?? 1);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [statsElements, setStatsElements] = useState<ScriptElement[]>(initial.elements);
  const [selection, setSelection] = useState<SelectionInfo>({ type: 'scene', sceneId: null, dual: false });
  const [cards, setCards] = useState<Card[]>([]);
  const [findOpen, setFindOpen] = useState(false);
  const [docVersion, setDocVersion] = useState(0);
  const [dialog, setDialog] = useState<null | 'settings' | 'titlePage' | 'stats'>(null);

  // --- Guardado (debounce de 1 s) ---
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    const next: Project = { ...projectRef.current, elements: elementsRef.current, pageCount: pagesRef.current, updatedAt: Date.now() };
    await saveProject(next);
    if (!dirty.current) setSaving(false);
  }, []);
  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1000);
  }, [flush]);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  const update = (patch: Partial<Project>) => {
    setProject((p) => ({ ...p, ...patch }));
    projectRef.current = { ...projectRef.current, ...patch };
    scheduleSave();
  };

  // --- Callbacks del editor ---
  const onChange = useCallback(
    (els: ScriptElement[]) => {
      elementsRef.current = els;
      setDocVersion((v) => v + 1);
      scheduleSave();
    },
    [scheduleSave],
  );

  const onPaginate = useCallback(
    (r: PaginationResult, els: ScriptElement[]) => {
      // Numeración bloqueada: una escena nueva recibe su número (5A…) y lo conserva para siempre.
      const v = editor.current?.view();
      if (v && projectRef.current.settings.lockedNumbers && els.some((e) => e.type === 'scene' && !e.sceneNumber)) {
        const tr = v.state.tr;
        v.state.doc.forEach((node, offset, index) => {
          if (node.type.name === 'scene' && !node.attrs.sceneNumber && r.sceneNumbers.has(index)) {
            tr.setNodeMarkup(offset, undefined, { ...node.attrs, sceneNumber: r.sceneNumbers.get(index) });
          }
        });
        if (tr.docChanged) v.dispatch(tr.setMeta('addToHistory', false));
      }
      if (pagesRef.current !== r.pages.length) {
        pagesRef.current = r.pages.length;
        if (dirty.current === false) {
          dirty.current = true;
          timer.current = setTimeout(flush, 1000);
        }
      }
      setPages(r.pages.length);
      setStatsElements(els);
      const sceneItems = els.flatMap((e, i) =>
        e.type === 'scene'
          ? [{ index: i, id: e.id, heading: e.text.toLocaleUpperCase(), number: r.sceneNumbers.get(i) ?? '', page: r.elementPage[i] }]
          : [],
      );
      setScenes(sceneItems);
      setCards(
        sceneItems.map((s, k) => {
          const end = sceneItems[k + 1]?.index ?? els.length;
          const body = els.slice(s.index + 1, end).filter((e) => e.type === 'action' || e.type === 'dialogue');
          const excerpt = body.map((e) => e.text).join(' ').replace(/\s+/g, ' ').slice(0, 160);
          const el = els[s.index];
          return { ...s, synopsis: el.synopsis ?? '', color: el.color ?? null, excerpt };
        }),
      );
    },
    [flush],
  );

  const view = () => editor.current?.view() ?? null;

  const setType = (type: ElementType) => {
    const v = view();
    if (!v) return;
    setElementType(type)(v.state, v.dispatch);
    v.focus();
  };

  /** Bloquear: fija en cada escena su número actual. Desbloquear: vuelve a la numeración correlativa. */
  const changeSettings = (settings: ProjectSettings) => {
    const v = view();
    if (v && settings.lockedNumbers !== project.settings.lockedNumbers) {
      const numbers = computeSceneNumbers(elementsRef.current, project.settings.lockedNumbers);
      const tr = v.state.tr;
      v.state.doc.forEach((node, offset, index) => {
        if (node.type.name !== 'scene') return;
        tr.setNodeMarkup(offset, undefined, { ...node.attrs, sceneNumber: settings.lockedNumbers ? numbers.get(index) ?? null : null });
      });
      v.dispatch(tr);
    }
    update({ settings });
  };

  const setCardAttrs = (id: string, attrs: { synopsis?: string | null; color?: CardColor | null }) => {
    const v = view();
    if (v) setElementAttrs(id, attrs)(v.state, v.dispatch);
  };

  const currentProject = (): Project => ({ ...projectRef.current, elements: elementsRef.current });
  const baseName = safeFilename(project.title);

  const doExport = async (kind: ExportKind) => {
    const p = currentProject();
    const numbers = p.settings.lockedNumbers ? computeSceneNumbers(p.elements, true) : undefined;
    switch (kind) {
      case 'pdf':
      case 'pdfNoTitle': {
        const bytes = await renderPDF(p, { titlePage: kind === 'pdf' });
        download(bytes as Uint8Array<ArrayBuffer>, `${baseName}.pdf`, 'application/pdf');
        break;
      }
      case 'fountain':
        download(serializeFountain(p.elements, p.titlePage, { sceneNumbers: numbers }), `${baseName}.fountain`, 'text/plain;charset=utf-8');
        break;
      case 'fdx':
        download(serializeFDX(p.elements, p.titlePage, { sceneNumbers: numbers }), `${baseName}.fdx`, 'application/xml');
        break;
      case 'txt':
        download(exportPlainText(p), `${baseName}.txt`, 'text/plain;charset=utf-8');
        break;
      case 'json':
        download(exportJSON(p), `${baseName}.json`, 'application/json');
    }
  };

  const doImport = async () => {
    const file = await pickFile(IMPORT_ACCEPT);
    const v = view();
    if (!file || !v) return;
    try {
      const imported = await fileToProject(file);
      const hasContent = elementsRef.current.some((e) => e.text.trim());
      if (hasContent && !confirm(t.importMenu.replaceConfirm)) return;
      const patch: Partial<Project> = { titlePage: { ...project.titlePage, ...imported.titlePage } };
      if (file.name.toLowerCase().endsWith('.json')) {
        patch.settings = imported.settings;
        patch.notes = imported.notes;
      } else {
        patch.settings = { ...project.settings, language: imported.settings.language, lockedNumbers: imported.settings.lockedNumbers };
      }
      update(patch);
      replaceDocument(v, imported.elements);
    } catch (e) {
      console.error(e);
      alert(t.importMenu.error);
    }
  };

  // Atajos globales cuando el foco no está en el editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'f') {
        e.preventDefault();
        setFindOpen(true);
      } else if (e.key === 's') {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flush]);

  const sceneNote = selection.sceneId ? project.notes[selection.sceneId] ?? '' : '';

  return (
    <div className="app">
      <TopBar
        title={project.title}
        onTitle={(title) => update({ title, titlePage: project.titlePage.title === project.title ? { ...project.titlePage, title } : project.titlePage })}
        onBack={async () => {
          await flush();
          onClose();
        }}
        currentType={selection.type}
        onType={setType}
        dual={selection.dual}
        onDual={() => {
          const v = view();
          if (!v) return;
          toggleDual(v.state, v.dispatch);
          v.focus();
        }}
        pages={pages}
        saving={saving}
        mode={prefs.mode}
        onMode={(mode) => setPrefs({ mode })}
        zoom={prefs.zoom}
        onZoom={(zoom) => setPrefs({ zoom })}
        showNav={prefs.showNav}
        onToggleNav={() => setPrefs({ showNav: !prefs.showNav })}
        showNotes={prefs.showNotes}
        onToggleNotes={() => setPrefs({ showNotes: !prefs.showNotes })}
        onFind={() => setFindOpen(true)}
        onExport={doExport}
        onImport={doImport}
        onOpen={setDialog}
      />
      <div className="workspace">
        {prefs.showNav && (
          <SceneNavigator
            scenes={scenes}
            currentId={selection.sceneId}
            onJump={(i) => {
              const v = view();
              if (v) scrollToElement(v, i);
            }}
            onMove={(from, to) => {
              const v = view();
              if (v) moveScene(v, from, to);
            }}
          />
        )}
        <main className="desk">
          {findOpen && <FindBar view={view()} version={docVersion} onClose={() => (setFindOpen(false), view()?.focus())} />}
          {prefs.mode === 'cards' && (
            <CardBoard
              cards={cards}
              onSynopsis={(id, synopsis) => setCardAttrs(id, { synopsis: synopsis || null })}
              onColor={(id, color) => setCardAttrs(id, { color })}
              onMove={(from, to) => {
                const v = view();
                if (v) moveScene(v, from, to);
              }}
              onOpen={(i) => {
                setPrefs({ mode: 'page' });
                setTimeout(() => {
                  const v = view();
                  if (v) scrollToElement(v, i);
                }, 50);
              }}
            />
          )}
          <div hidden={prefs.mode === 'cards'}>
          <ScriptEditor
            ref={editor}
            initial={initial.elements}
            settings={project.settings}
            mode={prefs.mode}
            zoom={prefs.zoom}
            typeLabels={prefs.typeLabels}
            onChange={onChange}
            onPaginate={onPaginate}
            onSelection={setSelection}
            onSave={flush}
            onFind={() => setFindOpen(true)}
          />
          </div>
        </main>
        {prefs.showNotes && (
          <aside className="panel notes">
            <div className="panel-head">
              <span className="panel-title">{t.notes.title}</span>
            </div>
            {selection.sceneId ? (
              <>
                <div className="notes-scene">{scenes.find((s) => s.id === selection.sceneId)?.heading}</div>
                <textarea
                  className="notes-text"
                  placeholder={t.notes.placeholder}
                  value={sceneNote}
                  onChange={(e) => update({ notes: { ...project.notes, [selection.sceneId!]: e.target.value } })}
                />
              </>
            ) : (
              <p className="muted pad">{t.notes.none}</p>
            )}
          </aside>
        )}
      </div>

      {dialog === 'settings' && (
        <SettingsDialog
          settings={project.settings}
          onSettings={changeSettings}
          prefs={prefs}
          onPrefs={setPrefs}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'titlePage' && (
        <TitlePageDialog value={project.titlePage} onChange={(titlePage: TitlePage) => update({ titlePage })} onClose={() => setDialog(null)} />
      )}
      {dialog === 'stats' && <StatsDialog elements={statsElements} pages={pages} onClose={() => setDialog(null)} />}
    </div>
  );
}
