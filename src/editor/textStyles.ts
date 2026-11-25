import { toggleMark } from 'prosemirror-commands';
import type { EditorState } from 'prosemirror-state';
import { TEXT_STYLES, type TextStyle } from '../types';
import { schema } from './schema';
import type { Command } from './commands';

/**
 * Negrita / cursiva / subrayado sobre la selección, como en un procesador de texto:
 * si toda la selección ya lo tiene, lo quita; si no, lo aplica. Sin selección, vale para lo que se escriba.
 */
export function toggleStyle(style: TextStyle): Command {
  return toggleMark(schema.marks[style], null, { removeWhenPresent: false });
}

export type ActiveStyles = Record<TextStyle, boolean>;

/** Estilos activos en el cursor, o en toda la selección. */
export function activeStyles(state: EditorState): ActiveStyles {
  const { from, to, empty, $from } = state.selection;
  const out = { bold: false, italic: false, underline: false };
  for (const style of TEXT_STYLES) {
    const type = schema.marks[style];
    if (empty) {
      out[style] = !!type.isInSet(state.storedMarks ?? $from.marks());
      continue;
    }
    let any = false;
    let all = true;
    state.doc.nodesBetween(from, to, (node) => {
      if (!node.isInline) return true;
      any = true;
      if (!type.isInSet(node.marks)) all = false;
      return false;
    });
    out[style] = any && all;
  }
  return out;
}

export const STYLE_KEYS: Record<string, Command> = {
  'Mod-b': toggleStyle('bold'),
  'Mod-i': toggleStyle('italic'),
  'Mod-u': toggleStyle('underline'),
};
