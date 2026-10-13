import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { ElementType, ProjectSettings, ScriptElement } from '../types';
import { spaceBefore } from '../pagination/metrics';
import { paginate, type PaginationResult } from '../pagination/paginate';
import { labels } from '../pagination/rules';
import { docToElements } from './schema';
import { elementPositions } from './commands';

export interface PageViewOptions {
  getSettings: () => ProjectSettings;
  getMode: () => 'page' | 'draft';
  onResult: (result: PaginationResult, elements: ScriptElement[]) => void;
}

interface PageState {
  deco: DecorationSet;
}

export const pageKey = new PluginKey<PageState>('pageView');
const refreshers = new WeakMap<EditorView, () => void>();

/** Fuerza a recalcular la paginación (por ejemplo, al cambiar ajustes o modo). */
export function repaginate(view: EditorView) {
  refreshers.get(view)?.();
}

function div(className: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  if (text) d.textContent = text;
  return d;
}

function breakWidget(opts: { page: number; blank: number; more: string | null; contd: string | null; inline: boolean }) {
  const wrap = div(`pg-break${opts.inline ? ' pg-break-inline' : ''}`);
  wrap.contentEditable = 'false';
  if (opts.more) wrap.appendChild(div('pg-line pg-more', opts.more));
  const fill = div('pg-fill');
  fill.style.height = `calc(var(--line) * ${opts.blank} + var(--page-bottom))`;
  wrap.appendChild(fill);
  wrap.appendChild(div('pg-gap'));
  const head = div('pg-head');
  head.appendChild(div('pg-num', `${opts.page}.`));
  wrap.appendChild(head);
  if (opts.contd) wrap.appendChild(div('pg-line pg-contd', opts.contd));
  return wrap;
}

function buildDecorations(state: EditorState, result: PaginationResult, settings: ProjectSettings, mode: 'page' | 'draft') {
  const doc = state.doc;
  const positions = elementPositions(doc);
  const decos: Decoration[] = [];
  const contdLabel = labels(settings.language).contd;

  for (const idx of result.autoContd) {
    const pos = positions[idx];
    const node = doc.child(idx);
    decos.push(
      Decoration.widget(pos + node.nodeSize - 1, () => {
        const s = document.createElement('span');
        s.className = 'auto-contd';
        s.textContent = ` ${contdLabel}`;
        return s;
      }, { side: 1, key: `contd-${contdLabel}` }),
    );
  }

  const nodeAttrs = new Map<number, Record<string, string>>();
  const addAttr = (idx: number, key: string, value: string) => {
    const a = nodeAttrs.get(idx) ?? {};
    a[key] = key === 'class' && a.class ? `${a.class} ${value}` : key === 'style' && a.style ? `${a.style}; ${value}` : value;
    nodeAttrs.set(idx, a);
  };
  if (settings.sceneNumbers !== 'none') {
    for (const [idx, num] of result.sceneNumbers) {
      decos.push(
        Decoration.widget(positions[idx] + 1, () => {
          const s = document.createElement('span');
          s.className = 'scene-num';
          s.contentEditable = 'false';
          s.innerHTML = '<span class="sn-l"></span><span class="sn-r"></span>';
          (s.firstChild as HTMLElement).textContent = num;
          (s.lastChild as HTMLElement).textContent = num;
          return s;
        }, { side: -1, key: `sn-${num}`, ignoreSelection: true }),
      );
    }
  }

  if (mode === 'page') {
    if (positions.length) addAttr(0, 'class', 'pg-top');
    const max = result.linesPerPage;
    for (let p = 1; p < result.pages.length; p++) {
      const prev = result.pages[p - 1];
      const page = result.pages[p];
      const first = page.blocks.find((b) => !b.synthetic);
      if (!first) continue;
      const lastPrev = prev.blocks[prev.blocks.length - 1];
      const more = lastPrev?.synthetic === 'more' ? lastPrev.lines[0] : null;
      const contd = page.blocks[0]?.synthetic === 'contd' ? page.blocks[0].lines[0] : null;
      const blank = Math.max(0, max - prev.usedLines);
      const nodePos = positions[first.elementIndex];
      const inline = first.startOffset > 0;
      const pos = inline ? nodePos + 1 + first.startOffset : nodePos;
      if (!inline) addAttr(first.elementIndex, 'class', 'pg-top');
      const spec = { page: page.number, blank, more, contd, inline };
      decos.push(
        Decoration.widget(pos, () => breakWidget(spec), {
          side: -1,
          key: `br-${page.number}-${blank}-${more}-${contd}-${inline}`,
          ignoreSelection: true,
        }),
      );
    }
  }

  // Diálogo dual: columna izquierda flotante, derecha al lado.
  for (const pair of result.dualPairs) {
    for (let i = pair.left[0]; i < pair.left[1]; i++) addAttr(i, 'class', 'dual-l');
    for (let i = pair.right[0]; i < pair.right[1]; i++) addAttr(i, 'class', 'dual-r');
    if (nodeAttrs.get(pair.left[0])?.class?.includes('pg-top')) addAttr(pair.right[0], 'class', 'pg-top');
    const nextIdx = pair.right[1];
    if (nextIdx < doc.childCount) {
      addAttr(nextIdx, 'class', 'dual-after');
      const nextType = doc.child(nextIdx).type.name as ElementType;
      const breaks = mode === 'page' && result.elementPage[nextIdx] !== result.elementPage[pair.left[0]];
      // Si la columna izquierda es la más alta, su margen inferior separa del elemento siguiente.
      const after = breaks ? 0 : spaceBefore(nextType, settings);
      addAttr(pair.left[1] - 1, 'style', `margin-bottom: calc(var(--line) * ${after})`);
    }
  }

  // Revisión actual: asterisco en el margen derecho de cada línea del elemento.
  const firstLines = new Map<number, number>();
  for (const page of result.pages) {
    for (const b of page.blocks) {
      if (b.elementIndex >= 0 && !firstLines.has(b.elementIndex)) firstLines.set(b.elementIndex, b.lines.length);
    }
  }
  doc.forEach((node, _o, idx) => {
    if (!node.attrs.revision || node.attrs.revision !== settings.revisionColor) return;
    const n = firstLines.get(idx) ?? 1;
    addAttr(idx, 'class', 'rev');
    addAttr(idx, 'style', `--rev-stars: "${Array(n).fill('*').join('\\A')}"`);
  });

  for (const [idx, attrs] of nodeAttrs) {
    const pos = positions[idx];
    decos.push(Decoration.node(pos, pos + doc.child(idx).nodeSize, attrs));
  }
  return DecorationSet.create(doc, decos);
}

export function pageViewPlugin(opts: PageViewOptions) {
  return new Plugin<PageState>({
    key: pageKey,
    state: {
      init: () => ({ deco: DecorationSet.empty }),
      apply(tr, prev) {
        const meta = tr.getMeta(pageKey) as PageState | undefined;
        if (meta) return meta;
        return { deco: prev.deco.map(tr.mapping, tr.doc) };
      },
    },
    props: {
      decorations: (state) => pageKey.getState(state)?.deco,
    },
    view(view) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const run = () => {
        timer = null;
        if (view.isDestroyed) return;
        const settings = opts.getSettings();
        const mode = opts.getMode();
        const elements = docToElements(view.state.doc);
        const result = paginate(elements, settings);
        const deco = buildDecorations(view.state, result, settings, mode);
        const last = result.pages[result.pages.length - 1];
        view.dom.style.setProperty('--last-blank', String(Math.max(0, result.linesPerPage - last.usedLines)));
        view.dispatch(view.state.tr.setMeta(pageKey, { deco }).setMeta('addToHistory', false));
        opts.onResult(result, elements);
      };
      const schedule = (delay: number) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(run, delay);
      };
      refreshers.set(view, () => schedule(0));
      schedule(0);
      return {
        update(v, prev) {
          if (!v.state.doc.eq(prev.doc)) schedule(120);
        },
        destroy() {
          if (timer) clearTimeout(timer);
          refreshers.delete(view);
        },
      };
    },
  });
}
