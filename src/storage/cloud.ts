import { createClient } from '@supabase/supabase-js';

// Sin estas variables la app funciona como antes: todo queda solo en el navegador.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloud = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
