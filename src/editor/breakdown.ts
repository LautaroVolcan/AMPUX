import { Plugin, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Mark } from 'prosemirror-model';
import { TAG_CATEGORIES, type TagCategory } from '../types';
import { schema } from './schema';
import { Popup } from './popup';

interface Action {
  label: string;
  color?: string;
  run: (view: EditorView) => void;
}

/** Rango contiguo que cubre la etiqueta `category` alrededor de `pos`. */
function tagExtent(state: EditorState, pos: number, category: string) {
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  const start = $pos.start();
  const has = (marks: readonly Mark[]) => marks.some((m) => m.type.name === 'tag' && m.attrs.category === category);
  let from = -1;
  let to = -1;
  let offset = 0;
  let result = null as { from: number; to: number } | null;
  const close = () => {
    if (!result && from >= 0 && pos >= from && pos <= to) result = { from, to };
    from = -1;
  };
  parent.forEach((child) => {
    const a = start + offset;
    if (has(child.marks)) {
      if (from < 0) from = a;
      to = a + child.nodeSize;
    } else close();
    offset += child.nodeSize;
  });
  close();
  return result;
}

/** Modo desglose: al seleccionar texto aparece la paleta de categorías. */
export function breakdownPlugin(opts: { isActive: () => boolean; label: (c: TagCategory) => string; removeLabel: (c?: TagCategory) => string }) {
  let popup: Popup | null = null;
  let actions: Action[] = [];

  const refresh = (view: EditorView) => {
    if (!popup) return;
    const { state } = view;
    const sel = state.selection;
    if (!opts.isActive() || !view.hasFocus()) return popup.hide();

    if (sel.empty) {
      // Cursor sobre una etiqueta: ofrecer quitarla.
      const marks = (sel.$from.marks().length ? sel.$from.marks() : sel.$from.nodeAfter?.marks ?? []).filter((m) => m.type.name === 'tag');
      if (!marks.length) return popup.hide();
      actions = marks.map((m) => ({
        label: opts.removeLabel(m.attrs.category),
        color: `var(--tag-${m.attrs.category})`,
        run: (v) => {
          const ext = tagExtent(v.state, sel.from, m.attrs.category);
          if (ext) v.dispatch(v.state.tr.removeMark(ext.from, ext.to, m));
        },
      }));
    } else {
      const { from, to } = sel;
      let tagged = false;
      state.doc.nodesBetween(from, to, (n) => {
        if (n.marks.some((m) => m.type.name === 'tag')) tagged = true;
      });
      actions = TAG_CATEGORIES.map((category) => ({
        label: opts.label(category),
        color: `var(--tag-${category})`,
        run: (v: EditorView) => v.dispatch(v.state.tr.addMark(from, to, schema.marks.tag.create({ category }))),
      }));
      if (tagged) {
        actions.push({ label: opts.removeLabel(), run: (v) => v.dispatch(v.state.tr.removeMark(from, to, schema.marks.tag)) });
      }
    }
    popup.show(view, sel.to, actions.map((a) => ({ label: a.label, color: a.color })));
    popup.onPick = (i) => {
      actions[i].run(view);
      popup?.hide();
      view.focus();
    };
  };

  return new Plugin({
    view(view) {
      popup = new Popup('breakdown-menu');
      return {
        update(v, prev) {
          if (v.state.selection.eq(prev.selection) && v.state.doc.eq(prev.doc)) return;
          refresh(v);
        },
        destroy() {
          popup?.destroy();
          popup = null;
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
        if (!popup?.visible) return false;
        if (event.key === 'ArrowDown') popup.move(1);
        else if (event.key === 'ArrowUp') popup.move(-1);
        else if (event.key === 'Enter') popup.onPick(popup.index);
        else if (event.key === 'Escape') popup.hide();
        else return false;
        return true;
      },
      handleDOMEvents: {
        blur: () => {
          setTimeout(() => popup?.hide(), 100);
          return false;
        },
        // Al soltar el mouse después de seleccionar.
        mouseup: (view) => {
          setTimeout(() => refresh(view), 0);
          return false;
        },
      },
    },
  });
}
