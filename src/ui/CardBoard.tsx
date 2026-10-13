import { useState } from 'react';
import { useT } from '../i18n';
import { CARD_COLORS, type CardColor } from '../types';

export interface Card {
  index: number;
  id: string;
  heading: string;
  number: string;
  page: number;
  synopsis: string;
  color: CardColor | null;
  /** Primeras líneas de la escena, para cuando no hay sinopsis. */
  excerpt: string;
}

interface Props {
  cards: Card[];
  onSynopsis: (id: string, synopsis: string) => void;
  onColor: (id: string, color: CardColor | null) => void;
  /** Mueve la tarjeta `from` antes de la tarjeta `to` (o al final si `to` === cantidad). */
  onMove: (from: number, to: number) => void;
  onOpen: (index: number) => void;
}

/** Tablero de tarjetas: una por escena. Reordenar las tarjetas reordena el guion. */
export function CardBoard({ cards, onSynopsis, onColor, onMove, onOpen }: Props) {
  const t = useT();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const reset = () => {
    setDragFrom(null);
    setDropAt(null);
  };

  if (!cards.length) return <div className="board-empty muted">{t.cards.empty}</div>;

  return (
    <div className="board">
      {cards.map((c, pos) => (
        <article
          key={c.id}
          className={[
            'index-card',
            c.color ? `c-${c.color}` : '',
            dragFrom === pos ? 'dragging' : '',
            dropAt === pos ? 'drop-before' : '',
            dropAt === pos + 1 && pos === cards.length - 1 ? 'drop-after' : '',
          ].join(' ')}
          draggable
          onDragStart={(e) => {
            if ((e.target as HTMLElement).closest('textarea')) return e.preventDefault();
            setDragFrom(pos);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(pos));
          }}
          onDragOver={(e) => {
            if (dragFrom === null) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setDropAt(e.clientX < r.left + r.width / 2 ? pos : pos + 1);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragFrom !== null && dropAt !== null) onMove(dragFrom, dropAt);
            reset();
          }}
          onDragEnd={reset}
        >
          <header className="ic-head">
            <span className="ic-num">{c.number}</span>
            <button className="ic-heading" onClick={() => onOpen(c.index)} title={t.cards.open}>
              {c.heading || t.nav.untitledScene}
            </button>
            <span className="ic-page">{t.cards.page(c.page)}</span>
          </header>
          <textarea
            key={c.id}
            className="ic-synopsis"
            defaultValue={c.synopsis}
            placeholder={c.excerpt || t.cards.synopsis}
            onChange={(e) => onSynopsis(c.id, e.target.value)}
          />
          <footer className="ic-colors" role="radiogroup" aria-label={t.cards.color}>
            <button className={`swatch none${!c.color ? ' on' : ''}`} onClick={() => onColor(c.id, null)} aria-label={t.cards.noColor} />
            {CARD_COLORS.map((color) => (
              <button
                key={color}
                className={`swatch c-${color}${c.color === color ? ' on' : ''}`}
                onClick={() => onColor(c.id, color)}
                aria-label={t.cards.colors[color]}
                title={t.cards.colors[color]}
              />
            ))}
          </footer>
        </article>
      ))}
    </div>
  );
}
