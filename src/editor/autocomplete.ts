import { Plugin, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { ElementType, Language } from '../types';
import { characterBaseName } from '../pagination/rules';
import { nodeText, schema } from './schema';
import { Popup } from './popup';

export interface Suggestion {
  label: string;
  /** Texto completo con el que queda el bloque. */
  value: string;
}

const SCENE_PREFIXES = ['INT.', 'EXT.', 'INT./EXT.', 'I/E'];
const SCENE_PREFIX_PARSE = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.?|INT\.|EXT\.|EST\.|I\/E\.?)\s*/i;

const TIMES: Record<Language, string[]> = {
  es: ['DÍA', 'NOCHE', 'CONTINUO', 'MÁS TARDE', 'MOMENTOS DESPUÉS'],
  en: ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MOMENTS LATER'],
};
const TRANSITIONS: Record<Language, string[]> = {
  es: ['CORTE A:', 'FUNDIDO A:', 'FUNDIDO A NEGRO.', 'DISOLVENCIA A:', 'CORTE A NEGRO.', 'FUNDIDO DE ENTRADA:'],
  en: ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'FADE OUT.', 'FADE IN:', 'FADE TO BLACK.'],
};
const SUFFIXES: Record<Language, string[]> = {
  es: ['(V.O.)', '(O.S.)', '(CONT.)'],
  en: ['(V.O.)', '(O.S.)', "(CONT'D)"],
};

export interface ScriptVocabulary {
  characters: string[]; // por frecuencia
  locations: string[];
  times: string[];
  transitions: string[];
}

function byFrequency(values: string[]): string[] {
  const count = new Map<string, number>();
  values.forEach((v) => v && count.set(v, (count.get(v) ?? 0) + 1));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

export function splitSceneHeading(text: string) {
  const upper = text.toLocaleUpperCase();
  const m = SCENE_PREFIX_PARSE.exec(upper);
  if (!m) return null;
  const rest = upper.slice(m[0].length);
  const dash = rest.lastIndexOf(' - ');
  return {
    prefix: m[1],
    location: (dash >= 0 ? rest.slice(0, dash) : rest).trim(),
    time: dash >= 0 ? rest.slice(dash + 3).trim() : null,
    hasTime: dash >= 0,
    rawRest: rest,
  };
}

export function collectVocabulary(doc: PMNode, skipPos = -1): ScriptVocabulary {
  const chars: string[] = [];
  const locs: string[] = [];
  const times: string[] = [];
  const trans: string[] = [];
  doc.forEach((node, offset) => {
    if (offset === skipPos) return;
    const text = nodeText(node);
    switch (node.type.name) {
      case 'character':
        chars.push(characterBaseName(text));
        break;
      case 'scene': {
        const parts = splitSceneHeading(text);
        if (parts?.location) locs.push(parts.location);
        if (parts?.time) times.push(parts.time);
        break;
      }
      case 'transition':
        trans.push(text.trim().toLocaleUpperCase());
    }
  });
  return { characters: byFrequency(chars), locations: byFrequency(locs), times: byFrequency(times), transitions: byFrequency(trans) };
}

const uniq = (xs: string[]) => [...new Set(xs)];

export function suggest(type: ElementType, text: string, vocab: ScriptVocabulary, lang: Language): Suggestion[] {
  const upper = text.toLocaleUpperCase();
  const trimmed = upper.trim();
  if (type === 'character') {
    const name = characterBaseName(upper);
    if (vocab.characters.includes(name) && /\s\(?$/.test(upper) && !upper.includes(')')) {
      return SUFFIXES[lang].map((s) => ({ label: `${name} ${s}`, value: `${name} ${s}` }));
    }
    if (vocab.characters.includes(trimmed)) return [];
    return vocab.characters
      .filter((c) => c.startsWith(trimmed) && c !== trimmed)
      .slice(0, 8)
      .map((c) => ({ label: c, value: c }));
  }

  if (type === 'scene') {
    const parts = splitSceneHeading(upper);
    if (!parts) {
      return SCENE_PREFIXES.filter((p) => p.startsWith(trimmed) && p !== trimmed).map((p) => ({ label: p, value: `${p} ` }));
    }
    if (!parts.hasTime) {
      // No sugerir locaciones hasta que haya espacio después del prefijo.
      if (!/\s/.test(upper.slice(parts.prefix.length, parts.prefix.length + 1)) && parts.rawRest === '') return [];
      if (vocab.locations.includes(parts.location)) return [];
      return vocab.locations
        .filter((l) => l.startsWith(parts.location) && l !== parts.location)
        .slice(0, 8)
        .map((l) => ({ label: l, value: `${parts.prefix} ${l} - ` }));
    }
    const times = uniq([...TIMES[lang], ...vocab.times]);
    if (parts.time && times.includes(parts.time)) return [];
    return times
      .filter((t) => t.startsWith(parts.time ?? '') && t !== parts.time)
      .slice(0, 8)
      .map((t) => ({ label: t, value: `${parts.prefix} ${parts.location} - ${t}` }));
  }

  if (type === 'transition') {
    const all = uniq([...TRANSITIONS[lang], ...vocab.transitions]);
    if (all.includes(trimmed)) return [];
    return all
      .filter((t) => t.startsWith(trimmed) && t !== trimmed)
      .slice(0, 8)
      .map((t) => ({ label: t, value: t }));
  }
  return [];
}

export function autocompletePlugin(getLang: () => Language) {
  let popup: Popup | null = null;
  let current: Suggestion[] = [];
  let dismissedText: string | null = null;
  let blockPos = -1;

  const apply = (view: EditorView, s: Suggestion) => {
    const node = view.state.doc.nodeAt(blockPos);
    if (!node) return;
    const tr = view.state.tr.replaceWith(blockPos + 1, blockPos + node.nodeSize - 1, schema.text(s.value));
    tr.setSelection(TextSelection.create(tr.doc, blockPos + 1 + s.value.length));
    tr.setMeta('noAutodetect', true);
    view.dispatch(tr);
  };

  const refresh = (view: EditorView) => {
    if (!popup) return;
    const { state } = view;
    const sel = state.selection;
    if (!sel.empty || !view.hasFocus() || sel.$from.depth < 1) return popup.hide();
    const node = sel.$from.node(1);
    const type = node.type.name as ElementType;
    if (type !== 'character' && type !== 'scene' && type !== 'transition') return popup.hide();
    if (sel.$from.parentOffset !== node.content.size) return popup.hide();
    const text = nodeText(node);
    if (dismissedText !== null && dismissedText === text) return popup.hide();
    dismissedText = null;
    blockPos = sel.$from.before(1);
    current = suggest(type, text, collectVocabulary(state.doc, blockPos), getLang());
    if (!current.length) return popup.hide();
    popup.show(view, sel.from, current.map((s) => ({ label: s.label })));
    popup.onPick = (i) => apply(view, current[i]);
  };

  return new Plugin({
    view(view) {
      popup = new Popup('autocomplete');
      const onBlur = () => setTimeout(() => popup?.hide(), 100);
      view.dom.addEventListener('blur', onBlur);
      return {
        update(v, prev) {
          if (v.state.doc.eq(prev.doc) && v.state.selection.eq(prev.selection)) return;
          refresh(v);
        },
        destroy() {
          view.dom.removeEventListener('blur', onBlur);
          popup?.destroy();
          popup = null;
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
        if (!popup?.visible) return false;
        switch (event.key) {
          case 'ArrowDown':
            popup.move(1);
            return true;
          case 'ArrowUp':
            popup.move(-1);
            return true;
          case 'Enter':
          case 'Tab':
            if (event.shiftKey) return false;
            apply(view, current[popup.index]);
            return true;
          case 'Escape':
            dismissedText = nodeText(view.state.selection.$from.node(1));
            popup.hide();
            return true;
        }
        return false;
      },
    },
  });
}
