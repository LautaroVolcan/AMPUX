import { createClient } from '@supabase/supabase-js';

// Sin estas variables la app funciona como antes: todo queda solo en el navegador y no hay login.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Donde Supabase guarda la sesión en este navegador (localStorage). */
export const AUTH_STORAGE_KEY = 'ampux.auth';

// La sesión queda guardada y se renueva sola. Sin conexión, Supabase no puede renovarla: la app sigue con
// la copia local y, cuando vuelve la red, la renueva en su próximo intento (como mucho, en un par de minutos).
export const cloud =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY } }) : null;
