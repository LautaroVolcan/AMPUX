import { Schema, type NodeSpec, type Node as PMNode } from 'prosemirror-model';
import { ELEMENT_TYPES, newId, type ElementType, type ScriptElement } from '../types';

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

export const schema = new Schema({ nodes, marks: {} });

export function nodeText(node: PMNode): string {
  return node.textBetween(0, node.content.size, undefined, '\n');
}

export function isElementEmpty(node: PMNode): boolean {
  const text = nodeText(node).trim();
  return text === '' || (node.type.name === 'parenthetical' && text === '()');
}

function inlineContent(text: string) {
  const parts = text.split('\n');
  const out: PMNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) out.push(schema.nodes.hard_break.create());
    if (part) out.push(schema.text(part));
  });
  return out;
}

export function elementToNode(el: ScriptElement): PMNode {
  const type = schema.nodes[el.type] ?? schema.nodes.action;
  const attrs = {
    id: el.id || newId(),
    sceneNumber: el.sceneNumber ?? null,
    dual: !!el.dual,
    synopsis: el.synopsis ?? null,
    color: el.color ?? null,
  };
  return type.create(attrs, inlineContent(el.text));
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
    out.push(el);
  });
  return out;
}
