import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { MAX_MESSAGE_BYTES, type CollabTransport } from './transport';

/** Cada cuánto se juntan las teclas en un solo mensaje (Supabase permite 100 mensajes/s en el plan gratis). */
const BATCH_MS = 60;

/**
 * Conecta un Y.Doc (y quién está conectado, "awareness") con los demás navegadores por un transporte.
 *
 * Protocolo (todos los mensajes son actualizaciones binarias de Yjs):
 * - `u`  cambios nuevos (agrupados cada 60 ms).
 * - `s1` "esto es lo que tengo" (vector de estado). Se manda al conectar; quien lo recibe contesta con `s2`
 *        (lo que le falta al otro) y, si el `s1` pedía respuesta, manda su propio `s1` (sin pedir respuesta).
 * - `s2` lo que le faltaba al otro.
 * - `a`  presencia (nombre, color, cursor).
 */
export class CollabProvider {
  readonly awareness: Awareness;
  private queue: Uint8Array[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    readonly doc: Y.Doc,
    private transport: CollabTransport,
  ) {
    this.awareness = new Awareness(doc);
    doc.on('update', this.onDocUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
    transport.onMessage(this.onMessage);
    transport.onConnect(() => this.hello(true));
    window.addEventListener('pagehide', this.bye);
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return; // vino de otro navegador: no se reenvía
    this.queue.push(update);
    this.timer ??= setTimeout(this.flush, BATCH_MS);
  };

  /** Manda ya lo que esté en cola. */
  flush = () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.queue.length) return;
    const update = Y.mergeUpdates(this.queue);
    this.queue = [];
    this.send('u', update);
  };

  private onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === this) return;
    const changed = [...added, ...updated, ...removed];
    if (changed.includes(this.doc.clientID)) this.send('a', encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
  };

  private hello(askBack: boolean) {
    this.send(askBack ? 's1' : 's1n', Y.encodeStateVector(this.doc));
    if (this.awareness.getLocalState()) this.send('a', encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
  }

  private onMessage = (event: string, data: Uint8Array) => {
    if (this.destroyed) return;
    switch (event) {
      case 'u':
      case 's2':
        Y.applyUpdate(this.doc, data, this);
        break;
      case 's1':
      case 's1n':
        this.send('s2', Y.encodeStateAsUpdate(this.doc, data));
        if (event === 's1') this.hello(false);
        break;
      case 'a':
        applyAwarenessUpdate(this.awareness, data, this);
        break;
    }
  };

  private send(event: string, data: Uint8Array) {
    // Un s2 sin nada que mandar pesa 2 bytes: se omite.
    if (event === 's2' && data.length <= 2) return;
    if (data.length > MAX_MESSAGE_BYTES) {
      // Prototipo: un cambio así de grande (pegar un guion entero) no entra en un mensaje. Los demás lo
      // reciben al volver a abrir el guion, desde el estado guardado.
      console.warn(`AMPUX: cambio demasiado grande para enviarlo en vivo (${Math.round(data.length / 1024)} KB)`);
      return;
    }
    this.transport.send(event, data);
  }

  private bye = () => {
    this.flush();
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'bye');
  };

  destroy() {
    if (this.destroyed) return;
    this.bye();
    this.destroyed = true;
    window.removeEventListener('pagehide', this.bye);
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    this.awareness.destroy();
    this.transport.destroy();
  }
}
