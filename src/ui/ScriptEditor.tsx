import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { EditorView } from 'prosemirror-view';
import { createEditor, type SelectionInfo } from '../editor';
import { repaginate } from '../editor/pageView';
import { pageGeometry } from '../pagination/metrics';
import type { PaginationResult } from '../pagination/paginate';
import { ELEMENT_TYPES, type ProjectSettings, type ScriptElement } from '../types';
import { useT } from '../i18n';

export interface ScriptEditorHandle {
  view: () => EditorView | null;
}

interface Props {
  initial: ScriptElement[];
  settings: ProjectSettings;
  mode: 'page' | 'draft' | 'cards';
  zoom: number;
  typeLabels: boolean;
  breakdown: boolean;
  onChange: (elements: ScriptElement[]) => void;
  onPaginate: (result: PaginationResult, elements: ScriptElement[]) => void;
  onSelection: (info: SelectionInfo) => void;
  onSave: () => void;
  onFind: () => void;
}

/** Vista paginada (hojas) o modo borrador del guion. */
export const ScriptEditor = forwardRef<ScriptEditorHandle, Props>(function ScriptEditor(props, ref) {
  const t = useT();
  const mount = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef({ props, t });
  latest.current = { props, t };

  useImperativeHandle(ref, () => ({ view: () => viewRef.current }), []);

  useEffect(() => {
    const view = createEditor(mount.current!, props.initial, {
      getSettings: () => latest.current.props.settings,
      getMode: () => (latest.current.props.mode === 'draft' ? 'draft' : 'page'),
      getLang: () => latest.current.props.settings.language,
      typeLabel: (type) => latest.current.t.types[type],
      tagLabel: (c) => latest.current.t.tags[c],
      removeTagLabel: (c) => latest.current.t.breakdown.remove(c ? latest.current.t.tags[c] : undefined),
      getBreakdown: () => latest.current.props.breakdown,
      getRevision: () => (latest.current.props.settings.revisionMode ? latest.current.props.settings.revisionColor : null),
      onChange: (els) => latest.current.props.onChange(els),
      onPaginate: (r, els) => latest.current.props.onPaginate(r, els),
      onSelection: (info) => latest.current.props.onSelection(info),
      onSave: () => latest.current.props.onSave(),
      onFind: () => latest.current.props.onFind(),
    });
    viewRef.current = view;
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // El editor se crea una sola vez por proyecto (ProjectView se monta con key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { settings, mode } = props;
  useEffect(() => {
    if (viewRef.current) repaginate(viewRef.current);
  }, [settings, mode]);

  const geo = pageGeometry(settings.pageSize);
  const labelCss = useMemo(
    () => ELEMENT_TYPES.map((type) => `.labels .el-${type}::before{content:"${t.types[type]}"}`).join('\n'),
    [t],
  );

  const classes = [
    'sheet',
    mode === 'draft' ? 'draft' : 'paged',
    props.typeLabels ? 'labels' : '',
    settings.sceneNumbers !== 'none' ? `sn-${settings.sceneNumbers}` : '',
    settings.sceneSpacing === 2 ? 'spacing-2' : '',
    props.breakdown ? 'breakdown' : '',
    `rev-${settings.revisionColor}`,
  ].join(' ');

  return (
    <div className="sheet-zoom" style={{ zoom: props.zoom } as React.CSSProperties}>
      <style>{labelCss}</style>
      <div
        className={classes}
        ref={mount}
        style={
          {
            '--page-w': `${geo.width}in`,
            '--page-bottom': `${geo.height - geo.top - geo.lines / 6}in`,
          } as React.CSSProperties
        }
      />
    </div>
  );
});
