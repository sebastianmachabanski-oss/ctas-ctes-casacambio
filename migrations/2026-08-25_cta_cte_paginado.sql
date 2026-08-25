-- Cuentas Corrientes: una página con el saldo acumulado ya calculado (25/8/2026).
--
-- QUÉ PROBLEMA RESUELVE
-- La pantalla traía TODOS los movimientos de la cuenta —7.661 en la más grande, con
-- todas sus columnas y en 8 viajes a la base—, calculaba el saldo acumulado fila por fila
-- en el servidor y después mandaba las 7.661 filas al navegador. De ahí la demora.
--
-- Con esta función es UN viaje que devuelve solo la página pedida, con el acumulado ya
-- resuelto por la base.
--
-- POR QUÉ EL ACUMULADO NO SE PUEDE CALCULAR SOBRE LA PÁGINA
-- El saldo de una fila es el de TODOS los movimientos hasta esa fecha, no el de los que
-- entraron en pantalla. Por eso la ventana recorre la cuenta entera en orden cronológico
-- y recién después se aplica el filtro de fechas y se corta la página. Es lo mismo que
-- antes hacía el "saldo previo al rango", pero en una sola pasada.
--
-- Es SEGURO correr esta migración dos veces.

-- Índice para la ventana: la función siempre entra por cuenta y ordena por fecha.
create index if not exists diario_cta_cte_fecha_idx
  on public.diario (cuenta_cte, fecha)
  where tipo = 'CTA CTE' and anulado = false;

drop function if exists public.cta_cte_movimientos(text, date, date, text, integer, integer);

create or replace function public.cta_cte_movimientos(
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
  acum_pesos   numeric,
  acum_dolares numeric,
  acum_euros   numeric,
  acum_reales  numeric,
  acum_usdt    numeric,
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
      d.cc_pesos, d.cc_dolares, d.cc_euros, d.cc_reales, d.cc_usdt,
      -- Acumulado desde el primer movimiento de la cuenta hasta esta fila.
      sum(coalesce(d.cc_pesos, 0))   over w as acum_pesos,
      sum(coalesce(d.cc_dolares, 0)) over w as acum_dolares,
      sum(coalesce(d.cc_euros, 0))   over w as acum_euros,
      sum(coalesce(d.cc_reales, 0))  over w as acum_reales,
      sum(coalesce(d.cc_usdt, 0))    over w as acum_usdt
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
    f.cc_pesos, f.cc_dolares, f.cc_euros, f.cc_reales, f.cc_usdt,
    f.acum_pesos, f.acum_dolares, f.acum_euros, f.acum_reales, f.acum_usdt,
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
