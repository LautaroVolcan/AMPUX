import { keymap } from 'prosemirror-keymap';
import { TextSelection } from 'prosemirror-state';
import { ENTER_FLOW, SHORTCUT_TYPES, TAB_FLOW, TAB_WITH_TEXT, shiftTabTarget } from './flow';
import {
  currentBlock,
  insertElementAfter,
  insertParentheticalInDialogue,
  isElementEmpty,
  toggleDual,
  setElementType,
  splitElement,
  type Command,
} from './commands';
import { schema, nodeText } from './schema';

export interface KeymapHooks {
  openTypeMenu: () => void;
  save: () => void;
  find: () => void;
}

export function scriptKeymap(hooks: KeymapHooks) {
  const enter: Command = (state, dispatch) => {
    const { node, type, $from } = currentBlock(state);
    if (state.selection.empty && isElementEmpty(node)) {
      if (dispatch) hooks.openTypeMenu();
      return true;
    }
    const text = nodeText(node);
    const offset = $from.parentOffset;
    const rest = text.slice(offset);
    const atEnd = state.selection.empty && (offset >= node.content.size || (type === 'parenthetical' && rest.trim() === ')'));
    if (atEnd) return insertElementAfter(ENTER_FLOW[type])(state, dispatch);
    return splitElement()(state, dispatch);
  };

  const tab: Command = (state, dispatch) => {
    const { node, type } = currentBlock(state);
    if (isElementEmpty(node)) {
      const target = TAB_FLOW[type];
      return target ? setElementType(target)(state, dispatch) : true;
    }
    const action = TAB_WITH_TEXT[type];
    if (action === 'insert-parenthetical') return insertParentheticalInDialogue(state, dispatch);
    if (action) return setElementType(action.convert)(state, dispatch);
    const target = TAB_FLOW[type];
    return target ? setElementType(target)(state, dispatch) : true;
  };

  const shiftTab: Command = (state, dispatch) => {
    const { type } = currentBlock(state);
    const target = shiftTabTarget(type);
    return target ? setElementType(target)(state, dispatch) : true;
  };

  const softBreak: Command = (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
    return true;
  };

  /** ")" con el cursor delante de ")" solo avanza. */
  const closeParen: Command = (state, dispatch) => {
    const { $from } = state.selection;
    if (!state.selection.empty || $from.parent.textBetween($from.parentOffset, Math.min($from.parent.content.size, $from.parentOffset + 1)) !== ')') return false;
    if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, $from.pos + 1)));
    return true;
  };

  const bindings: Record<string, Command> = {
    Enter: enter,
    Tab: tab,
    'Shift-Tab': shiftTab,
    'Shift-Enter': softBreak,
    ')': closeParen,
    'Mod-d': (state, dispatch) => {
      toggleDual(state, dispatch);
      return true;
    },
    'Mod-s': () => {
      hooks.save();
      return true;
    },
    'Mod-f': () => {
      hooks.find();
      return true;
    },
  };
  SHORTCUT_TYPES.forEach((type, i) => {
    bindings[`Mod-${i + 1}`] = setElementType(type);
  });
  return keymap(bindings);
}
