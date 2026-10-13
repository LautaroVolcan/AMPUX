import { Plugin, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { RevisionColor } from '../types';
import { nodeText } from './schema';

/**
 * Modo revisión: todo elemento cuyo texto o tipo cambia queda marcado con la revisión actual.
 * Si se borra un elemento entero, se marca el que ocupa su lugar.
 * Etiquetar (desglose), mover escenas o cambiar atributos no cuenta como revisión.
 */
export function revisionPlugin(getRevision: () => RevisionColor | null) {
  return new Plugin({
    appendTransaction(trs, oldState, state) {
      const rev = getRevision();
      if (!rev || !trs.some((tr) => tr.docChanged && !tr.getMeta('noRevision'))) return null;

      const old = new Map<string, PMNode>();
      oldState.doc.forEach((n) => n.attrs.id && old.set(n.attrs.id, n));
      const newIndex = new Map<string, number>();
      const toMark = new Set<number>();
      state.doc.forEach((n, _o, i) => {
        const id = n.attrs.id as string | null;
        if (id) newIndex.set(id, i);
        const before = id ? old.get(id) : undefined;
        if (!before || before.type !== n.type || nodeText(before) !== nodeText(n)) toMark.add(i);
      });
      const oldDoc = oldState.doc;
      oldDoc.forEach((n, _o, i) => {
        if (!n.attrs.id || newIndex.has(n.attrs.id)) return;
        for (let k = i + 1; k < oldDoc.childCount; k++) {
          const idx = newIndex.get(oldDoc.child(k).attrs.id);
          if (idx !== undefined) return void toMark.add(idx);
        }
        for (let k = i - 1; k >= 0; k--) {
          const idx = newIndex.get(oldDoc.child(k).attrs.id);
          if (idx !== undefined) return void toMark.add(idx);
        }
      });

      let tr: Transaction | null = null;
      state.doc.forEach((n, offset, i) => {
        if (toMark.has(i) && n.attrs.revision !== rev) {
          tr ??= state.tr;
          tr.setNodeMarkup(offset, undefined, { ...n.attrs, revision: rev });
        }
      });
      return tr;
    },
  });
}
