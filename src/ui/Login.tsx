import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { signIn, type SignInError } from '../storage/auth';

/** Pantalla de entrada: usuario y contraseña. Las cuentas se crean desde el panel de Supabase. */
export function Login() {
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    const err = await signIn(username, password);
    // Si salió bien, la app cambia sola de pantalla (onAuthStateChange).
    if (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="wordmark">AMPUX</div>
        <label className="field">
          <span>{t.login.username}</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </label>
        <label className="field">
          <span>{t.login.password}</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <p className="login-error" role="alert">
          {error ? t.login.errors[error] : ''}
        </p>
        <button className="btn primary login-submit" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? t.login.signingIn : t.login.signIn}
        </button>
      </form>
    </div>
  );
}
