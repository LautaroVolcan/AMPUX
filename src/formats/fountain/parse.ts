import { newId, type ElementType, type ScriptElement, type TitlePage } from '../../types';

export interface FountainDocument {
  titlePage: Partial<TitlePage>;
  elements: ScriptElement[];
}

const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[. ]/i;
const SCENE_NUMBER_RE = /\s*#([\w.\-]+)#\s*$/;

/** Quita marcas de énfasis de Fountain (*, **, ***, _) respetando los escapes. */
export function stripEmphasis(text: string): string {
  const ESC_STAR = '\u0001';
  const ESC_UND = '\u0002';
  return text
    .replace(/\\\*/g, ESC_STAR)
    .replace(/\\_/g, ESC_UND)
    .replace(/(\*{1,3})(?=\S)([^*\n]+?)(?<=\S)\1/g, '$2')
    .replace(/_(?=\S)([^_\n]+?)(?<=\S)_/g, '$1')
    .replace(new RegExp(ESC_STAR, 'g'), '*')
    .replace(new RegExp(ESC_UND, 'g'), '_');
}

function isUpper(text: string): boolean {
  return /\p{L}/u.test(text) && text === text.toLocaleUpperCase();
}

const TITLE_KEYS: Record<string, keyof TitlePage> = {
  title: 'title',
  credit: 'credit',
  author: 'author',
  authors: 'author',
  source: 'source',
  'draft date': 'draftDate',
  date: 'draftDate',
  contact: 'contact',
};

function parseTitlePage(lines: string[]): { titlePage: Partial<TitlePage>; consumed: number } {
  const titlePage: Partial<TitlePage> = {};
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length || !/^[A-Za-z][A-Za-z ]*:/.test(lines[i])) return { titlePage, consumed: 0 };

  let currentKey: keyof TitlePage | null = null;
  const values: Partial<Record<keyof TitlePage, string[]>> = {};
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    const kv = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(line);
    if (kv && !/^(\s{3,}|\t)/.test(line)) {
      const key = TITLE_KEYS[kv[1].trim().toLowerCase()] ?? null;
      currentKey = key;
      if (key) values[key] = kv[2].trim() ? [kv[2].trim()] : [];
    } else if (currentKey) {
      values[currentKey]!.push(line.trim());
    }
  }
  for (const [key, val] of Object.entries(values) as [keyof TitlePage, string[]][]) {
    titlePage[key] = stripEmphasis(val.join('\n'));
  }
  return { titlePage, consumed: i };
}

export function parseFountain(source: string): FountainDocument {
  let text = source.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  // Boneyard y notas no se imprimen.
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  text = text.replace(/\[\[[\s\S]*?\]\]/g, '');

  const allLines = text.split('\n');
  const { titlePage, consumed } = parseTitlePage(allLines);
  const lines = allLines.slice(consumed);

  const elements: ScriptElement[] = [];
  const add = (type: ElementType, value: string, extra: Partial<ScriptElement> = {}) => {
    elements.push({ id: newId(), type, text: stripEmphasis(value), ...extra });
  };
  const last = () => elements[elements.length - 1];

  let prevBlank = true;
  let inDialogue = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const nextLine = lines[i + 1];
    const nextBlank = nextLine === undefined || nextLine.trim() === '';

    if (line === '') {
      // Dos espacios dentro de un diálogo = línea en blanco que no corta el diálogo.
      if (inDialogue && raw === '  ' && last()?.type === 'dialogue') {
        last().text += '\n';
        continue;
      }
      prevBlank = true;
      inDialogue = false;
      continue;
    }

    if (inDialogue) {
      if (line.startsWith('(') && line.endsWith(')')) {
        add('parenthetical', line);
      } else if (last()?.type === 'dialogue') {
        last().text += '\n' + stripEmphasis(line);
      } else {
        add('dialogue', line);
      }
      prevBlank = false;
      continue;
    }

    // Saltos de página, secciones y sinopsis.
    if (/^={3,}$/.test(line)) {
      prevBlank = true;
      continue;
    }
    if (line.startsWith('#')) {
      const level = /^#+/.exec(line)![0].length;
      if (level === 1) add('act', line.slice(1).trim());
      prevBlank = true;
      continue;
    }
    if (/^=(?!=)/.test(line)) {
      // Sinopsis: se guarda en la tarjeta de la escena actual.
      const scene = [...elements].reverse().find((e) => e.type === 'scene');
      const text = line.slice(1).trim();
      if (scene && text) scene.synopsis = scene.synopsis ? `${scene.synopsis}\n${text}` : text;
      prevBlank = true;
      continue;
    }

    // Elementos forzados.
    if (line.startsWith('!')) {
      addAction(line.slice(1));
      continue;
    }
    if (line.startsWith('@')) {
      addCharacter(line.slice(1));
      continue;
    }
    if (/^\.[^.]/.test(line)) {
      addScene(line.slice(1));
      continue;
    }
    if (line.startsWith('>') && line.endsWith('<')) {
      add('general', line.slice(1, -1).trim());
      prevBlank = false;
      continue;
    }
    if (line.startsWith('>')) {
      add('transition', line.slice(1).trim());
      prevBlank = false;
      continue;
    }
    if (line.startsWith('~')) {
      add('general', line.slice(1).trim());
      prevBlank = false;
      continue;
    }

    if (prevBlank && SCENE_RE.test(line)) {
      addScene(line);
      continue;
    }
    if (prevBlank && nextBlank && isUpper(line) && /TO:$/.test(line)) {
      add('transition', line);
      prevBlank = false;
      continue;
    }
    if (prevBlank && !nextBlank) {
      const name = line.replace(/\^$/, '').replace(/\(.*?\)/g, '').trim();
      if (name && isUpper(name)) {
        addCharacter(line);
        continue;
      }
    }

    addAction(raw.replace(/\t/g, '    ').trimEnd());
  }

  return { titlePage, elements };

  function addScene(value: string) {
    const m = SCENE_NUMBER_RE.exec(value);
    const textValue = m ? value.slice(0, m.index) : value;
    add('scene', textValue.trim(), m ? { sceneNumber: m[1] } : {});
    prevBlank = false;
  }

  function addCharacter(value: string) {
    let name = value.trim();
    let dual = false;
    if (name.endsWith('^')) {
      dual = true;
      name = name.slice(0, -1).trim();
    }
    add('character', name, dual ? { dual } : {});
    inDialogue = true;
    prevBlank = false;
  }

  function addAction(content: string) {
    if (!prevBlank && last()?.type === 'action') {
      last().text += '\n' + stripEmphasis(content);
    } else {
      add('action', content);
    }
    prevBlank = false;
  }
}
