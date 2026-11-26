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
