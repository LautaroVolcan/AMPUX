export type ElementType =
  | 'scene' // Encabezado de escena
  | 'action' // Acción / descripción
  | 'character' // Nombre de personaje
  | 'parenthetical' // Acotación
  | 'dialogue' // Diálogo
  | 'transition' // Transición
  | 'shot' // Plano
  | 'general' // Texto sin formato especial
  | 'act'; // Corte de acto / título de acto

export const ELEMENT_TYPES: ElementType[] = [
  'scene',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
  'general',
  'act',
];

export type CardColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
export const CARD_COLORS: CardColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

export interface TagRef {
  category: string;
  from: number;
  to: number;
}

export interface ScriptElement {
  id: string;
  type: ElementType;
  /** Texto plano. Los saltos de línea forzados se representan con "\n". */
  text: string;
  sceneNumber?: string;
  dual?: boolean;
  /** Tarjeta (solo para 'scene'). */
  synopsis?: string;
  color?: CardColor;
  tags?: TagRef[];
  revision?: string;
}

export interface TitlePage {
  title: string;
  credit: string;
  author: string;
  source?: string;
  draftDate?: string;
  contact?: string;
}

export type Language = 'es' | 'en';

export interface ProjectSettings {
  pageSize: 'letter' | 'a4';
  sceneNumbers: 'none' | 'left' | 'both';
  showMoreContd: boolean;
  language: Language;
  /** Líneas en blanco antes de un encabezado de escena que no abre página. */
  sceneSpacing: 1 | 2;
  /** (CONT.) automático cuando el mismo personaje retoma después de una acción. */
  autoContd: boolean;
  /** Numeración bloqueada: las escenas nuevas reciben 5A, 5B… */
  lockedNumbers: boolean;
}

export interface Project {
  id: string;
  title: string;
  titlePage: TitlePage;
  elements: ScriptElement[];
  settings: ProjectSettings;
  /** Notas por escena, indexadas por id del encabezado. */
  notes: Record<string, string>;
  pageCount?: number;
  updatedAt: number;
  createdAt: number;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  pageSize: 'letter',
  sceneNumbers: 'none',
  showMoreContd: true,
  language: 'es',
  sceneSpacing: 1,
  autoContd: true,
  lockedNumbers: false,
};

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function newProject(title = 'Sin título'): Project {
  const now = Date.now();
  return {
    id: newId(),
    title,
    titlePage: { title, credit: 'Escrito por', author: '' },
    elements: [{ id: newId(), type: 'scene', text: '' }],
    settings: { ...DEFAULT_SETTINGS },
    notes: {},
    updatedAt: now,
    createdAt: now,
  };
}
