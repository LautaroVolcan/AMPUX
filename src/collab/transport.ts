import { fromBase64, toBase64 } from 'lib0/buffer';
import { cloud } from '../storage/cloud';

/** Mensajes binarios (actualizaciones de Yjs) entre los navegadores que tienen abierto el mismo guion. */
export interface CollabTransport {
  send(event: string, data: Uint8Array): void;
  onMessage(cb: (event: string, data: Uint8Array) => void): void;
  /** Se llama cada vez que el canal queda conectado (también al reconectar). */
  onConnect(cb: () => void): void;
  destroy(): void;
}

/** Tope de Supabase Realtime en el plan gratis: 256 KB por mensaje. Se deja margen por el base64 y el JSON. */
export const MAX_MESSAGE_BYTES = 180 * 1024;

const EVENT = 'y';

/**
 * Canal privado de Supabase Realtime por guion. Las reglas de `realtime.messages` dejan entrar
 * solo a usuarios con sesión (supabase/realtime.sql).
 */
export function supabaseTransport(projectId: string): CollabTransport | null {
  if (!cloud) return null;
  const client = cloud;
  let handler: (event: string, data: Uint8Array) => void = () => undefined;
  let connected: () => void = () => undefined;
  const channel = client.channel(`ampux:project:${projectId}`, { config: { private: true, broadcast: { self: false } } });
  channel.on('broadcast', { event: EVENT }, ({ payload }) => {
    const { e, d } = payload as { e: string; d: string };
    handler(e, fromBase64(d));
  });
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') connected();
  });
  return {
    send(event, data) {
      void channel.send({ type: 'broadcast', event: EVENT, payload: { e: event, d: toBase64(data) } });
    },
    onMessage: (cb) => void (handler = cb),
    onConnect: (cb) => void (connected = cb),
    destroy: () => void client.removeChannel(channel),
  };
}

/**
 * Para probar sin Supabase: une las pestañas del mismo navegador (BroadcastChannel).
 * Se activa en desarrollo con `?collab=local` en la dirección. Con `sessionStorage['ampux.simulateOffline'] = '1'`
 * la pestaña no manda ni recibe; al sacarlo y disparar el evento `online`, se vuelve a conectar.
 */
export function localTransport(projectId: string): CollabTransport {
  const channel = new BroadcastChannel(`ampux:project:${projectId}`);
  const offline = () => sessionStorage.getItem('ampux.simulateOffline') === '1';
  let handler: (event: string, data: Uint8Array) => void = () => undefined;
  let connected: () => void = () => undefined;
  channel.onmessage = (m) => !offline() && handler(m.data.e, new Uint8Array(m.data.d));
  const onOnline = () => !offline() && connected();
  window.addEventListener('online', onOnline);
  return {
    send: (event, data) => !offline() && channel.postMessage({ e: event, d: data }),
    onMessage: (cb) => void (handler = cb),
    // No hay conexión que esperar: se avisa en la próxima vuelta, cuando el proveedor ya está escuchando.
    onConnect: (cb) => {
      connected = cb;
      setTimeout(onOnline, 0);
    },
    destroy: () => {
      window.removeEventListener('online', onOnline);
      channel.close();
    },
  };
}
