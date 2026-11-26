-- AMPUX — edición en tiempo real (prototipo, 26/11/2026). Aditivo: no toca las tablas existentes.
-- Se puede correr más de una vez.
--
-- 1. `project_docs`: estado compartido de cada guion (Yjs, en base64). El JSON de `projects` sigue siendo la
--    copia que usan la lista, las versiones y los exports; este estado es lo que se mezcla entre personas.
-- 2. Reglas de Supabase Realtime: los canales `ampux:project:<id>` son privados; solo entran usuarios con sesión.
--    Además, en el panel: Realtime → Settings → apagar "Allow public access", para que no haya canales públicos.

create table if not exists public.project_docs (
  id         text primary key,          -- mismo id que projects.id
  state      text not null,             -- Y.encodeStateAsUpdate(doc) en base64
  updated_at bigint not null
);

alter table public.project_docs enable row level security;

drop policy if exists "leer" on public.project_docs;
drop policy if exists "crear" on public.project_docs;
drop policy if exists "editar" on public.project_docs;
create policy "leer" on public.project_docs for select to authenticated using (true);
create policy "crear" on public.project_docs for insert to authenticated with check (true);
create policy "editar" on public.project_docs for update to authenticated using (true) with check (true);
-- Sin DELETE, como el resto.

-- Canales en vivo: recibir y mandar mensajes (broadcast) solo con sesión y solo en los canales de AMPUX.
drop policy if exists "ampux: recibir en vivo" on realtime.messages;
drop policy if exists "ampux: mandar en vivo" on realtime.messages;
create policy "ampux: recibir en vivo" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'ampux:project:%');
create policy "ampux: mandar en vivo" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'ampux:project:%');
