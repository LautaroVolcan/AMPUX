import { useEffect, type ReactNode } from 'react';
import { useT } from '../i18n';
import type { ScriptElement, TitlePage } from '../types';
import { characterBaseName } from '../pagination/rules';
import { Icon } from './icons';

export function Modal({ title, onClose, children, wide, xwide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; xwide?: boolean }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}${xwide ? ' xwide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t.close}>
            <Icon.close />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function TitlePageDialog({ value, onChange, onClose }: { value: TitlePage; onChange: (tp: TitlePage) => void; onClose: () => void }) {
  const t = useT();
  const field = (key: keyof TitlePage, label: string, multiline = false) => (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea className="input" rows={3} value={value[key] ?? ''} onChange={(e) => onChange({ ...value, [key]: e.target.value })} />
      ) : (
        <input className="input" value={value[key] ?? ''} onChange={(e) => onChange({ ...value, [key]: e.target.value })} />
      )}
    </label>
  );
  return (
    <Modal title={t.titlePage.title} onClose={onClose}>
      <div className="title-preview">
        <div className="tp-title">{(value.title || '').toLocaleUpperCase()}</div>
        <div>{value.credit}</div>
        <div>{value.author}</div>
        {value.source && <div className="tp-source">{value.source}</div>}
      </div>
      {field('title', t.titlePage.fTitle)}
      {field('credit', t.titlePage.credit)}
      {field('author', t.titlePage.author)}
      {field('source', t.titlePage.source)}
      {field('draftDate', t.titlePage.draftDate)}
      {field('contact', t.titlePage.contact, true)}
    </Modal>
  );
}

export function StatsDialog({ elements, pages, onClose }: { elements: ScriptElement[]; pages: number; onClose: () => void }) {
  const t = useT();
  const scenes = elements.filter((e) => e.type === 'scene').length;
  const words = elements.reduce((s, e) => s + (e.text.match(/[\p{L}\p{N}'’]+/gu)?.length ?? 0), 0);
  const lines = new Map<string, number>();
  let speaker: string | null = null;
  for (const e of elements) {
    if (e.type === 'character') speaker = characterBaseName(e.text);
    else if (e.type === 'dialogue' && speaker) lines.set(speaker, (lines.get(speaker) ?? 0) + 1);
    else if (e.type !== 'parenthetical') speaker = null;
  }
  const rows = [...lines.entries()].sort((a, b) => b[1] - a[1]);
  const maxLines = rows[0]?.[1] ?? 1;

  return (
    <Modal title={t.stats.title} onClose={onClose}>
      <div className="stat-grid">
        <div className="stat"><span className="stat-value">{pages}</span><span className="stat-label">{t.stats.pages}</span></div>
        <div className="stat"><span className="stat-value">{scenes}</span><span className="stat-label">{t.stats.scenes}</span></div>
        <div className="stat"><span className="stat-value">{words.toLocaleString()}</span><span className="stat-label">{t.stats.words}</span></div>
        <div className="stat"><span className="stat-value">{t.stats.minutes(pages)}</span><span className="stat-label">{t.stats.duration}</span></div>
      </div>
      <h3 className="sub">{t.stats.dialogueLines}</h3>
      {rows.length === 0 && <p className="muted">{t.stats.none}</p>}
      <ul className="bars">
        {rows.map(([name, n]) => (
          <li key={name}>
            <span className="bar-name">{name}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / maxLines) * 100}%` }} /></span>
            <span className="bar-n">{n}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
