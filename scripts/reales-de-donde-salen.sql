-- ───────────────────────────────────────────────────────────────────────────
-- ¿DE DÓNDE SALEN LOS REALES QUE SE VENDEN?
--
-- Ganancias necesita, en el mismo mes y la misma moneda, una COMPRA y una
-- VENTA para calcular margen. En reales hay meses con ventas y ninguna
-- compra: el motor no encuentra la pata y reconoce ganancia cero.
--
-- Estas dos consultas muestran por qué operación entran los reales.
--
-- SOLO LEEN. No modifican nada. Seguro correrlas las veces que haga falta.
-- Correr primero la 1. La 2 es para mirar ejemplos concretos.
-- ───────────────────────────────────────────────────────────────────────────


-- ═══ CONSULTA 1 — Por qué operación entran y salen los reales ══════════════
select
  operacion,
  coalesce(op, '—')   as op,          -- 'T' = transferencia
  coalesce(tipo, '—') as tipo,        -- CAJA o CTA CTE
  count(*)            as filas,
  round(sum(case when coalesce(reales, 0)    > 0 then  reales    else 0 end)) as entran_caja,
  round(sum(case when coalesce(reales, 0)    < 0 then -reales    else 0 end)) as salen_caja,
  round(sum(case when coalesce(cc_reales, 0) > 0 then  cc_reales else 0 end)) as entran_ctacte,
  round(sum(case when coalesce(cc_reales, 0) < 0 then -cc_reales else 0 end)) as salen_ctacte,
  -- Si no hay contrapartida en pesos, el motor no puede sacar una cotización.
  round(sum(coalesce(pesos, 0) + coalesce(cc_pesos, 0)))                      as contrapartida_pesos,
  count(*) filter (where coalesce(pesos, 0) = 0 and coalesce(cc_pesos, 0) = 0) as filas_sin_pesos
from public.movimientos_caja
where (coalesce(reales, 0) <> 0 or coalesce(cc_reales, 0) <> 0)
  and fecha >= date '2025-11-01'
group by operacion, coalesce(op, '—'), coalesce(tipo, '—')
order by operacion, op, tipo;


-- ═══ CONSULTA 2 — Las filas que TRAEN reales sin ser una compra ════════════
-- (correr sola, después de la 1)
-- select
--   fecha, coalesce(tipo, '—') as tipo, operacion, coalesce(op, '—') as op, cliente,
--   coalesce(reales, 0)    as reales_caja,
--   coalesce(cc_reales, 0) as reales_ctacte,
--   coalesce(pesos, 0) + coalesce(cc_pesos, 0) as contrapartida_pesos,
--   notas
-- from public.movimientos_caja
-- where (coalesce(reales, 0) > 0 or coalesce(cc_reales, 0) > 0)
--   and operacion <> 'COMPRA'
--   and fecha >= date '2025-11-01'
-- order by fecha
-- limit 50;
