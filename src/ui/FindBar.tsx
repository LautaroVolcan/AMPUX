import { useEffect, useRef, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { useT } from '../i18n';
import { clearFind, findStep, getFind, replaceAll, replaceCurrent, setFindQuery } from '../editor/find';
import { Icon } from './icons';

interface Props {
  view: EditorView | null;
  /** Cambia cuando el documento cambia, para refrescar el contador. */
  version: number;
  onClose: () => void;
}

export function FindBar({ view, version, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [, force] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    return () => {
      if (view && !view.isDestroyed) clearFind(view);
    };
  }, [view]);

  useEffect(() => {
    if (view) setFindQuery(view, query, matchCase);
    force((n) => n + 1);
  }, [view, query, matchCase]);

  const state = view ? getFind(view.state) : null;
  const total = state?.matches.length ?? 0;
  const current = total ? (state?.index ?? 0) + 1 : 0;
  void version;

  const step = (d: number) => {
    if (view) findStep(view, d);
    force((n) => n + 1);
  };

  return (
    <div className="findbar" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <input
        ref={input}
        className="input"
        placeholder={t.find.find}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && step(e.shiftKey ? -1 : 1)}
      />
      <button className={`chip${matchCase ? ' on' : ''}`} onClick={() => setMatchCase(!matchCase)} title="Match case">
        {t.find.matchCase}
      </button>
      <span className="find-count">{query ? t.find.results(current, total) : ''}</span>
      <button className="icon-btn" onClick={() => step(-1)} aria-label="prev">
        <Icon.up />
      </button>
      <button className="icon-btn" onClick={() => step(1)} aria-label="next">
        <Icon.down />
      </button>
      <span className="tb-sep" />
      <input className="input" placeholder={t.find.replace} value={replacement} onChange={(e) => setReplacement(e.target.value)} />
      <button className="btn" disabled={!total} onClick={() => view && (replaceCurrent(view, replacement), force((n) => n + 1))}>
        {t.find.replace}
      </button>
      <button className="btn" disabled={!total} onClick={() => view && (replaceAll(view, replacement), force((n) => n + 1))}>
        {t.find.replaceAll}
      </button>
      <button className="icon-btn" onClick={onClose} aria-label={t.close}>
        <Icon.close />
      </button>
    </div>
  );
}
