import { useEffect, useState } from 'react';
import { AUTH_STORAGE_KEY, cloud } from './cloud';
import { flushPushes } from './db';

/**
 * Login con usuario y contraseña sobre Supabase Auth.
 * Supabase pide un email: el usuario "lautaro" se guarda como "lautaro@lautaroferrandi.com" (el dominio propio,
 * así nunca se le escribe a nadie). Si alguien escribe un email completo, se usa tal cual.
 * Las cuentas las crea Lautaro desde el panel de Supabase; el registro abierto está apagado.
 */
export const USER_DOMAIN = 'lautaroferrandi.com';

export function usernameToEmail(username: string): string {
  const u = username.trim().toLowerCase();
  return u.includes('@') ? u : `${u}@${USER_DOMAIN}`;
}

export function emailToUsername(email: string | undefined | null): string {
  if (!email) return '';
  const suffix = `@${USER_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

export type AuthState =
  /** Sin Supabase configurado: la app es local y no pide login. */
  | { status: 'local' }
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; username: string; userId: string };

/** Sesión guardada en este navegador (aunque esté vencida). */
function storedUser(): { username: string; userId: string } | null {
  try {
    const user = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null')?.user;
    return user?.id ? { username: emailToUsername(user.email), userId: user.id } : null;
  } catch {
    return null;
  }
}

/**
 * Estado del login. Local-first: si hay una sesión guardada se entra enseguida, aunque no haya conexión
 * o el token esté vencido (Supabase lo renueva solo cuando vuelve la red). Solo se pide login si la sesión
 * ya no está guardada: se cerró con "Salir" o Supabase la invalidó.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() => {
    if (!cloud) return { status: 'local' };
    const user = storedUser();
    return user ? { status: 'signedIn', ...user } : { status: 'loading' };
  });
  useEffect(() => {
    if (!cloud) return;
    const { data } = cloud.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setState({ status: 'signedIn', username: emailToUsername(session.user.email), userId: session.user.id });
        return;
      }
      // Sin sesión: puede ser que no se pudo renovar por falta de red. Si sigue guardada, se sigue adentro.
      const user = storedUser();
      setState(user ? { status: 'signedIn', ...user } : { status: 'signedOut' });
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}

export type SignInError = 'credentials' | 'network' | 'unknown';

export async function signIn(username: string, password: string): Promise<SignInError | null> {
  if (!cloud) return null;
  try {
    const { error } = await cloud.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (!error) return null;
    if (error.status === 400 || /invalid/i.test(error.message)) return 'credentials';
    if (!error.status || error.name === 'AuthRetryableFetchError') return 'network';
    return 'unknown';
  } catch {
    return 'network';
  }
}

/** Sube lo pendiente y cierra la sesión. La copia local de los guiones queda en el navegador. */
export async function signOut(): Promise<void> {
  if (!cloud) return;
  await flushPushes().catch(() => undefined);
  await cloud.auth.signOut({ scope: 'local' });
}
