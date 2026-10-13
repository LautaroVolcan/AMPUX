import { useState } from 'react';
import { useT } from '../i18n';

export interface SceneItem {
  /** Índice del elemento en el guion. */
  index: number;
  id: string;
  heading: string;
  number: string;
  page: number;
}

interface Props {
  scenes: SceneItem[];
  currentId: string | null;
  onJump: (index: number) => void;
  /** Mueve la escena en la posición `from` antes de la escena en la posición `to`. */
  onMove: (from: number, to: number) => void;
}

export function SceneNavigator({ scenes, currentId, onJump, onMove }: Props) {
  const t = useT();
  const [filter, setFilter] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const q = filter.trim().toLocaleLowerCase();
  const filtering = q.length > 0;

  const drop = () => {
    if (dragFrom !== null && dropAt !== null) onMove(dragFrom, dropAt);
    setDragFrom(null);
    setDropAt(null);
  };

  return (
    <aside className="panel nav">
      <div className="panel-head">
        <input className="input" placeholder={t.nav.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <ol className="scene-list" onDragLeave={(e) => e.currentTarget === e.target && setDropAt(null)}>
        {scenes.length === 0 && <li className="muted pad">{t.nav.empty}</li>}
        {scenes.map((s, pos) => {
          if (filtering && !s.heading.toLocaleLowerCase().includes(q)) return null;
          return (
            <li
              key={s.id}
              className={[
                'scene-item',
                s.id === currentId ? 'current' : '',
                dragFrom === pos ? 'dragging' : '',
                dropAt === pos ? 'drop-before' : '',
                dropAt === pos + 1 && pos === scenes.length - 1 ? 'drop-after' : '',
              ].join(' ')}
              draggable={!filtering}
              onDragStart={(e) => {
                setDragFrom(pos);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(pos));
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientY < rect.top + rect.height / 2 ? pos : pos + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop();
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDropAt(null);
              }}
              onClick={() => onJump(s.index)}
            >
              <span className="scene-num-badge">{s.number}</span>
              <span className="scene-heading">{s.heading || t.nav.untitledScene}</span>
              <span className="scene-page">{s.page}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
