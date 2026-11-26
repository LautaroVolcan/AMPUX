import type { Transaction } from 'prosemirror-state';
import { ySyncPluginKey } from 'y-prosemirror';

/**
 * ¿La transacción trae un cambio de otra persona (edición en tiempo real)?
 * Deshacer/rehacer también llega por Yjs, pero es una acción propia: no cuenta como remota.
 */
export function isRemote(tr: Transaction): boolean {
  const meta = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean; isUndoRedoOperation?: boolean } | undefined;
  return !!meta?.isChangeOrigin && !meta.isUndoRedoOperation;
}

/**
 * Los plugins que reaccionan a cambios (ids, INT. → escena, revisión) solo actúan sobre los cambios propios.
 * Si reaccionaran también a los remotos, los dos navegadores harían lo mismo a la vez y se duplicaría.
 */
export function hasLocalChange(trs: readonly Transaction[]): boolean {
  return trs.some((tr) => tr.docChanged && !isRemote(tr));
}
