import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { isElementEmpty, nodeText, schema } from './schema';
import type { ElementType } from '../types';

export type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

/** Bloque (elemento) donde está el cursor. */
export function currentBlock(state: EditorState) {
  const { $from } = state.selection;
  const node = $from.node(1);
  const pos = $from.before(1);
  return { node, pos, type: node.type.name as ElementType, $from };
}

function contentFor(type: ElementType, text: string): Fragment | null {
  if (type === 'parenthetical') {
    const t = text.trim();
    const wrapped = t === '' ? '()' : t.startsWith('(') ? t : `(${t}${t.endsWith(')') ? '' : ')'}`;
    return Fragment.from(schema.text(wrapped));
  }
  return null;
}

/** Cambia el tipo del bloque actual, conservando id y texto. */
export function setElementType(type: ElementType): Command {
  return (state, dispatch) => {
    const { node, pos, type: from } = currentBlock(state);
    if (!dispatch) return true;
    const tr = state.tr;
    const text = nodeText(node);
    let content: Fragment = node.content;
    let cursor: number | null = null;

    if (type === 'parenthetical' && from !== 'parenthetical') {
      content = contentFor(type, text)!;
      cursor = text.trim() === '' ? 1 : content.size - 1;
    } else if (from === 'parenthetical' && type !== 'parenthetical') {
      const stripped = text.trim().replace(/^\(/, '').replace(/\)$/, '');
      content = stripped ? Fragment.from(schema.text(stripped)) : Fragment.empty;
      cursor = content.size;
    }

    const attrs = { ...node.attrs, sceneNumber: type === 'scene' ? node.attrs.sceneNumber : null };
    const replacement = schema.nodes[type].create(attrs, content);
    if (content === node.content) {
      tr.setNodeMarkup(pos, schema.nodes[type], attrs);
    } else {
      tr.replaceWith(pos, pos + node.nodeSize, replacement);
      tr.setSelection(TextSelection.create(tr.doc, pos + 1 + (cursor ?? 0)));
    }
    dispatch(tr.setMeta('noAutodetect', true).scrollIntoView());
    return true;
  };
}

/** Inserta un elemento nuevo después del bloque actual y pone el cursor ahí. */
export function insertElementAfter(type: ElementType, text = ''): Command {
  return (state, dispatch) => {
    const { node, pos } = currentBlock(state);
    if (!dispatch) return true;
    const end = pos + node.nodeSize;
    const content = contentFor(type, text) ?? (text ? Fragment.from(schema.text(text)) : Fragment.empty);
    const newNode = schema.nodes[type].create({ id: null }, content);
    const tr = state.tr.insert(end, newNode);
    const cursor = type === 'parenthetical' && text.trim() === '' ? 1 : content.size;
    tr.setSelection(TextSelection.create(tr.doc, end + 1 + cursor));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Parte el bloque en el cursor. El segundo tramo pasa a `type` (o mantiene el actual). */
export function splitElement(type?: ElementType): Command {
  return (state, dispatch) => {
    const { type: current } = currentBlock(state);
    if (!dispatch) return true;
    let tr = state.tr;
    if (!state.selection.empty) tr = tr.deleteSelection();
    const pos = tr.selection.from;
    tr.split(pos, 1, [{ type: schema.nodes[type ?? current], attrs: { id: null } }]);
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Diálogo con texto + Tab: inserta una acotación (partiendo el diálogo si el cursor está en el medio). */
export const insertParentheticalInDialogue: Command = (state, dispatch) => {
  const { node, $from } = currentBlock(state);
  const atEnd = $from.parentOffset >= node.content.size;
  if (atEnd) return insertElementAfter('parenthetical')(state, dispatch);
  if (!dispatch) return true;
  const pos = state.selection.from;
  const tr = state.tr.split(pos, 1, [{ type: schema.nodes.dialogue, attrs: { id: null } }]);
  // tr.split dejó el cursor al inicio del segundo tramo; insertamos la acotación entre ambos.
  const insertAt = tr.selection.$from.before(1);
  tr.insert(insertAt, schema.nodes.parenthetical.create({ id: null }, schema.text('()')));
  tr.setSelection(TextSelection.create(tr.doc, insertAt + 2));
  dispatch(tr.scrollIntoView());
  return true;
};

/** Activa/desactiva el diálogo dual del bloque de diálogo donde está el cursor. */
export const toggleDual: Command = (state, dispatch) => {
  let index = state.selection.$from.index(0);
  while (index > 0 && ['dialogue', 'parenthetical'].includes(state.doc.child(index).type.name)) index--;
  const node = state.doc.child(index);
  if (node.type.name !== 'character') return false;
  // Tiene que haber un bloque de diálogo justo antes.
  let j = index - 1;
  while (j >= 0 && ['dialogue', 'parenthetical'].includes(state.doc.child(j).type.name)) j--;
  if (!node.attrs.dual && (j < 0 || j === index - 1 || state.doc.child(j).type.name !== 'character')) return false;
  if (dispatch) {
    let pos = 0;
    for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
    dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, dual: !node.attrs.dual }));
  }
  return true;
};

/** Cambia atributos de un elemento por id (sinopsis, color, número…). */
export function setElementAttrs(id: string, attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    let found = -1;
    state.doc.forEach((node, offset) => {
      if (node.attrs.id === id) found = offset;
    });
    if (found < 0) return false;
    const node = state.doc.nodeAt(found)!;
    if (dispatch) dispatch(state.tr.setNodeMarkup(found, undefined, { ...node.attrs, ...attrs }));
    return true;
  };
}

export function elementPositions(doc: PMNode): number[] {
  const out: number[] = [];
  doc.forEach((_n, offset) => out.push(offset));
  return out;
}

export { isElementEmpty };
