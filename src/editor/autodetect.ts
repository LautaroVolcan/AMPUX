import { Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import { newId, type ElementType } from '../types';
import { nodeText, schema } from './schema';

export const SCENE_PREFIX_RE = /^(int|ext|est|int\.?\/ext|ext\.?\/int|i\/e)[.\s]/i;

/** ¿El texto de una acción debería convertirse en otro tipo? */
export function detectType(type: ElementType, text: string): ElementType | null {
  if (type !== 'action' && type !== 'general') return null;
  if (SCENE_PREFIX_RE.test(text)) return 'scene';
  const t = text.trim();
  if (t.length >= 4 && t.endsWith(':') && /\p{L}/u.test(t) && t === t.toLocaleUpperCase() && !t.includes('\n')) return 'transition';
  return null;
}

/** Convierte acción → escena / transición mientras se escribe. */
export function autodetectPlugin() {
  return new Plugin({
    appendTransaction(trs, _old, state) {
      if (!trs.some((tr) => tr.docChanged && tr.getMeta('uiEvent') !== 'paste' && !tr.getMeta('noAutodetect'))) return null;
      const { $from } = state.selection;
      if ($from.depth < 1) return null;
      const node = $from.node(1);
      const target = detectType(node.type.name as ElementType, nodeText(node));
      if (!target) return null;
      return state.tr.setNodeMarkup($from.before(1), schema.nodes[target], node.attrs);
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== '(') return false;
        const { state } = view;
        const $from = state.doc.resolve(from);
        const node = $from.node(1);
        if (nodeText(node).trim() !== '' || from !== to) return false;
        const index = $from.index(0);
        const prev = index > 0 ? state.doc.child(index - 1) : null;
        const type = node.type.name;
        const below = prev && ['character', 'dialogue', 'parenthetical'].includes(prev.type.name);
        if (!(type === 'parenthetical' || (below && (type === 'dialogue' || type === 'action')))) return false;
        const pos = $from.before(1);
        const para = schema.nodes.parenthetical.create(node.attrs, schema.text('()'));
        const tr = state.tr.replaceWith(pos, pos + node.nodeSize, para);
        tr.setSelection(TextSelection.create(tr.doc, pos + 2));
        view.dispatch(tr);
        return true;
      },
    },
  });
}

/** Garantiza que cada elemento tenga un id único (los bloques nuevos nacen sin id). */
export function idsPlugin() {
  return new Plugin({
    appendTransaction(trs, _old, state) {
      if (!trs.some((tr) => tr.docChanged)) return null;
      const seen = new Set<string>();
      let tr: Transaction | null = null;
      state.doc.forEach((node, offset) => {
        const id = node.attrs.id as string | null;
        if (!id || seen.has(id)) {
          tr = tr ?? state.tr;
          const fresh = newId();
          // Un duplicado (copiar y pegar) no hereda el número de escena bloqueado.
          tr!.setNodeMarkup(offset, undefined, { ...node.attrs, id: fresh, sceneNumber: id ? null : node.attrs.sceneNumber });
          seen.add(fresh);
        } else seen.add(id);
      });
      return tr;
    },
  });
}
