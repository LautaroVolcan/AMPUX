import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { ELEMENT_TYPES, type ElementType } from '../types';
import { Icon } from './icons';

interface Props {
  title: string;
  onTitle: (t: string) => void;
  onBack: () => void;
  currentType: ElementType;
  onType: (t: ElementType) => void;
  pages: number;
  saving: boolean;
  mode: 'page' | 'draft' | 'cards';
  onMode: (m: 'page' | 'draft' | 'cards') => void;
  dual: boolean;
  onDual: () => void;
  zoom: number;
  onZoom: (z: number) => void;
  showNav: boolean;
  onToggleNav: () => void;
  showNotes: boolean;
  onToggleNotes: () => void;
  onFind: () => void;
  onExport: (kind: ExportKind) => void;
  onImport: () => void;
  onOpen: (dialog: Dialog) => void;
  breakdown: boolean;
  onToggleBreakdown: () => void;
  /** Texto del indicador de revisión, si el modo revisión está activo. */
  revisionChip: string | null;
  revisionColor: string;
}

export type Dialog = 'settings' | 'titlePage' | 'stats' | 'reports' | 'revisions' | 'versions';

export type ExportKind = 'pdf' | 'pdfNoTitle' | 'fountain' | 'fdx' | 'txt' | 'json';

export const ZOOMS = [0.75, 0.9, 1, 1.1, 1.25, 1.5];

export function TopBar(p: Props) {
  const t = useT();
  const [exportOpen, setExportOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  useEffect(() => {
    if (!prodOpen) return;
    const close = () => setProdOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [prodOpen]);
  const [title, setTitle] = useState(p.title);
  useEffect(() => setTitle(p.title), [p.title]);
  useEffect(() => {
    if (!exportOpen) return;
    const close = () => setExportOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [exportOpen]);

  const zoomIdx = ZOOMS.indexOf(p.zoom);
  const stepZoom = (d: number) => {
    const i = Math.max(0, Math.min(ZOOMS.length - 1, (zoomIdx < 0 ? 2 : zoomIdx) + d));
    p.onZoom(ZOOMS[i]);
  };

  return (
    <header className="topbar">
      <div className="tb-group">
        <button className="icon-btn" onClick={p.onBack} title={t.top.back} aria-label={t.top.back}>
          <Icon.back />
        </button>
        <span className="wordmark small">AMPUX</span>
        <span className="tb-sep" />
        <input
          className="tb-title"
          value={title}
          size={Math.max(8, title.length)}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== p.title && p.onTitle(title.trim())}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={t.home.newName}
        />
      </div>

      <div className="tb-group tb-center">
        <select
          className="tb-select"
          value={p.currentType}
          onChange={(e) => p.onType(e.target.value as ElementType)}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Tipo"
        >
          {ELEMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t.types[type]}
            </option>
          ))}
        </select>
        <button className={`chip${p.dual ? ' on' : ''}`} onClick={p.onDual} title={t.top.dualHint}>
          {t.top.dual}
        </button>
        <span className="tb-meta">{t.top.pages(p.pages)}</span>
        {p.breakdown && (
          <button className="chip on" onClick={p.onToggleBreakdown} title={t.breakdown.mode}>
            {t.breakdown.chip} ×
          </button>
        )}
        {p.revisionChip && (
          <button className="chip on rev-chip" onClick={() => p.onOpen('revisions')}>
            <span className={`rev-dot rv-${p.revisionColor}`} />
            {p.revisionChip}
          </button>
        )}
        <span className={`tb-meta save-state${p.saving ? ' saving' : ''}`}>
          <span className="dot" />
          {p.saving ? t.top.saving : t.top.saved}
        </span>
      </div>

      <div className="tb-group tb-right">
        <button className={`icon-btn${p.showNav ? ' on' : ''}`} onClick={p.onToggleNav} title={t.top.scenes} aria-label={t.top.scenes}>
          <Icon.sidebar />
        </button>
        <div className="seg" role="group">
          <button className={p.mode === 'page' ? 'on' : ''} onClick={() => p.onMode('page')} title={t.top.paged}>
            <Icon.page />
          </button>
          <button className={p.mode === 'draft' ? 'on' : ''} onClick={() => p.onMode('draft')} title={t.top.draft}>
            <Icon.draft />
          </button>
          <button className={p.mode === 'cards' ? 'on' : ''} onClick={() => p.onMode('cards')} title={t.top.cards}>
            <Icon.cards />
          </button>
        </div>
        <div className="zoom">
          <button className="icon-btn" onClick={() => stepZoom(-1)} aria-label="-">
            <Icon.minus />
          </button>
          <span>{Math.round(p.zoom * 100)}%</span>
          <button className="icon-btn" onClick={() => stepZoom(1)} aria-label="+">
            <Icon.plus />
          </button>
        </div>
        <span className="tb-sep" />
        <button className="icon-btn" onClick={p.onFind} title={`${t.top.find} (⌘F)`} aria-label={t.top.find}>
          <Icon.search />
        </button>
        <button className="icon-btn" onClick={() => p.onOpen('titlePage')} title={t.top.titlePage} aria-label={t.top.titlePage}>
          <Icon.title />
        </button>
        <button className="icon-btn" onClick={() => p.onOpen('stats')} title={t.top.stats} aria-label={t.top.stats}>
          <Icon.stats />
        </button>
        <button className="icon-btn" onClick={p.onImport} title={t.top.import} aria-label={t.top.import}>
          <Icon.upload />
        </button>
        <div className="menu-anchor">
          <button
            className={`icon-btn${prodOpen ? ' on' : ''}`}
            title={t.production.menu}
            aria-label={t.production.menu}
            onClick={(e) => {
              e.stopPropagation();
              setProdOpen(!prodOpen);
            }}
          >
            <Icon.layers />
          </button>
          {prodOpen && (
            <div className="menu right">
              <button onClick={p.onToggleBreakdown}>
                <span className="menu-check">{p.breakdown ? '✓' : ''}</span>
                {t.breakdown.mode}
              </button>
              <button onClick={() => p.onOpen('reports')}><span className="menu-check" />{t.production.reports}</button>
              <button onClick={() => p.onOpen('revisions')}><span className="menu-check" />{t.production.revisions}</button>
              <button onClick={() => p.onOpen('versions')}><span className="menu-check" />{t.production.versions}</button>
            </div>
          )}
        </div>
        <div className="menu-anchor">
          <button
            className="btn"
            onClick={(e) => {
              e.stopPropagation();
              setExportOpen(!exportOpen);
            }}
          >
            <Icon.download /> {t.top.export}
          </button>
          {exportOpen && (
            <div className="menu right">
              {(['pdf', 'pdfNoTitle', 'fountain', 'fdx', 'txt', 'json'] as const).map((k) => (
                <button key={k} onClick={() => p.onExport(k)}>
                  {t.exportMenu[k]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={`icon-btn${p.showNotes ? ' on' : ''}`} onClick={p.onToggleNotes} title={t.top.notes} aria-label={t.top.notes}>
          <Icon.notes />
        </button>
        <button className="icon-btn" onClick={() => p.onOpen('settings')} title={t.top.settings} aria-label={t.top.settings}>
          <Icon.settings />
        </button>
      </div>
    </header>
  );
}
