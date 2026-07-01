-- Lista de clientes para el selector de "Nueva Transacción".
--
-- Distinto de `cuentas_corrientes`: esa tabla solo guarda clientes con movimientos de
-- tipo CTA CTE (la usa también la pantalla de Cuenta Corriente para filtrar extractos).
-- `clientes` es la unión de TODOS los nombres que aparecen en las columnas CLIENTE y CAJA
-- de la planilla (sea cual sea el tipo de operación), calculada por el sync.
create table if not exists public.clientes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.clientes enable row level security;

create policy "Autenticados ven clientes activos"
  on public.clientes for select
  to authenticated
  using (activo = true);

create policy "Superusuarios gestionan clientes"
  on public.clientes for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );
