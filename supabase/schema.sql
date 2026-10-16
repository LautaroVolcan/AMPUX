-- AMPUX — esquema de Supabase.
-- Pegar entero en el SQL Editor del proyecto y ejecutar (se puede correr más de una vez).
--
-- No hay login: todos los que usan la app ven y editan todo. Por eso:
--   - nadie puede borrar filas (no hay política DELETE); borrar en la app solo marca `deleted = true`,
--     así un guion borrado por error se puede recuperar desde el panel de Supabase.

create table if not exists public.folders (
  id         text primary key,
  name       text not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted    boolean not null default false
);

create table if not exists public.projects (
  id         text primary key,
  title      text not null,
  folder_id  text,
  page_count integer not null default 1,
  created_at bigint not null,
  updated_at bigint not null,
  deleted    boolean not null default false,
  data       jsonb not null
);

create table if not exists public.snapshots (
  id         text primary key,
  project_id text not null,
  name       text not null,
  created_at bigint not null,
  page_count integer not null default 1,
  deleted    boolean not null default false,
  data       jsonb not null
);

create index if not exists snapshots_project_id on public.snapshots (project_id);

alter table public.folders   enable row level security;
alter table public.projects  enable row level security;
alter table public.snapshots enable row level security;

do $$
declare t text;
begin
  foreach t in array array['folders', 'projects', 'snapshots'] loop
    execute format('drop policy if exists "leer" on public.%I', t);
    execute format('drop policy if exists "crear" on public.%I', t);
    execute format('drop policy if exists "editar" on public.%I', t);
    execute format('create policy "leer" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "crear" on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "editar" on public.%I for update to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
