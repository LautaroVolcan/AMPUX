import { newId, type CardColor, type ElementType, type ScriptElement, type TitlePage } from '../../types';
import { findDualPairs } from '../../pagination/dual';

/** Tipos de párrafo de Final Draft ↔ tipos de AMPUX. */
const TO_FDX: Record<ElementType, string> = {
  scene: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  general: 'General',
  act: 'New Act',
};

const FROM_FDX: Record<string, ElementType> = {
  'scene heading': 'scene',
  action: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  shot: 'shot',
  general: 'general',
  'new act': 'act',
  'act break': 'act',
  'end of act': 'act',
  'cast list': 'general',
  lyrics: 'general',
};

/** Colores de tarjeta en el formato de Final Draft (#RRRRGGGGBBBB). */
const COLOR_HEX: Record<CardColor, string> = {
  red: '#E5E59C9C9C9C',
  orange: '#F4F4C6C69494',
  yellow: '#F3F3E6E69191',
  green: '#A8A8D7D7A8A8',
  blue: '#9C9CC3C3E5E5',
  purple: '#C8C8A9A9E0E0',
};

function hexToColor(hex: string | null): CardColor | undefined {
  if (!hex) return undefined;
  const h = hex.replace('#', '');
  // Acepta #RRGGBB y #RRRRGGGGBBBB.
  const step = h.length >= 12 ? 4 : 2;
  const [r, g, b] = [0, 1, 2].map((i) => parseInt(h.slice(i * step, i * step + 2), 16));
  if ([r, g, b].some(isNaN) || (r > 245 && g > 245 && b > 245)) return undefined;
  let best: CardColor | undefined;
  let dist = Infinity;
  for (const [name, value] of Object.entries(COLOR_HEX) as [CardColor, string][]) {
    const v = value.replace('#', '');
    const [cr, cg, cb] = [0, 1, 2].map((i) => parseInt(v.slice(i * 4, i * 4 + 2), 16));
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < dist) {
      dist = d;
      best = name;
    }
  }
  return best;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function paragraph(type: string, text: string, attrs = '', inner = ''): string {
  return `    <Paragraph Type="${type}"${attrs}>${inner}\n      <Text>${esc(text)}</Text>\n    </Paragraph>`;
}

export interface FdxOptions {
  sceneNumbers?: Map<number, string>;
}

export function serializeFDX(elements: ScriptElement[], titlePage?: Partial<TitlePage>, opts: FdxOptions = {}): string {
  const pairs = findDualPairs(elements);
  const dualStart = new Map(pairs.map((p) => [p.left[0], p.right[1]]));
  const out: string[] = [];

  const write = (el: ScriptElement, index: number) => {
    let attrs = '';
    let inner = '';
    if (el.type === 'scene') {
      const num = opts.sceneNumbers?.get(index) ?? el.sceneNumber;
      if (num) attrs += ` Number="${esc(num)}"`;
      if (el.synopsis || el.color) {
        const color = el.color ? ` Color="${COLOR_HEX[el.color]}"` : '';
        const summary = el.synopsis
          ? `<Summary><Paragraph><Text>${esc(el.synopsis)}</Text></Paragraph></Summary>`
          : '';
        inner = `\n      <SceneProperties Title=""${color}>${summary}</SceneProperties>`;
      }
    }
    return paragraph(TO_FDX[el.type], el.text, attrs, inner);
  };

  for (let i = 0; i < elements.length; i++) {
    const end = dualStart.get(i);
    if (end !== undefined) {
      const inner = elements.slice(i, end).map((el, k) => write(el, i + k).replace(/^/gm, '    ')).join('\n');
      out.push(`    <Paragraph>\n      <DualDialogue>\n${inner}\n      </DualDialogue>\n    </Paragraph>`);
      i = end - 1;
      continue;
    }
    out.push(write(elements[i], i));
  }

  const tp = titlePage ?? {};
  const tpPara = (text: string, align: 'Center' | 'Left' | 'Right' = 'Center') =>
    text
      .split('\n')
      .map((l) => `      <Paragraph Alignment="${align}" Type="General">\n        <Text>${esc(l)}</Text>\n      </Paragraph>`)
      .join('\n');
  const blank = `      <Paragraph Alignment="Center" Type="General">\n        <Text></Text>\n      </Paragraph>`;
  const titleParts: string[] = [];
  if (tp.title) titleParts.push(blank.repeat(1), tpPara(tp.title));
  if (tp.credit) titleParts.push(blank, tpPara(tp.credit));
  if (tp.author) titleParts.push(blank, tpPara(tp.author));
  if (tp.source) titleParts.push(blank, tpPara(tp.source));
  if (tp.draftDate) titleParts.push(blank, tpPara(tp.draftDate, 'Right'));
  if (tp.contact) titleParts.push(blank, tpPara(tp.contact, 'Left'));

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="5">',
    '  <Content>',
    ...out,
    '  </Content>',
    '  <TitlePage>',
    '    <Content>',
    ...titleParts,
    '    </Content>',
    '  </TitlePage>',
    '</FinalDraft>',
    '',
  ].join('\n');
}

export interface FdxDocument {
  titlePage: Partial<TitlePage>;
  elements: ScriptElement[];
}

function directChildren(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.tagName === name);
}

function paragraphText(p: Element): string {
  return directChildren(p, 'Text')
    .map((t) => t.textContent ?? '')
    .join('');
}

export function parseFDX(xml: string): FdxDocument {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido');
  const root = doc.documentElement;
  if (root.tagName !== 'FinalDraft') throw new Error('No es un archivo de Final Draft');

  const elements: ScriptElement[] = [];
  const content = directChildren(root, 'Content')[0];

  const readParagraph = (p: Element, dualSecond = false) => {
    const type = FROM_FDX[(p.getAttribute('Type') ?? '').toLowerCase()] ?? 'action';
    const el: ScriptElement = { id: newId(), type, text: paragraphText(p) };
    if (type === 'scene') {
      const num = p.getAttribute('Number');
      if (num) el.sceneNumber = num;
      const props = directChildren(p, 'SceneProperties')[0];
      if (props) {
        const color = hexToColor(props.getAttribute('Color'));
        if (color) el.color = color;
        const summary = directChildren(props, 'Summary')[0];
        const text = summary ? directChildren(summary, 'Paragraph').map(paragraphText).join('\n').trim() : '';
        if (text) el.synopsis = text;
      }
    }
    if (dualSecond) el.dual = true;
    elements.push(el);
  };

  for (const p of content ? directChildren(content, 'Paragraph') : []) {
    const dual = directChildren(p, 'DualDialogue')[0];
    if (dual) {
      let characters = 0;
      for (const inner of directChildren(dual, 'Paragraph')) {
        const isChar = (inner.getAttribute('Type') ?? '').toLowerCase() === 'character';
        if (isChar) characters++;
        readParagraph(inner, isChar && characters === 2);
      }
      continue;
    }
    readParagraph(p);
  }

  // Portada: textos centrados en orden (título, crédito, autor, fuente); izquierda = contacto; derecha = fecha.
  const titlePage: Partial<TitlePage> = {};
  const tpContent = root.getElementsByTagName('TitlePage')[0]?.getElementsByTagName('Content')[0];
  if (tpContent) {
    const centered: string[] = [];
    const left: string[] = [];
    const right: string[] = [];
    for (const p of directChildren(tpContent, 'Paragraph')) {
      const text = paragraphText(p).trim();
      if (!text) continue;
      const align = (p.getAttribute('Alignment') ?? 'Left').toLowerCase();
      (align === 'center' ? centered : align === 'right' ? right : left).push(text);
    }
    const [title, credit, author, ...rest] = centered;
    if (title) titlePage.title = title;
    if (credit) titlePage.credit = credit;
    if (author) titlePage.author = author;
    if (rest.length) titlePage.source = rest.join('\n');
    if (left.length) titlePage.contact = left.join('\n');
    if (right.length) titlePage.draftDate = right.join('\n');
  }

  return { titlePage, elements };
}
