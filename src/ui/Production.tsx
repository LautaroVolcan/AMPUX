import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { PaginationResult } from '../pagination/paginate';
import {
  characterReport,
  formatEighths,
  locationReport,
  sceneReports,
  timeReport,
  toCSV,
  type Table,
} from '../reports/reports';
import { REVISION_COLORS, TAG_CATEGORIES, type Project, type ProjectSettings, type RevisionColor, type ScriptElement, type Snapshot, type TagCategory } from '../types';
import { deleteSnapshot, listSnapshots, saveSnapshot } from '../storage/db';
import { Modal } from './Dialogs';

type ReportTab = 'breakdown' | 'characters' | 'locations' | 'time';

export function ReportsDialog({
  elements,
  result,
  onExport,
  onClose,
}: {
  elements: ScriptElement[];
  result: PaginationResult | null;
  onExport: (table: Table, kind: 'csv' | 'pdf') => void;
  onClose: () => void;
}) {
  const t = useT();
  const c = t.reports.cols;
  const [tab, setTab] = useState<ReportTab>('breakdown');

  const table: Table | null = useMemo(() => {
    if (!result) return null;
    const scenes = sceneReports(elements, result);
    switch (tab) {
      case 'breakdown': {
        const cats = TAG_CATEGORIES.filter((cat) => scenes.some((s) => s.tags[cat]?.length));
        return {
          title: `${t.reports.title} · ${t.reports.tabs.breakdown}`,
          columns: [c.scene, c.heading, c.page, c.length, c.characters, ...cats.map((cat) => t.tags[cat])],
          rows: scenes.map((s) => [
            s.number,
            s.heading,
            String(s.page),
            formatEighths(s.eighths),
            s.characters.join(', '),
            ...cats.map((cat) => (s.tags[cat] ?? []).join(', ')),
          ]),
        };
      }
      case 'characters':
        return {
          title: `${t.reports.title} · ${t.reports.tabs.characters}`,
          columns: [c.character, c.dialogues, c.sceneCount, c.scenes, c.firstPage],
          rows: characterReport(elements, scenes, result).map((r) => [r.name, String(r.dialogues), String(r.scenes.length), r.scenes.join(', '), String(r.firstPage)]),
        };
      case 'locations':
        return {
          title: `${t.reports.title} · ${t.reports.tabs.locations}`,
          columns: [c.location, c.intExt, c.time, c.sceneCount, c.scenes, c.length],
          rows: locationReport(scenes).map((r) => [r.location, r.intExt.join(', '), r.times.join(', '), String(r.scenes.length), r.scenes.join(', '), formatEighths(r.eighths)]),
        };
      case 'time':
        return {
          title: `${t.reports.title} · ${t.reports.tabs.time}`,
          columns: [c.time, c.sceneCount, c.scenes, c.length],
          rows: timeReport(scenes).map((r) => [r.time, String(r.scenes.length), r.scenes.join(', '), formatEighths(r.eighths)]),
        };
    }
  }, [tab, elements, result, t, c]);

  return (
    <Modal title={t.reports.title} onClose={onClose} xwide>
      <div className="report-bar">
        <div className="seg text">
          {(Object.keys(t.reports.tabs) as ReportTab[]).map((k) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {t.reports.tabs[k]}
            </button>
          ))}
        </div>
        <div className="report-actions">
          <button className="btn" disabled={!table?.rows.length} onClick={() => table && onExport(table, 'csv')}>CSV</button>
          <button className="btn" disabled={!table?.rows.length} onClick={() => table && onExport(table, 'pdf')}>PDF</button>
        </div>
      </div>
      {!table?.rows.length ? (
        <p className="muted">{t.reports.empty}</p>
      ) : (
        <div className="report-scroll">
          <table className="report">
            <thead>
              <tr>{table.columns.map((col) => <th key={col}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(tab === 'breakdown' || tab === 'locations' || tab === 'time') && <p className="muted small">{t.reports.hint}</p>}
    </Modal>
  );
}

export function RevisionsDialog({
  settings,
  onSettings,
  changedPages,
  onExportChanged,
  onClear,
  onClose,
}: {
  settings: ProjectSettings;
  onSettings: (s: ProjectSettings) => void;
  changedPages: number[];
  onExportChanged: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const r = t.revisions;
  const set = (patch: Partial<ProjectSettings>) => onSettings({ ...settings, ...patch });
  return (
    <Modal title={r.title} onClose={onClose}>
      <div className="settings">
        <label className="row check">
          <span>{r.mode}</span>
          <input
            type="checkbox"
            checked={settings.revisionMode}
            onChange={(e) =>
              set({
                revisionMode: e.target.checked,
                revisionDate: settings.revisionDate || new Date().toLocaleDateString(document.documentElement.lang || 'es'),
              })
            }
          />
        </label>
        <p className="muted small">{r.modeHint}</p>
        <div className="field">
          <span>{r.color}</span>
          <div className="rev-swatches">
            {REVISION_COLORS.map((color: RevisionColor) => (
              <button
                key={color}
                className={`rev-swatch rv-${color}${settings.revisionColor === color ? ' on' : ''}`}
                onClick={() => set({ revisionColor: color })}
                title={r.colors[color]}
              >
                {r.colors[color]}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{r.date}</span>
          <input className="input" value={settings.revisionDate} onChange={(e) => set({ revisionDate: e.target.value })} />
        </label>
        <hr />
        <div className="row">
          <span className="muted">{r.changed(changedPages.length)}{changedPages.length ? `: ${changedPages.join(', ')}` : ''}</span>
          <button className="btn" disabled={!changedPages.length} onClick={onExportChanged}>{r.exportChanged}</button>
        </div>
        <div className="row">
          <span />
          <button className="btn" onClick={() => confirm(r.confirmClear) && onClear()}>{r.clear}</button>
        </div>
      </div>
    </Modal>
  );
}

export function VersionsDialog({
  current,
  onRestore,
  onDownload,
  onClose,
}: {
  current: () => Project;
  onRestore: (snap: Snapshot) => void;
  onDownload: (snap: Snapshot) => void;
  onClose: () => void;
}) {
  const t = useT();
  const v = t.versions;
  const projectId = current().id;
  const [list, setList] = useState<Snapshot[] | null>(null);
  const [name, setName] = useState('');
  const refresh = () => listSnapshots(projectId).then(setList);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const save = async () => {
    await saveSnapshot(current(), name.trim() || v.defaultName((list?.length ?? 0) + 1));
    setName('');
    refresh();
  };
  const fmt = (ts: number) =>
    new Intl.DateTimeFormat(document.documentElement.lang || 'es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ts);

  return (
    <Modal title={v.title} onClose={onClose} wide>
      <div className="version-new">
        <input
          className="input"
          placeholder={v.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="btn primary" onClick={save}>{v.save}</button>
      </div>
      {list && list.length === 0 && <p className="muted">{v.empty}</p>}
      <ul className="versions">
        {list?.map((s) => (
          <li key={s.id}>
            <div className="version-info">
              <span className="version-name">{s.name}</span>
              <span className="muted small">{v.meta(t.home.pages(s.pageCount), fmt(s.createdAt))}</span>
            </div>
            <button className="btn" onClick={() => confirm(v.confirmRestore(s.name)) && onRestore(s)}>{v.restore}</button>
            <button className="btn" onClick={() => onDownload(s)}>{v.download}</button>
            <button
              className="btn subtle-danger"
              onClick={async () => {
                if (!confirm(v.confirmDelete(s.name))) return;
                await deleteSnapshot(s.id);
                refresh();
              }}
            >
              {v.delete}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Panel lateral: etiquetas de la escena actual agrupadas por categoría. */
export function BreakdownPanel({
  elements,
  sceneId,
  onRemove,
}: {
  elements: ScriptElement[];
  sceneId: string | null;
  onRemove: (elementId: string, category: TagCategory, from: number, to: number) => void;
}) {
  const t = useT();
  if (!sceneId) return <p className="muted pad">{t.breakdown.noScene}</p>;
  const start = elements.findIndex((e) => e.id === sceneId);
  if (start < 0) return <p className="muted pad">{t.breakdown.noScene}</p>;
  let end = start + 1;
  while (end < elements.length && elements[end].type !== 'scene') end++;
  const groups = new Map<TagCategory, { label: string; elementId: string; from: number; to: number }[]>();
  for (const el of elements.slice(start, end)) {
    for (const tag of el.tags ?? []) {
      const label = el.text.slice(tag.from, tag.to).trim();
      if (!label) continue;
      const list = groups.get(tag.category) ?? [];
      list.push({ label, elementId: el.id, from: tag.from, to: tag.to });
      groups.set(tag.category, list);
    }
  }
  if (!groups.size) return <p className="muted pad">{t.breakdown.empty}</p>;
  return (
    <div className="bd-panel">
      {TAG_CATEGORIES.filter((c) => groups.has(c)).map((cat) => (
        <section key={cat} className="bd-group">
          <h4>
            <span className="bd-dot" style={{ background: `var(--tag-${cat})` }} />
            {t.tags[cat]}
          </h4>
          <ul>
            {groups.get(cat)!.map((item, i) => (
              <li key={i}>
                <span>{item.label}</span>
                <button className="icon-btn small" aria-label={t.breakdown.remove(item.label)} onClick={() => onRemove(item.elementId, cat, item.from, item.to)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
