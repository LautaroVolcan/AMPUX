import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { ELEMENT_TYPES, type ElementType } from '../types';
import { setElementType, currentBlock } from './commands';
import { Popup } from './popup';
import { SHORTCUT_TYPES } from './flow';

/** Menú de selección de tipo que aparece con Enter en un elemento vacío. */
export function createTypeMenu(label: (t: ElementType) => string) {
  let popup: Popup | null = null;
  let view: EditorView | null = null;

  const pick = (i: number) => {
    if (!view) return;
    popup?.hide();
    setElementType(ELEMENT_TYPES[i])(view.state, view.dispatch);
    view.focus();
  };

  const open = () => {
    if (!view || !popup) return;
    const { type } = currentBlock(view.state);
    const items = ELEMENT_TYPES.map((t) => {
      const n = SHORTCUT_TYPES.indexOf(t);
      return { label: label(t), hint: n >= 0 ? `${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}${n + 1}` : '' };
    });
    popup.show(view, view.state.selection.from, items, ELEMENT_TYPES.indexOf(type));
    popup.onPick = pick;
  };

  const plugin = new Plugin({
    view(v) {
      view = v;
      popup = new Popup('type-menu');
      return {
        update(v2, prev) {
          if (!v2.state.selection.eq(prev.selection) || !v2.state.doc.eq(prev.doc)) popup?.hide();
        },
        destroy() {
          popup?.destroy();
          popup = null;
          view = null;
        },
      };
    },
    props: {
      handleKeyDown(_v, event) {
        if (!popup?.visible) return false;
        if (event.key === 'ArrowDown') popup.move(1);
        else if (event.key === 'ArrowUp') popup.move(-1);
        else if (event.key === 'Enter' || event.key === 'Tab') pick(popup.index);
        else if (event.key === 'Escape') popup.hide();
        else if (/^[1-9]$/.test(event.key)) pick(Number(event.key) - 1);
        else {
          popup.hide();
          return false;
        }
        return true;
      },
      handleDOMEvents: {
        blur: () => {
          setTimeout(() => popup?.hide(), 100);
          return false;
        },
      },
    },
  });

  return { plugin, open };
}
