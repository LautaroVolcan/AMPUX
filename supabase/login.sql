-- AMPUX — login obligatorio (25/11/2026).
-- Desde acá solo los usuarios con sesión iniciada (rol `authenticated`) leen y escriben; la clave pública sola ya no alcanza.
-- Todos los usuarios ven y editan todo, como antes. Sigue sin haber política DELETE.
--
-- ORDEN: correr esto recién cuando
--   1. la versión de la app con login está publicada,
--   2. las cuentas están creadas (Authentication → Users → Add user, con "Auto Confirm User"),
--   3. el registro abierto está apagado (Authentication → Sign In / Providers → "Allow new users to sign up").
-- Si se corre antes, la versión vieja de la app (sin login) deja de ver los guiones.
--
-- Para volver atrás: correr de nuevo `schema.sql` de una versión anterior (con `to anon, authenticated`).

do $$
declare t text;
begin
  foreach t in array array['folders', 'projects', 'snapshots'] loop
    execute format('drop policy if exists "leer" on public.%I', t);
    execute format('drop policy if exists "crear" on public.%I', t);
    execute format('drop policy if exists "editar" on public.%I', t);
    execute format('create policy "leer" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "crear" on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy "editar" on public.%I for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;
