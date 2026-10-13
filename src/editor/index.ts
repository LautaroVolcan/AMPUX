import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import type { ElementType, Language, ProjectSettings, ScriptElement } from '../types';
import type { PaginationResult } from '../pagination/paginate';
import { docToElements, elementsToDoc, nodeText } from './schema';
import { scriptKeymap } from './keymap';
import { autodetectPlugin, idsPlugin } from './autodetect';
import { autocompletePlugin } from './autocomplete';
import { createTypeMenu } from './typeMenu';
import { pageViewPlugin } from './pageView';
import { findPlugin } from './find';
import { currentBlock, elementPositions } from './commands';

export interface SelectionInfo {
  type: ElementType;
  /** Id del encabezado de la escena donde está el cursor. */
  sceneId: string | null;
  /** ¿El bloque de diálogo actual está en modo dual? */
  dual: boolean;
}

export interface EditorCallbacks {
  getSettings: () => ProjectSettings;
  getMode: () => 'page' | 'draft';
  getLang: () => Language;
  typeLabel: (t: ElementType) => string;
  onChange: (elements: ScriptElement[]) => void;
  onPaginate: (result: PaginationResult, elements: ScriptElement[]) => void;
  onSelection: (info: SelectionInfo) => void;
  onSave: () => void;
  onFind: () => void;
}

function selectionInfo(state: EditorState): SelectionInfo {
  const { type } = currentBlock(state);
  const index = state.selection.$from.index(0);
  let sceneId: string | null = null;
  for (let i = index; i >= 0; i--) {
    const node = state.doc.child(i);
    if (node.type.name === 'scene') {
      sceneId = node.attrs.id;
      break;
    }
  }
  let k = index;
  while (k > 0 && ['dialogue', 'parenthetical'].includes(state.doc.child(k).type.name)) k--;
  const unit = state.doc.child(k);
  const dual = unit.type.name === 'character' && !!unit.attrs.dual;
  return { type, sceneId, dual };
}

export function createEditor(mount: HTMLElement, elements: ScriptElement[], cb: EditorCallbacks): EditorView {
  const menu = createTypeMenu(cb.typeLabel);
  const state = EditorState.create({
    doc: elementsToDoc(elements),
    plugins: [
      autocompletePlugin(cb.getLang),
      menu.plugin,
      scriptKeymap({ openTypeMenu: menu.open, save: cb.onSave, find: cb.onFind }),
      history(),
      keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo }),
      keymap(baseKeymap),
      autodetectPlugin(),
      idsPlugin(),
      findPlugin(),
      pageViewPlugin({ getSettings: cb.getSettings, getMode: cb.getMode, onResult: cb.onPaginate }),
    ],
  });

  let lastInfo = '';
  const view: EditorView = new EditorView(mount, {
    state,
    attributes: { spellcheck: 'true', class: 'script' },
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      if (tr.docChanged) cb.onChange(docToElements(next.doc));
      const info = selectionInfo(next);
      const key = `${info.type}|${info.sceneId}|${info.dual}`;
      if (key !== lastInfo) {
        lastInfo = key;
        cb.onSelection(info);
      }
    },
  });
  // Cursor al final del primer elemento.
  const first = view.state.doc.firstChild;
  if (first) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1 + first.content.size)));
  return view;
}

export function scrollToElement(view: EditorView, index: number) {
  const positions = elementPositions(view.state.doc);
  const pos = positions[index];
  if (pos === undefined) return;
  const node = view.state.doc.child(index);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1 + node.content.size)));
  const dom = view.nodeDOM(pos) as HTMLElement | null;
  dom?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  view.focus();
}

/** Rangos [inicio, fin) de cada escena (encabezado + todo lo que sigue hasta la próxima). */
export function sceneRanges(view: EditorView) {
  const ranges: { index: number; from: number; to: number }[] = [];
  view.state.doc.forEach((node, offset, index) => {
    if (node.type.name === 'scene') {
      if (ranges.length) ranges[ranges.length - 1].to = offset;
      ranges.push({ index, from: offset, to: view.state.doc.content.size });
    }
  });
  return ranges;
}

/** Mueve la escena `from` para que quede antes de la escena `to` (o al final si `to` === cantidad). */
export function moveScene(view: EditorView, from: number, to: number) {
  const ranges = sceneRanges(view);
  if (from === to || from + 1 === to || !ranges[from]) return;
  const src = ranges[from];
  const target = to >= ranges.length ? view.state.doc.content.size : ranges[to].from;
  const slice = view.state.doc.slice(src.from, src.to);
  const tr = view.state.tr;
  if (target > src.from) {
    tr.insert(target, slice.content);
    tr.delete(src.from, src.to);
  } else {
    tr.delete(src.from, src.to);
    tr.insert(target, slice.content);
  }
  view.dispatch(tr.scrollIntoView());
}

export function replaceDocument(view: EditorView, elements: ScriptElement[]) {
  const doc = elementsToDoc(elements);
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
  view.dispatch(tr);
}

export { nodeText };
