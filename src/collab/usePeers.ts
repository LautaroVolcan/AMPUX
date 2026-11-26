import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { assignColors, type Peer } from './presence';

/**
 * Quién más tiene abierto el guion (sin repetir a la misma persona con varias pestañas) y colores sin choque.
 * Además ajusta el color propio en la presencia, que es el que ven los demás en el cursor.
 */
export function usePeers(awareness: Awareness | null, me: string): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);
  useEffect(() => {
    if (!awareness) return;
    const update = () => {
      const users: { clientId: number; name: string }[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const name = (state.user as { name?: string } | undefined)?.name;
        if (name) users.push({ clientId, name });
      });
      const colors = assignColors(users);
      const mine = colors.get(me);
      const local = awareness.getLocalState()?.user as { name?: string; color?: string } | undefined;
      if (mine && local && local.color !== mine) awareness.setLocalStateField('user', { ...local, color: mine });
      const others = [...colors.entries()].filter(([name]) => name !== me).map(([name, color]) => ({ name, color }));
      setPeers((prev) => (JSON.stringify(prev) === JSON.stringify(others) ? prev : others));
    };
    update();
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [awareness, me]);
  return peers;
}
