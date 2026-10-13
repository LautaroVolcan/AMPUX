import type { ElementType, ScriptElement, TagCategory } from '../types';
import { TAG_CATEGORIES } from '../types';
import type { PaginationResult } from '../pagination/paginate';
import { characterBaseName } from '../pagination/rules';

export interface SceneReport {
  index: number;
  id: string;
  number: string;
  heading: string;
  intExt: 'INT' | 'EXT' | 'INT/EXT' | '';
  location: string;
  time: string;
  page: number;
  /** Largo de la escena en octavos de página. */
  eighths: number;
  characters: string[];
  tags: Partial<Record<TagCategory, string[]>>;
}

const PREFIX_RE = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s*/i;

export function parseHeading(text: string): Pick<SceneReport, 'intExt' | 'location' | 'time'> {
  const upper = text.toLocaleUpperCase().trim();
  const m = PREFIX_RE.exec(upper);
  let intExt: SceneReport['intExt'] = '';
  if (m) {
    const p = m[1].replace(/[.\s]/g, '');
    intExt = p.includes('/') ? 'INT/EXT' : p.startsWith('INT') ? 'INT' : 'EXT';
  }
  const rest = m ? upper.slice(m[0].length) : upper;
  const dash = rest.lastIndexOf(' - ');
  return {
    intExt,
    location: (dash >= 0 ? rest.slice(0, dash) : rest).trim(),
    time: dash >= 0 ? rest.slice(dash + 3).trim() : '',
  };
}

/** "11" octavos → "1 3/8". */
export function formatEighths(n: number): string {
  const whole = Math.floor(n / 8);
  const rest = n % 8;
  if (!rest) return String(whole);
  return whole ? `${whole} ${rest}/8` : `${rest}/8`;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

export function sceneReports(elements: ScriptElement[], result: PaginationResult): SceneReport[] {
  // Líneas que ocupa cada elemento (incluye el espacio antes), sumando todas sus partes.
  const lines = new Array<number>(elements.length).fill(0);
  for (const page of result.pages) {
    for (const b of page.blocks) {
      if (b.elementIndex >= 0) lines[b.elementIndex] += b.lines.length + b.spaceBefore;
    }
  }
  const eighthLines = result.linesPerPage / 8;
  const scenes: SceneReport[] = [];
  elements.forEach((el, i) => {
    if (el.type !== 'scene') return;
    scenes.push({
      index: i,
      id: el.id,
      number: result.sceneNumbers.get(i) ?? '',
      heading: el.text.toLocaleUpperCase(),
      ...parseHeading(el.text),
      page: result.elementPage[i],
      eighths: 0,
      characters: [],
      tags: {},
    });
  });
  scenes.forEach((s, k) => {
    const end = scenes[k + 1]?.index ?? elements.length;
    let total = 0;
    const chars: string[] = [];
    const tags: Partial<Record<TagCategory, string[]>> = {};
    for (let i = s.index; i < end; i++) {
      const el = elements[i];
      total += lines[i];
      if (el.type === 'character') chars.push(characterBaseName(el.text));
      for (const t of el.tags ?? []) {
        const value = el.text.slice(t.from, t.to).trim().replace(/\s+/g, ' ');
        if (!value) continue;
        const key = t.category === 'cast' ? value.toLocaleUpperCase() : value;
        (tags[t.category] ??= []).push(key);
      }
    }
    s.eighths = Math.max(1, Math.round(total / eighthLines));
    s.characters = uniq(chars.filter(Boolean));
    for (const cat of Object.keys(tags) as TagCategory[]) tags[cat] = uniq(tags[cat]!);
    s.tags = tags;
  });
  return scenes;
}

export interface CharacterReport {
  name: string;
  scenes: string[];
  dialogues: number;
  firstPage: number;
}

export function characterReport(elements: ScriptElement[], scenes: SceneReport[], result: PaginationResult): CharacterReport[] {
  const map = new Map<string, CharacterReport>();
  const sceneOf = (i: number) => [...scenes].reverse().find((s) => s.index <= i);
  let speaker: string | null = null;
  elements.forEach((el, i) => {
    const t: ElementType = el.type;
    if (t === 'character') {
      speaker = characterBaseName(el.text);
      if (!speaker) return;
      const rep = map.get(speaker) ?? { name: speaker, scenes: [], dialogues: 0, firstPage: result.elementPage[i] };
      const sc = sceneOf(i);
      if (sc && !rep.scenes.includes(sc.number)) rep.scenes.push(sc.number);
      map.set(speaker, rep);
    } else if (t === 'dialogue' && speaker) {
      map.get(speaker)!.dialogues++;
    } else if (t !== 'parenthetical') {
      speaker = null;
    }
  });
  // Personajes etiquetados como Elenco que no hablan.
  for (const s of scenes) {
    for (const name of s.tags.cast ?? []) {
      const rep = map.get(name) ?? { name, scenes: [], dialogues: 0, firstPage: s.page };
      if (!rep.scenes.includes(s.number)) rep.scenes.push(s.number);
      map.set(name, rep);
    }
  }
  return [...map.values()].sort((a, b) => b.dialogues - a.dialogues || a.name.localeCompare(b.name));
}

export interface LocationReport {
  location: string;
  intExt: string[];
  times: string[];
  scenes: string[];
  eighths: number;
}

export function locationReport(scenes: SceneReport[]): LocationReport[] {
  const map = new Map<string, LocationReport>();
  for (const s of scenes) {
    const key = s.location || '—';
    const rep = map.get(key) ?? { location: key, intExt: [], times: [], scenes: [], eighths: 0 };
    if (s.intExt && !rep.intExt.includes(s.intExt)) rep.intExt.push(s.intExt);
    if (s.time && !rep.times.includes(s.time)) rep.times.push(s.time);
    rep.scenes.push(s.number);
    rep.eighths += s.eighths;
    map.set(key, rep);
  }
  return [...map.values()].sort((a, b) => b.eighths - a.eighths);
}

export interface TimeReport {
  time: string;
  scenes: string[];
  eighths: number;
}

export function timeReport(scenes: SceneReport[]): TimeReport[] {
  const map = new Map<string, TimeReport>();
  for (const s of scenes) {
    const key = s.time || '—';
    const rep = map.get(key) ?? { time: key, scenes: [], eighths: 0 };
    rep.scenes.push(s.number);
    rep.eighths += s.eighths;
    map.set(key, rep);
  }
  return [...map.values()].sort((a, b) => b.scenes.length - a.scenes.length);
}

export { TAG_CATEGORIES };

/** Tabla genérica para exportar. */
export interface Table {
  title: string;
  columns: string[];
  rows: string[][];
}

export function toCSV(table: Table): string {
  const cell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // BOM para que Excel abra bien los acentos.
  return '﻿' + [table.columns, ...table.rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
