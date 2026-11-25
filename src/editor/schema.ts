import { Schema, type MarkSpec, type NodeSpec, type Node as PMNode, type Mark } from 'prosemirror-model';
import { ELEMENT_TYPES, TEXT_STYLES, newId, type ElementType, type ScriptElement, type StyleRange, type TagCategory, type TagRef, type TextRange } from '../types';

function elementNode(type: ElementType): NodeSpec {
  return {
    content: 'inline*',
    group: 'element',
    defining: true,
    attrs: {
      id: { default: null },
      sceneNumber: { default: null },
      dual: { default: false },
      synopsis: { default: null },
      color: { default: null },
      revision: { default: null },
    },
    parseDOM: [
      {
        tag: `div[data-type="${type}"]`,
        getAttrs: (dom) => ({ id: (dom as HTMLElement).getAttribute('data-id') }),
      },
    ],
    toDOM: (node) => ['div', { class: `el el-${type}`, 'data-type': type, 'data-id': node.attrs.id }, 0],
  };
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'element+' },
  text: { group: 'inline' },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    leafText: () => '\n',
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },
};
for (const t of ELEMENT_TYPES) nodes[t] = elementNode(t);

const marks: Record<string, MarkSpec> = {
  // Etiqueta de desglose. `excludes: ''` permite superponer categorías distintas.
  tag: {
    attrs: { category: {} },
    excludes: '',
    inclusive: false,
    parseDOM: [{ tag: 'span[data-tag]', getAttrs: (dom) => ({ category: (dom as HTMLElement).getAttribute('data-tag') }) }],
    toDOM: (mark) => ['span', { class: `tag tag-${mark.attrs.category}`, 'data-tag': mark.attrs.category }, 0],
  },
  // Estilos de texto. Los nombres coinciden con TextStyle. Al pegar desde otras apps se reconocen <b>/<strong>, <i>/<em> y <u>.
  bold: {
    parseDOM: [
      { tag: 'strong' },
      // Google Docs envuelve todo en <b style="font-weight:normal">.
      { tag: 'b', getAttrs: (dom) => (dom as HTMLElement).style.fontWeight !== 'normal' && null },
      { style: 'font-weight', getAttrs: (v) => /^(bold(er)?|[6-9]\d\d)$/.test(v as string) && null },
    ],
    toDOM: () => ['strong', 0],
  },
  italic: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
    toDOM: () => ['em', 0],
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration', getAttrs: (v) => (v as string).includes('underline') && null }],
    toDOM: () => ['u', 0],
  },
  // Resaltador. No es inclusivo: escribir justo después de un tramo resaltado no lo extiende.
  highlight: {
    inclusive: false,
    parseDOM: [{ tag: 'mark.hl' }],
    toDOM: () => ['mark', { class: 'hl' }, 0],
  },
};

export const schema = new Schema({ nodes, marks });

export function nodeText(node: PMNode): string {
  return node.textBetween(0, node.content.size, undefined, '\n');
}

export function isElementEmpty(node: PMNode): boolean {
  const text = nodeText(node).trim();
  return text === '' || (node.type.name === 'parenthetical' && text === '()');
}

function inlineContent(text: string, tags: TagRef[] = [], highlights: TextRange[] = [], styles: StyleRange[] = []) {
  // Cortes en cada borde de etiqueta, estilo o resaltado y en cada salto de línea.
  const cuts = new Set<number>([0, text.length]);
  for (const t of [...tags, ...highlights, ...styles]) {
    cuts.add(Math.max(0, Math.min(text.length, t.from)));
    cuts.add(Math.max(0, Math.min(text.length, t.to)));
  }
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') cuts.add(i).add(i + 1);
  const points = [...cuts].sort((a, b) => a - b);
  const covers = (r: TextRange, a: number, b: number) => r.from <= a && r.to >= b;
  const out: PMNode[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const [a, b] = [points[k], points[k + 1]];
    const seg = text.slice(a, b);
    if (!seg) continue;
    // Estilos y resaltado (no las etiquetas) también van sobre el salto de línea, para que el tramo no se parta.
    const marks = TEXT_STYLES.filter((st) => styles.some((r) => r.style === st && covers(r, a, b))).map((st) => schema.marks[st].create());
    if (highlights.some((h) => covers(h, a, b))) marks.push(schema.marks.highlight.create());
    if (seg === '\n') {
      out.push(schema.nodes.hard_break.create(null, null, marks));
      continue;
    }
    const tagMarks = tags.filter((t) => covers(t, a, b)).map((t) => schema.marks.tag.create({ category: t.category }));
    out.push(schema.text(seg, [...tagMarks, ...marks]));
  }
  return out;
}

/** Etiquetas de desglose de un nodo, como rangos de texto (adyacentes de la misma categoría se unen). */
export function nodeTags(node: PMNode): TagRef[] {
  const tags: TagRef[] = [];
  const open = new Map<TagCategory, TagRef>();
  let offset = 0;
  node.forEach((child) => {
    const size = child.isText ? child.text!.length : 1;
    const cats = new Set(child.marks.filter((m: Mark) => m.type.name === 'tag').map((m: Mark) => m.attrs.category as TagCategory));
    for (const [cat, ref] of open) {
      if (!cats.has(cat)) open.delete(cat);
      else ref.to = offset + size;
    }
    for (const cat of cats) {
      if (!open.has(cat)) {
        const ref = { category: cat, from: offset, to: offset + size };
        open.set(cat, ref);
        tags.push(ref);
      }
    }
    offset += size;
  });
  return tags;
}

/** Tramos con la marca `name` en un nodo, como rangos de texto (los adyacentes se unen). */
function nodeMarkRanges(node: PMNode, name: string): TextRange[] {
  const out: TextRange[] = [];
  let offset = 0;
  let open: TextRange | null = null;
  node.forEach((child) => {
    const size = child.isText ? child.text!.length : 1;
    if (child.marks.some((m: Mark) => m.type.name === name)) {
      if (open) open.to = offset + size;
      else out.push((open = { from: offset, to: offset + size }));
    } else open = null;
    offset += size;
  });
  return out;
}

/** Tramos resaltados de un nodo. */
export function nodeHighlights(node: PMNode): TextRange[] {
  return nodeMarkRanges(node, 'highlight');
}

/** Negrita, cursiva y subrayado de un nodo. */
export function nodeStyles(node: PMNode): StyleRange[] {
  return TEXT_STYLES.flatMap((style) => nodeMarkRanges(node, style).map((r) => ({ style, ...r })));
}

export function elementToNode(el: ScriptElement): PMNode {
  const type = schema.nodes[el.type] ?? schema.nodes.action;
  const attrs = {
    id: el.id || newId(),
    sceneNumber: el.sceneNumber ?? null,
    dual: !!el.dual,
    synopsis: el.synopsis ?? null,
    color: el.color ?? null,
    revision: el.revision ?? null,
  };
  return type.create(attrs, inlineContent(el.text, el.tags, el.highlights, el.styles));
}

export function elementsToDoc(elements: ScriptElement[]): PMNode {
  const list = elements.length ? elements : [{ id: newId(), type: 'scene' as ElementType, text: '' }];
  return schema.nodes.doc.create(null, list.map(elementToNode));
}

export function docToElements(doc: PMNode): ScriptElement[] {
  const out: ScriptElement[] = [];
  doc.forEach((node) => {
    const el: ScriptElement = { id: node.attrs.id, type: node.type.name as ElementType, text: nodeText(node) };
    if (node.attrs.sceneNumber) el.sceneNumber = node.attrs.sceneNumber;
    if (node.attrs.dual) el.dual = true;
    if (node.attrs.synopsis) el.synopsis = node.attrs.synopsis;
    if (node.attrs.color) el.color = node.attrs.color;
    if (node.attrs.revision) el.revision = node.attrs.revision;
    const tags = nodeTags(node);
    if (tags.length) el.tags = tags;
    const styles = nodeStyles(node);
    if (styles.length) el.styles = styles;
    const highlights = nodeHighlights(node);
    if (highlights.length) el.highlights = highlights;
    out.push(el);
  });
  return out;
}
