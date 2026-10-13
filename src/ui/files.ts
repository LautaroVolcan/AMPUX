import { parseFountain } from '../formats/fountain/parse';
import { parseFDX } from '../formats/fdx/fdx';
import { importJSON } from '../formats/text/plain';
import { normalizeProject } from '../storage/db';
import { DEFAULT_SETTINGS, newId, type Language, type Project, type ScriptElement } from '../types';

/** Adivina el idioma del guion por los momentos del día de los encabezados. */
export function detectLanguage(elements: ScriptElement[]): Language {
  let en = 0;
  let es = 0;
  for (const e of elements) {
    if (e.type !== 'scene') continue;
    if (/\b(DAY|NIGHT|CONTINUOUS|LATER)\b/i.test(e.text)) en++;
    if (/\b(DÍA|DIA|NOCHE|CONTINUO|MÁS TARDE)\b/i.test(e.text)) es++;
  }
  return en > es ? 'en' : 'es';
}

/** Abre el selector de archivos y devuelve el elegido. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export const IMPORT_ACCEPT = '.fountain,.spmd,.txt,.fdx,.json';

/** Convierte un archivo importado en un proyecto (Fountain o backup JSON). */
export async function fileToProject(file: File): Promise<Project> {
  const text = await file.text();
  const base = file.name.replace(/\.[^.]+$/, '');
  if (file.name.toLowerCase().endsWith('.json')) {
    const p = importJSON(text);
    return normalizeProject({ ...p, id: newId(), updatedAt: Date.now() });
  }
  const doc = file.name.toLowerCase().endsWith('.fdx') ? parseFDX(text) : parseFountain(text);
  const title = doc.titlePage.title?.split('\n')[0] || base;
  return normalizeProject({
    title,
    titlePage: { title, credit: doc.titlePage.credit ?? 'Escrito por', author: doc.titlePage.author ?? '', ...doc.titlePage },
    elements: doc.elements,
    settings: {
      ...DEFAULT_SETTINGS,
      language: detectLanguage(doc.elements),
      // Si el archivo trae números de escena, se respetan bloqueados.
      lockedNumbers: doc.elements.some((e) => e.type === 'scene' && e.sceneNumber),
    },
  });
}

export function safeFilename(name: string) {
  return (name || 'guion').replace(/[\\/:*?"<>|]+/g, '').trim() || 'guion';
}
