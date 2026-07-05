-- Tabla `movimientos_caja`: TODAS las filas de la solapa CAJA de la planilla (compras,
-- ventas, gastos, ingresos/egresos, saldos iniciales, cta cte, etc.), cargadas por el
-- sync nocturno. Es la base de datos sobre la que se construyen los reportes de la app
-- (situación de caja, clientes, histórico, ganancias) para poder prescindir del Sheet.
--
-- Distinto de `diario`: esa tabla solo tiene los movimientos de CTA CTE con el esquema
-- que necesita la pantalla de extractos. Esta tabla es el espejo completo de CAJA.

create table if not exists public.movimientos_caja (
  id          uuid primary key default gen_random_uuid(),
  fila_sheet  integer,            -- nro de fila en la planilla (trazabilidad del sync)
  fecha       date not null,
  tipo        text not null,      -- 'CAJA' | 'CTA CTE'
  cliente     text,               -- ver comment de la columna
  operacion   text not null,      -- COMPRA / VENTA / INGRESAN / EGRESAN / GASTOS / ...
  propio      text,               -- moneda propia
  externo     text,               -- moneda externa ('' si no aplica)
  monto       numeric(18,2) not null default 0,
  cot         numeric(18,6),
  costo_pct   numeric(9,6),
  debe        text,               -- repartidor: si está cargado, el dinero está "en la calle"
  notas       text,
  cuenta      text,               -- agrupación de reportes de la planilla (CAJA/CAMBIO DIVISAS/...)

  -- Columnas calculadas POR LA PLANILLA. Durante la convivencia son la fuente de verdad;
  -- el motor de cálculo de la app (src/lib/motor-calculo) las recalcula en paralelo para
  -- validar antes de reemplazarlas.
  pesos       numeric(18,2) not null default 0,
  cheques     numeric(18,2) not null default 0,
  dolares     numeric(18,2) not null default 0,
  euros       numeric(18,2) not null default 0,
  reales      numeric(18,2) not null default 0,
  banco       numeric(18,2) not null default 0,
  cc_pesos    numeric(18,2) not null default 0,
  cc_dolares  numeric(18,2) not null default 0,
  cc_euros    numeric(18,2) not null default 0,
  cc_reales   numeric(18,2) not null default 0,

  synced_at   timestamptz not null default now()
);

comment on column public.movimientos_caja.cliente is
  'Texto libre, NO normalizado: en las filas de tipo CAJA son clientes eventuales tal '
  'como se tipearon en la planilla (decisión de negocio 5/7/2026 — normalizar dependerá '
  'del uso futuro de la app). En filas CTA CTE es el nombre de la cuenta corriente.';

create index if not exists idx_mcaja_fecha     on public.movimientos_caja(fecha);
create index if not exists idx_mcaja_cliente   on public.movimientos_caja(cliente);
create index if not exists idx_mcaja_operacion on public.movimientos_caja(operacion);
create index if not exists idx_mcaja_tipo      on public.movimientos_caja(tipo);
-- Parcial: la vista de "dinero en la calle" solo mira filas con repartidor cargado.
create index if not exists idx_mcaja_debe      on public.movimientos_caja(debe) where debe is not null;

alter table public.movimientos_caja enable row level security;

-- Solo el personal ve la caja completa (los clientes ya tienen su vista en `diario`).
create policy "Operadores y superusuarios ven movimientos de caja"
  on public.movimientos_caja for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  );
-- Sin policies de escritura: solo escribe el sync (service role, que saltea RLS).

-- Totales de control para validar cada corrida del sync (conteo + suma por columna).
-- La usa el sync tras insertar, y sirve también para chequeos manuales.
create or replace function public.caja_totales(p_desde date default null, p_hasta date default null)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'filas',      count(*),
    'pesos',      coalesce(sum(pesos), 0),
    'cheques',    coalesce(sum(cheques), 0),
    'dolares',    coalesce(sum(dolares), 0),
    'euros',      coalesce(sum(euros), 0),
    'reales',     coalesce(sum(reales), 0),
    'banco',      coalesce(sum(banco), 0),
    'cc_pesos',   coalesce(sum(cc_pesos), 0),
    'cc_dolares', coalesce(sum(cc_dolares), 0),
    'cc_euros',   coalesce(sum(cc_euros), 0),
    'cc_reales',  coalesce(sum(cc_reales), 0)
  )
  from public.movimientos_caja
  where (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha <= p_hasta);
$$;
