import type { EditorView } from 'prosemirror-view';

export interface PopupItem {
  label: string;
  hint?: string;
}

/** Lista flotante junto al cursor (autocompletado y menú de tipos). */
export class Popup {
  dom: HTMLDivElement;
  items: PopupItem[] = [];
  index = 0;
  visible = false;
  onPick: (index: number) => void = () => {};

  constructor(className: string) {
    this.dom = document.createElement('div');
    this.dom.className = `popup ${className}`;
    this.dom.style.display = 'none';
    this.dom.addEventListener('mousedown', (e) => {
      const li = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      if (!li) return;
      e.preventDefault();
      this.onPick(Number(li.dataset.i));
    });
    document.body.appendChild(this.dom);
  }

  show(view: EditorView, pos: number, items: PopupItem[], index = 0) {
    this.items = items;
    this.index = Math.min(index, items.length - 1);
    this.visible = true;
    this.render();
    const coords = view.coordsAtPos(pos);
    this.dom.style.display = 'block';
    const height = this.dom.offsetHeight;
    const below = coords.bottom + 6;
    const top = below + height > window.innerHeight ? coords.top - height - 6 : below;
    this.dom.style.left = `${Math.max(8, Math.min(coords.left, window.innerWidth - this.dom.offsetWidth - 8))}px`;
    this.dom.style.top = `${top}px`;
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.dom.style.display = 'none';
  }

  move(delta: number) {
    if (!this.items.length) return;
    this.index = (this.index + delta + this.items.length) % this.items.length;
    this.render();
  }

  private render() {
    this.dom.innerHTML = '';
    this.items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'popup-item' + (i === this.index ? ' active' : '');
      row.dataset.i = String(i);
      const label = document.createElement('span');
      label.textContent = item.label;
      row.appendChild(label);
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'popup-hint';
        hint.textContent = item.hint;
        row.appendChild(hint);
      }
      this.dom.appendChild(row);
    });
    const active = this.dom.children[this.index] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }

  destroy() {
    this.dom.remove();
  }
}
