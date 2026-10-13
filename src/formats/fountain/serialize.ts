import type { ScriptElement, TitlePage } from '../../types';

const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[. ]/i;
const FORCE_CHARS = /^[!@.>~#=]/;

function isUpper(text: string): boolean {
  return /\p{L}/u.test(text) && text === text.toLocaleUpperCase();
}

function titlePageBlock(tp: Partial<TitlePage>): string {
  const rows: [string, string | undefined][] = [
    ['Title', tp.title],
    ['Credit', tp.credit],
    ['Author', tp.author],
    ['Source', tp.source],
    ['Draft date', tp.draftDate],
    ['Contact', tp.contact],
  ];
  const out: string[] = [];
  for (const [key, value] of rows) {
    if (!value || !value.trim()) continue;
    const parts = value.split('\n');
    if (parts.length === 1) out.push(`${key}: ${parts[0]}`);
    else out.push(`${key}:`, ...parts.map((p) => `    ${p}`));
  }
  return out.join('\n');
}

export interface FountainOptions {
  /** Números de escena a escribir (#5A#). Si no se pasan, se usan los guardados en cada escena. */
  sceneNumbers?: Map<number, string>;
}

export function serializeFountain(elements: ScriptElement[], titlePage?: Partial<TitlePage>, opts: FountainOptions = {}): string {
  const chunks: string[] = [];
  const tp = titlePage ? titlePageBlock(titlePage) : '';
  if (tp) chunks.push(tp, '');

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const prev = elements[i - 1];
    const inDialogue =
      (el.type === 'dialogue' || el.type === 'parenthetical') &&
      prev &&
      (prev.type === 'character' || prev.type === 'dialogue' || prev.type === 'parenthetical');

    if (chunks.length && !inDialogue) chunks.push('');

    const text = el.text;
    switch (el.type) {
      case 'scene': {
        const upper = text.toLocaleUpperCase();
        const head = SCENE_RE.test(upper) ? upper : `.${upper}`;
        const num = opts.sceneNumbers ? opts.sceneNumbers.get(i) : el.sceneNumber;
        chunks.push(num ? `${head} #${num}#` : head);
        if (el.synopsis) chunks.push('', ...el.synopsis.split('\n').map((l) => `= ${l}`));
        break;
      }
      case 'character': {
        const upper = text.toLocaleUpperCase();
        const name = upper.replace(/\(.*?\)/g, '').trim();
        const forced = !isUpper(name) || SCENE_RE.test(upper);
        chunks.push(`${forced ? '@' : ''}${upper}${el.dual ? ' ^' : ''}`);
        break;
      }
      case 'parenthetical': {
        const t = text.trim();
        chunks.push(t.startsWith('(') ? t : `(${t})`);
        break;
      }
      case 'dialogue':
        // Las líneas en blanco dentro de un diálogo se escriben con dos espacios.
        chunks.push(text.split('\n').map((l) => (l === '' ? '  ' : l)).join('\n'));
        break;
      case 'transition': {
        const upper = text.toLocaleUpperCase();
        chunks.push(/TO:$/.test(upper) ? upper : `> ${upper}`);
        break;
      }
      case 'act':
        chunks.push(`# ${text}`);
        break;
      case 'shot':
        chunks.push(forceAction(text.toLocaleUpperCase()));
        break;
      case 'action':
      case 'general':
      default:
        chunks.push(forceAction(text));
    }
  }
  return chunks.join('\n') + '\n';
}

/** Antepone "!" si una acción podría interpretarse como otro elemento. */
function forceAction(text: string): string {
  const first = text.split('\n')[0];
  const lines = text.split('\n');
  const looksSpecial =
    FORCE_CHARS.test(first.trim()) ||
    SCENE_RE.test(first) ||
    (lines.length === 1 && isUpper(first) && /TO:$/.test(first.trim())) ||
    (lines.length > 1 && isUpper(first.replace(/\(.*?\)/g, '')));
  return looksSpecial ? `!${text}` : text;
}
