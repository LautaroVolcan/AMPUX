/** Colores de los cursores: se leen sobre la hoja clara y la oscura, y no se confunden con el naranja del resaltador. */
export const CURSOR_COLORS = ['#2f6fdb', '#1f9d6b', '#8b5cf6', '#d1347a', '#0e8f8a', '#5b5bd6', '#be123c', '#6b7280'];

/** Color estable para cada usuario. */
export function userColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return CURSOR_COLORS[h % CURSOR_COLORS.length];
}

/** Cursor de otra persona: una línea de su color con el nombre arriba. */
export function cursorBuilder(user: { name?: string; color?: string }): HTMLElement {
  const cursor = document.createElement('span');
  cursor.className = 'remote-cursor';
  cursor.style.setProperty('--cursor-color', user.color ?? CURSOR_COLORS[0]);
  const label = document.createElement('span');
  label.className = 'remote-cursor-name';
  label.textContent = user.name ?? '';
  cursor.append(label);
  return cursor;
}

/** Selección de otra persona: su color, translúcido. */
export function selectionBuilder(user: { color?: string }) {
  return { style: `background-color: color-mix(in srgb, ${user.color ?? CURSOR_COLORS[0]} 22%, transparent)`, class: 'remote-selection' };
}

/**
 * Colores sin repetir entre las personas conectadas. Todos los navegadores calculan lo mismo con la misma lista,
 * así no hace falta coordinarse: se ordena por id de conexión (la persona con varias pestañas cuenta una vez, con
 * su id más bajo) y cada una toma su color preferido o, si ya está tomado, el siguiente libre.
 */
export function assignColors(users: { clientId: number; name: string }[]): Map<string, string> {
  const rank = new Map<string, number>();
  for (const u of users) rank.set(u.name, Math.min(rank.get(u.name) ?? Infinity, u.clientId));
  const order = [...rank.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const name of order) {
    const start = CURSOR_COLORS.indexOf(userColor(name));
    let color = CURSOR_COLORS[start];
    for (let k = 0; k < CURSOR_COLORS.length && taken.has(color); k++) color = CURSOR_COLORS[(start + k + 1) % CURSOR_COLORS.length];
    taken.add(color);
    out.set(name, color);
  }
  return out;
}

export interface Peer {
  name: string;
  color: string;
}

/** Iniciales para el círculo: "amparoandreoli" → "AM", "Ana López" → "AL". */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}
