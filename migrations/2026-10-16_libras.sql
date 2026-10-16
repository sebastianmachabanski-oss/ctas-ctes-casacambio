-- LIBRAS (16/10/2026): nueva moneda, con paridad completa con el resto.
--
-- Opera en CAJA y en CUENTA CORRIENTE desde el primer día, y se cotiza contra todas las
-- demás. Igual que USDT, es una moneda SOLO-APP: no existe ni una transacción con libras
-- en la planilla y no la va a haber, así que no afecta la validación del motor contra el
-- Sheet.
--
-- QUÉ TOCA
--   1. Columnas nuevas: movimientos_caja.libras / .cc_libras y diario.cc_libras.
--   2. Seis objetos que enumeran las monedas una por una y por lo tanto hay que recrear:
--      caja_totales, caja_saldo_diario, caja_clientes_periodo, la vista caja_clientes,
--      saldos_cuenta_corriente y cta_cte_movimientos.
--
-- ES SEGURO CORRERLA DOS VECES: las columnas van con `if not exists` y las funciones y
-- vistas se reemplazan. Las que cambian de columnas de salida se borran antes, porque
-- `create or replace` no puede cambiar el tipo de retorno.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Columnas
-- ─────────────────────────────────────────────────────────────────────────
alter table public.movimientos_caja
  add column if not exists libras    numeric(18,2) not null default 0,
  add column if not exists cc_libras numeric(18,2) not null default 0;

alter table public.diario
  add column if not exists cc_libras numeric(18,2);

comment on column public.movimientos_caja.libras is
  'Libras esterlinas. Moneda SOLO-APP: no existe en la planilla (16/10/2026).';
comment on column public.diario.cc_libras is
  'Saldo en libras de la cuenta corriente. Solo puede venir de la app.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Totales de caja (tablero de Inicio)
-- ─────────────────────────────────────────────────────────────────────────
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
    'libras',     coalesce(sum(libras), 0),
    'banco',      coalesce(sum(banco), 0),
    'cc_pesos',   coalesce(sum(cc_pesos), 0),
    'cc_dolares', coalesce(sum(cc_dolares), 0),
    'cc_euros',   coalesce(sum(cc_euros), 0),
    'cc_reales',  coalesce(sum(cc_reales), 0),
    'cc_libras',  coalesce(sum(cc_libras), 0)
  )
  from public.movimientos_caja
  where (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha <= p_hasta);
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Evolución del saldo por moneda (gráfico de Ganancias)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.caja_saldo_diario(p_moneda text default 'dolares')
returns table(fecha date, saldo numeric)
language sql
stable
as $$
  select fecha,
    sum(sum(
      case lower(p_moneda)
        when 'pesos'   then pesos
        when 'dolares' then dolares
        when 'euros'   then euros
        when 'reales'  then reales
        when 'usdt'    then usdt
        when 'libras'  then libras
        else dolares
      end
    )) over (order by fecha) as saldo
  from public.movimientos_caja
  where operacion <> 'OPERACION?'
  group by fecha
  order by fecha;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Totales por cliente (tabla Clientes de Ganancias)
-- ─────────────────────────────────────────────────────────────────────────
-- Cambian las columnas de salida, así que hay que borrarla: `create or replace` no puede.
--
-- OJO: esta función y su vista NO traían USDT, y se mantiene así. Agregarlo es un cambio
-- aparte y no corresponde colarlo en el de libras; queda anotado como pendiente.
drop function if exists public.caja_clientes_periodo(date, date);

create function public.caja_clientes_periodo(p_desde date default null, p_hasta date default null)
returns table(
  cliente text, pesos numeric, dolares numeric, euros numeric, reales numeric,
  libras numeric, movimientos bigint, ultimo_movimiento date
)
language sql
stable
as $$
  select
    cliente,
    sum(pesos)   as pesos,
    sum(dolares) as dolares,
    sum(euros)   as euros,
    sum(reales)  as reales,
    sum(libras)  as libras,
    count(*)     as movimientos,
    max(fecha)   as ultimo_movimiento
  from public.movimientos_caja
  where operacion <> 'OPERACION?'
    and cliente is not null
    and btrim(cliente) <> ''
    and (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha <= p_hasta)
  group by cliente;
$$;

-- Vista de respaldo: la pantalla cae acá si la función no está disponible.
drop view if exists public.caja_clientes;
create view public.caja_clientes
with (security_invoker = true) as
select
  cliente,
  sum(pesos)   as pesos,
  sum(dolares) as dolares,
  sum(euros)   as euros,
  sum(reales)  as reales,
  sum(libras)  as libras,
  count(*)     as movimientos,
  max(fecha)   as ultimo_movimiento
from public.movimientos_caja
where operacion <> 'OPERACION?'
  and cliente is not null
  and btrim(cliente) <> ''
group by cliente;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Saldos por cuenta corriente
-- ─────────────────────────────────────────────────────────────────────────
-- Se borra antes de crearla: `create or replace view` no puede agregar columnas en el
-- medio ni quitarlas, y acá se suma una.
drop view if exists public.saldos_cuenta_corriente cascade;
create view public.saldos_cuenta_corriente as
select
  cuenta_cte,
  sum(cc_pesos)               as saldo_pesos,
  sum(cc_dolares)             as saldo_dolares,
  sum(cc_euros)               as saldo_euros,
  sum(cc_reales)              as saldo_reales,
  sum(coalesce(cc_usdt, 0))   as saldo_usdt,
  sum(coalesce(cc_libras, 0)) as saldo_libras,
  max(fecha)                  as ultimo_movimiento
from public.diario
where anulado = false and tipo = 'CTA CTE'
group by cuenta_cte;

comment on view public.saldos_cuenta_corriente is
  'Saldo por cuenta corriente. USDT y LIBRAS solo pueden venir de la app: en la planilla '
  'no existen.';

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Página de movimientos con saldo acumulado
-- ─────────────────────────────────────────────────────────────────────────
drop function if exists public.cta_cte_movimientos(text, date, date, text, integer, integer);

create function public.cta_cte_movimientos(
  p_cuenta    text,
  p_desde     date default null,
  p_hasta     date default null,
  p_operacion text default null,   -- 'INGRESO' | 'EGRESO' | null
  p_limit     integer default 200,
  p_offset    integer default 0
)
returns table (
  id           uuid,
  fecha        date,
  cuenta_cte   text,
  operacion    text,
  concepto     text,
  evento       text,
  notas        text,
  moneda       text,
  monto        numeric,
  cc_pesos     numeric,
  cc_dolares   numeric,
  cc_euros     numeric,
  cc_reales    numeric,
  cc_usdt      numeric,
  cc_libras    numeric,
  acum_pesos   numeric,
  acum_dolares numeric,
  acum_euros   numeric,
  acum_reales  numeric,
  acum_usdt    numeric,
  acum_libras  numeric,
  total_filas  bigint
)
language sql
stable
security invoker   -- respeta la RLS de `diario`: un cliente solo ve su propia cuenta
set search_path = public
as $$
  with todos as (
    select
      d.id, d.fecha, d.cuenta_cte, d.operacion, d.concepto, d.evento, d.notas,
      d.moneda, d.monto, d.created_at,
      d.cc_pesos, d.cc_dolares, d.cc_euros, d.cc_reales, d.cc_usdt, d.cc_libras,
      -- Acumulado desde el primer movimiento de la cuenta hasta esta fila.
      sum(coalesce(d.cc_pesos, 0))   over w as acum_pesos,
      sum(coalesce(d.cc_dolares, 0)) over w as acum_dolares,
      sum(coalesce(d.cc_euros, 0))   over w as acum_euros,
      sum(coalesce(d.cc_reales, 0))  over w as acum_reales,
      sum(coalesce(d.cc_usdt, 0))    over w as acum_usdt,
      sum(coalesce(d.cc_libras, 0))  over w as acum_libras
    from public.diario d
    where d.tipo = 'CTA CTE'
      and d.anulado = false
      and d.cuenta_cte = p_cuenta
    -- `id` como desempate final: sin él, dos filas del mismo día y el mismo instante
    -- podrían ordenarse distinto entre llamadas y el acumulado bailaría.
    window w as (order by d.fecha, d.created_at, d.id rows between unbounded preceding and current row)
  ),
  filtrado as (
    select * from todos t
    where (p_desde is null or t.fecha >= p_desde)
      and (p_hasta is null or t.fecha <= p_hasta)
      -- El filtro es por DIRECCIÓN, no por un código exacto: conviven INGRESAN/EGRESAN
      -- con los valores viejos DONACION/COMPROMISO. "INGRES" no es subcadena de
      -- "EGRESAN" ni viceversa, así que no se pisan.
      and (
        p_operacion is null
        or (p_operacion = 'INGRESO' and (t.operacion ilike '%INGRES%' or t.operacion = 'DONACION'))
        or (p_operacion = 'EGRESO'  and (t.operacion ilike '%EGRES%'  or t.operacion = 'COMPROMISO'))
      )
  )
  -- Se listan las columnas una por una: `f.*` arrastraría `created_at`, que se usa para
  -- ordenar pero no forma parte de lo que devuelve la función.
  select
    f.id, f.fecha, f.cuenta_cte, f.operacion, f.concepto, f.evento, f.notas,
    f.moneda, f.monto,
    f.cc_pesos, f.cc_dolares, f.cc_euros, f.cc_reales, f.cc_usdt, f.cc_libras,
    f.acum_pesos, f.acum_dolares, f.acum_euros, f.acum_reales, f.acum_usdt, f.acum_libras,
    count(*) over () as total_filas
  from filtrado f
  -- Exactamente al revés que la ventana, para que la pantalla muestre lo más nuevo arriba
  -- y el acumulado de cada fila sea el que le corresponde.
  order by f.fecha desc, f.created_at desc, f.id desc
  limit p_limit offset p_offset
$$;

comment on function public.cta_cte_movimientos(text, date, date, text, integer, integer) is
  'Una página de movimientos de una cuenta corriente, con el saldo acumulado por fila ya '
  'calculado. El acumulado se resuelve sobre la cuenta COMPLETA y recién después se '
  'aplica el filtro de fechas: el saldo de una fila es el de todo lo anterior, no el de '
  'lo que entró en pantalla.';
