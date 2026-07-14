-- Configuración de la app editable sin deploy (clave/valor JSON).
-- Primer uso: umbral de alerta de Nueva transacción, expresado en DÓLARES
-- (decisión 11/7/2026: la alerta evalúa el valor en USD de la operación).
-- Segura de correr más de una vez.
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "Staff lee configuración" on public.app_config;
create policy "Staff lee configuración"
  on public.app_config for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  );

drop policy if exists "Superusuarios escriben configuración" on public.app_config;
create policy "Superusuarios escriben configuración"
  on public.app_config for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );

-- Valor inicial: US$ 1.000 (ajustable desde la app).
insert into public.app_config (key, value)
  values ('umbral_alerta_usd', '{"usd": 1000}'::jsonb)
  on conflict (key) do nothing;
