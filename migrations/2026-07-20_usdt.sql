-- USDT (20/7/2026): nueva moneda que NO existe en la planilla; se opera únicamente desde
-- la app y solo en CAJA (compra/venta contra pesos y dólares, ingresos/egresos). Como el
-- sync borra y reinserta movimientos_caja desde el Sheet, se agrega la columna `origen`
-- para que el sync SOLO toque las filas provenientes de la planilla ('sheet') y respete
-- las cargadas en la app ('app'), donde vive USDT.
--
-- Es seguro correrla más de una vez (usa IF NOT EXISTS y CREATE OR REPLACE).

-- Columna de saldo USDT (solo caja, sin contrapartida de cuenta corriente).
alter table public.movimientos_caja
  add column if not exists usdt numeric(18,2) not null default 0;

-- Procedencia de la fila. Las existentes quedan como 'sheet' (las maneja el sync).
alter table public.movimientos_caja
  add column if not exists origen text not null default 'sheet';

comment on column public.movimientos_caja.usdt is
  'USDT (Tether). Moneda SOLO-app: no existe en la planilla. Solo movimientos de CAJA '
  '(sin cuenta corriente). Cargada desde la app, el sync no la escribe.';
comment on column public.movimientos_caja.origen is
  'Procedencia de la fila: ''sheet'' = la escribe y borra el sync desde la planilla; '
  '''app'' = alta hecha en la app (ej. USDT) — el sync NO la toca.';

-- El sync borra por origen; un índice ayuda a esa operación masiva.
create index if not exists idx_mcaja_origen on public.movimientos_caja(origen);

-- caja_totales: sumar también la columna USDT (el resto queda igual).
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
    'usdt',       coalesce(sum(usdt), 0),
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
