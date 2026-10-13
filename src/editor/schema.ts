import { Schema, type MarkSpec, type NodeSpec, type Node as PMNode, type Mark } from 'prosemirror-model';
import { ELEMENT_TYPES, newId, type ElementType, type ScriptElement, type TagCategory, type TagRef } from '../types';

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
};

export const schema = new Schema({ nodes, marks });

export function nodeText(node: PMNode): string {
  return node.textBetween(0, node.content.size, undefined, '\n');
}

export function isElementEmpty(node: PMNode): boolean {
  const text = nodeText(node).trim();
  return text === '' || (node.type.name === 'parenthetical' && text === '()');
}

function inlineContent(text: string, tags: TagRef[] = []) {
  // Cortes en cada borde de etiqueta y en cada salto de línea.
  const cuts = new Set<number>([0, text.length]);
  for (const t of tags) {
    cuts.add(Math.max(0, Math.min(text.length, t.from)));
    cuts.add(Math.max(0, Math.min(text.length, t.to)));
  }
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') cuts.add(i).add(i + 1);
  const points = [...cuts].sort((a, b) => a - b);
  const out: PMNode[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const [a, b] = [points[k], points[k + 1]];
    const seg = text.slice(a, b);
    if (!seg) continue;
    if (seg === '\n') {
      out.push(schema.nodes.hard_break.create());
      continue;
    }
    const marks = tags.filter((t) => t.from <= a && t.to >= b).map((t) => schema.marks.tag.create({ category: t.category }));
    out.push(schema.text(seg, marks));
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
  return type.create(attrs, inlineContent(el.text, el.tags));
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
    out.push(el);
  });
  return out;
}
