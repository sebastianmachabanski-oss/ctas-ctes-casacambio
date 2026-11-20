-- ───────────────────────────────────────────────────────────────────────────
-- ¿Cuánto se parece el margen fijo con el que se valúa el stock al margen
-- REAL de las operaciones? Mes por mes y moneda por moneda.
--
-- SOLO LEE. No modifica nada. Se puede correr las veces que haga falta.
--
-- Para cambiar el período o el margen a comparar, tocá estas dos líneas:
--    and m.fecha >= date '2025-11-01'      ← desde cuándo
--    0.05                                  ← margen fijo (aparece 2 veces)
-- ───────────────────────────────────────────────────────────────────────────
with patas as (
  -- Cada fila aporta a una moneda solo si tiene volumen de esa moneda Y
  -- contrapartida en pesos. Dos patas posibles: por caja y por cuenta corriente.
  select to_char(m.fecha, 'YYYY-MM') as mes, p.moneda, m.operacion, p.vol, p.ars
  from public.movimientos_caja m
  cross join lateral (values
      ('1 Dolares', coalesce(m.dolares,    0), coalesce(m.pesos,    0)),
      ('1 Dolares', coalesce(m.cc_dolares, 0), coalesce(m.cc_pesos, 0)),
      ('2 Euros',   coalesce(m.euros,      0), coalesce(m.pesos,    0)),
      ('2 Euros',   coalesce(m.cc_euros,   0), coalesce(m.cc_pesos, 0)),
      ('3 Reales',  coalesce(m.reales,     0), coalesce(m.pesos,    0)),
      ('3 Reales',  coalesce(m.cc_reales,  0), coalesce(m.cc_pesos, 0)),
      ('4 USDT',    coalesce(m.usdt,       0), coalesce(m.pesos,    0)),
      ('4 USDT',    coalesce(m.cc_usdt,    0), coalesce(m.cc_pesos, 0)),
      ('5 Libras',  coalesce(m.libras,     0), coalesce(m.pesos,    0)),
      ('5 Libras',  coalesce(m.cc_libras,  0), coalesce(m.cc_pesos, 0)),
      ('6 Cheques', coalesce(m.cheques,    0), coalesce(m.pesos,    0))
    ) as p(moneda, vol, ars)
  where m.operacion in ('COMPRA', 'VENTA')
    -- Las transferencias se miden con otra regla; `op` es NULL en casi todo el histórico.
    and (m.op is null or m.op <> 'T')
    and m.fecha >= date '2025-11-01'
    and p.vol <> 0 and p.ars <> 0
),
agg as (
  select mes, moneda,
    sum(case when operacion = 'COMPRA' and vol > 0 and ars < 0 then  vol else 0 end) as vc,
    sum(case when operacion = 'COMPRA' and vol > 0 and ars < 0 then -ars else 0 end) as ac,
    sum(case when operacion = 'VENTA'  and vol < 0 and ars > 0 then -vol else 0 end) as vv,
    sum(case when operacion = 'VENTA'  and vol < 0 and ars > 0 then  ars else 0 end) as av
  from patas group by mes, moneda
),
filas as (
  select mes, moneda, vc, vv,
    case when vc > 0 and vv > 0 then av / vv - ac / vc else 0 end as spread,
    least(vc, vv) as calzado, abs(vc - vv) as stock,
    least(vc, vv) * (case when vc > 0 and vv > 0 then av / vv - ac / vc else 0 end) as realizado,
    abs(vc - vv) * 0.05 as v_fijo,
    -- DOS RAMAS, como la pantalla, y no una sola (corregido el 20/11/2026).
    -- Si en el mes quedó stock (compró más que vendió), ese stock vale el spread.
    -- Si el mes USÓ tenencia (vendió más que compró), la pantalla calcula
    -- stock * (t2 - cierre), y con cierre = la venta del período eso da CERO: el
    -- margen de esas unidades ya está en el calce. Aplicar la primera rama a los dos
    -- lados sobreestima, y bastante.
    case when vc >= vv
         then abs(vc - vv) * (case when vc > 0 and vv > 0 then av / vv - ac / vc else 0 end)
         else 0
    end as v_spread
  from agg where vc > 0 or vv > 0
)
select moneda, mes, comprado, vendido, spread_por_unidad, stock,
       stock_a_margen_fijo, stock_al_spread, veces_mas_grande,
       pct_resultado_fijo, pct_resultado_spread
from (
  select substr(moneda, 3) as moneda, mes, 0 as orden,
    round(vc) as comprado, round(vv) as vendido,
    round(spread, 2) as spread_por_unidad, round(stock) as stock,
    round(v_fijo) as stock_a_margen_fijo, round(v_spread) as stock_al_spread,
    case when spread > 0 then round(spread / 0.05) end as veces_mas_grande,
    round(100 * v_fijo   / nullif(realizado + v_fijo,   0), 3) as pct_resultado_fijo,
    round(100 * v_spread / nullif(realizado + v_spread, 0), 2) as pct_resultado_spread
  from filas
  union all
  select substr(moneda, 3), 'TOTAL', 1,
    null, null, null, round(sum(stock)),
    round(sum(v_fijo)), round(sum(v_spread)), null,
    round(100 * sum(v_fijo)   / nullif(sum(realizado) + sum(v_fijo),   0), 3),
    round(100 * sum(v_spread) / nullif(sum(realizado) + sum(v_spread), 0), 2)
  from filas group by moneda
) t
order by moneda, orden, mes;
