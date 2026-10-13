import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from './schema';

interface FindState {
  query: string;
  matchCase: boolean;
  matches: { from: number; to: number }[];
  index: number;
}

export const findKey = new PluginKey<FindState>('find');

function search(doc: PMNode, query: string, matchCase: boolean) {
  const out: { from: number; to: number }[] = [];
  if (!query) return out;
  const q = matchCase ? query : query.toLocaleLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const text = matchCase ? node.text! : node.text!.toLocaleLowerCase();
    let i = text.indexOf(q);
    while (i >= 0) {
      out.push({ from: pos + i, to: pos + i + q.length });
      i = text.indexOf(q, i + q.length);
    }
    return false;
  });
  return out;
}

export function findPlugin() {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => ({ query: '', matchCase: false, matches: [], index: 0 }),
      apply(tr, prev) {
        const meta = tr.getMeta(findKey) as Partial<FindState> | undefined;
        if (!meta && !tr.docChanged) return prev;
        const next = { ...prev, ...meta };
        if (tr.docChanged || meta?.query !== undefined || meta?.matchCase !== undefined) {
          next.matches = search(tr.doc, next.query, next.matchCase);
          next.index = Math.min(next.index, Math.max(0, next.matches.length - 1));
        }
        return next;
      },
    },
    props: {
      decorations(state) {
        const s = findKey.getState(state);
        if (!s || !s.query) return null;
        return DecorationSet.create(
          state.doc,
          s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.index ? 'find-hit current' : 'find-hit' })),
        );
      },
    },
  });
}

export function getFind(state: EditorState) {
  return findKey.getState(state)!;
}

function revealCurrent(view: EditorView) {
  const s = getFind(view.state);
  const m = s.matches[s.index];
  if (!m) return;
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)).scrollIntoView();
  view.dispatch(tr);
  const dom = view.domAtPos(m.from).node as HTMLElement;
  (dom.nodeType === 1 ? dom : dom.parentElement)?.scrollIntoView({ block: 'center' });
}

export function setFindQuery(view: EditorView, query: string, matchCase: boolean) {
  view.dispatch(view.state.tr.setMeta(findKey, { query, matchCase, index: 0 }));
}

export function findStep(view: EditorView, delta: number) {
  const s = getFind(view.state);
  if (!s.matches.length) return;
  const index = (s.index + delta + s.matches.length) % s.matches.length;
  view.dispatch(view.state.tr.setMeta(findKey, { index }));
  revealCurrent(view);
}

export function replaceCurrent(view: EditorView, replacement: string) {
  const s = getFind(view.state);
  const m = s.matches[s.index];
  if (!m) return;
  const tr = view.state.tr;
  if (replacement) tr.replaceWith(m.from, m.to, schema.text(replacement));
  else tr.delete(m.from, m.to);
  view.dispatch(tr);
  revealCurrent(view);
}

export function replaceAll(view: EditorView, replacement: string): number {
  const s = getFind(view.state);
  const tr = view.state.tr;
  for (let i = s.matches.length - 1; i >= 0; i--) {
    const m = s.matches[i];
    if (replacement) tr.replaceWith(m.from, m.to, schema.text(replacement));
    else tr.delete(m.from, m.to);
  }
  view.dispatch(tr);
  return s.matches.length;
}

export function clearFind(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(findKey, { query: '', matches: [], index: 0 }));
}
