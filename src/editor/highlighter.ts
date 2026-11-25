import { Plugin, TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { keydownHandler } from 'prosemirror-keymap';
import { schema } from './schema';
import type { Command } from './commands';

/** ¿Todo el texto entre `from` y `to` ya está resaltado? */
export function isFullyHighlighted(state: EditorState, from: number, to: number): boolean {
  let any = false;
  let all = true;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isInline) return true;
    any = true;
    if (!schema.marks.highlight.isInSet(node.marks)) all = false;
    return false;
  });
  return any && all;
}

/**
 * Resalta la selección. Si ya estaba toda resaltada, la despinta (como pasar la goma).
 * Después deja el cursor al final, para que se vea el color y no la selección.
 */
export const toggleHighlight: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;
  if (empty) return false;
  if (dispatch) {
    const tr = isFullyHighlighted(state, from, to)
      ? state.tr.removeMark(from, to, schema.marks.highlight)
      : state.tr.addMark(from, to, schema.marks.highlight.create());
    tr.setSelection(TextSelection.create(tr.doc, to));
    dispatch(tr);
  }
  return true;
};

export interface HighlighterOptions {
  isActive: () => boolean;
  /** Prender/apagar la herramienta (atajo ⌘⇧H). */
  toggle: () => void;
  /** Apagarla (Esc). */
  exit: () => void;
}

/** Herramienta resaltador: con la herramienta prendida, todo lo que se selecciona queda resaltado al soltar. */
export function highlighterPlugin(opts: HighlighterOptions) {
  const keys = keydownHandler({
    'Mod-Shift-h': () => {
      opts.toggle();
      return true;
    },
  });

  return new Plugin({
    view(view) {
      // El arrastre puede terminar fuera de la hoja (en el margen o fuera de la ventana).
      let pressed = false;
      const down = () => (pressed = true);
      const up = () => {
        if (!pressed) return;
        pressed = false;
        setTimeout(() => {
          if (opts.isActive() && !view.state.selection.empty) toggleHighlight(view.state, view.dispatch);
        }, 0);
      };
      view.dom.addEventListener('mousedown', down);
      window.addEventListener('mouseup', up);
      return {
        destroy() {
          view.dom.removeEventListener('mousedown', down);
          window.removeEventListener('mouseup', up);
        },
      };
    },
    props: {
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (event.key === 'Escape' && opts.isActive()) {
          opts.exit();
          return true;
        }
        return keys(view, event);
      },
    },
  });
}
