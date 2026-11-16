-- ════════════════════════════════════════════════════════════════════════════
-- TRANSFERENCIAS (op = 'T') QUE NO TIENEN SUS DOS PATAS
--
-- Para correr a mano en el SQL Editor de Supabase. SOLO LECTURA: no modifica
-- nada, se puede correr todas las veces que haga falta.
--
-- ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
-- Por definición del negocio una transferencia tiene DOS patas: la que ingresa
-- y la que egresa. La referencia (`notas`) es lo único que las vincula, y dentro
-- de cada referencia el emparejador casa por orden cronológico: el ingreso más
-- viejo sin pareja contra el egreso más viejo sin pareja (src/lib/ganancias-tt.ts).
--
-- Si una referencia tiene distinta cantidad de ingresos que de egresos, TODO el
-- grupo queda corrido un lugar desde el punto del descalce: a partir de ahí cada
-- par mezcla patas de transferencias distintas. La ganancia no se pierde —el
-- total sigue cerrando— pero cae en fechas equivocadas, y la última pata queda
-- sin pareja y se informa como "transferencia en curso" sin estarlo.
--
-- Caso real (16/11/2026): la referencia "CAR - EDY" tenía 8 ingresos y 9 egresos
-- porque el 30/01/2026 un ingreso de 52.330 se repartió en dos egresos (34.780 y
-- 16.830). Desde esa fecha el grupo quedó corrido: mayo de 2026 se infló 22.245,
-- el 13/11 se hundió 24.095 y aparecieron US$ (14.198) "en curso" de una
-- transferencia que había cerrado el mismo día.
--
-- ── CÓMO SE USA ─────────────────────────────────────────────────────────────
-- Las tres consultas son independientes; se corren de una en una.
--   1. RESUMEN      — qué referencias están descalzadas. Empezar por acá.
--   2. DETALLE      — qué patas quedan sin pareja, una por fila.
--   3. CONTROL      — pares con el egreso mayor al ingreso. Pescan los grupos
--                     que están corridos aunque la cantidad de patas cierre.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- 1 · RESUMEN: referencias descalzadas
-- ════════════════════════════════════════════════════════════════════════════
with t as (
  select
    id,
    fecha,
    nullif(btrim(coalesce(notas, '')), '') as ref,
    case
      when upper(coalesce(operacion, '')) like '%INGRES%' then 'ingreso'
      when upper(coalesce(operacion, '')) like '%EGRES%'  then 'egreso'
    end as punta,
    -- Igual que el motor: suma las columnas de caja, que ya traen el signo puesto.
    coalesce(dolares, 0) + coalesce(euros, 0) + coalesce(reales, 0)
      + coalesce(usdt, 0) + coalesce(libras, 0) + coalesce(cheques, 0)
      + coalesce(pesos, 0) as monto,
    case
      when coalesce(dolares, 0) <> 0 then 'USD'
      when coalesce(euros, 0)   <> 0 then 'EUR'
      when coalesce(reales, 0)  <> 0 then 'BRL'
      when coalesce(usdt, 0)    <> 0 then 'USDT'
      when coalesce(libras, 0)  <> 0 then 'GBP'
      when coalesce(cheques, 0) <> 0 then 'CHQ'
      when coalesce(pesos, 0)   <> 0 then 'ARS'
      else '(sin importe)'
    end as moneda,
    cliente, propio, externo
  from movimientos_caja
  where op = 'T'
)
select
  coalesce(ref, '⚠ SIN REFERENCIA')                        as referencia,
  count(*) filter (where punta = 'ingreso')                as ingresos,
  count(*) filter (where punta = 'egreso')                 as egresos,
  count(*) filter (where punta = 'ingreso')
    - count(*) filter (where punta = 'egreso')             as diferencia,
  count(*) filter (where punta is null)                    as ni_ing_ni_egr,
  min(fecha)                                               as desde,
  max(fecha)                                               as hasta
from t
group by 1
having
  -- Distinta cantidad de patas de cada lado: el grupo está corrido.
  count(*) filter (where punta = 'ingreso') <> count(*) filter (where punta = 'egreso')
  -- Filas cuya operación no es INGRESAN ni EGRESAN: no pueden parearse con nada.
  or count(*) filter (where punta is null) > 0
  -- Sin referencia no hay con qué parear, así que cada fila queda suelta siempre.
  or bool_or(ref is null)
order by hasta desc;


-- ════════════════════════════════════════════════════════════════════════════
-- 2 · DETALLE: las patas que quedan sin pareja
--
--   Reproduce el emparejamiento del motor: dentro de cada referencia se numeran
--   los ingresos y los egresos por fecha, y sobran las que pasan de la cantidad
--   del lado más corto. Esas son las que la pantalla informa "en curso".
-- ════════════════════════════════════════════════════════════════════════════
with t as (
  select
    id,
    fecha,
    nullif(btrim(coalesce(notas, '')), '') as ref,
    case
      when upper(coalesce(operacion, '')) like '%INGRES%' then 'ingreso'
      when upper(coalesce(operacion, '')) like '%EGRES%'  then 'egreso'
    end as punta,
    coalesce(dolares, 0) + coalesce(euros, 0) + coalesce(reales, 0)
      + coalesce(usdt, 0) + coalesce(libras, 0) + coalesce(cheques, 0)
      + coalesce(pesos, 0) as monto,
    case
      when coalesce(dolares, 0) <> 0 then 'USD'
      when coalesce(euros, 0)   <> 0 then 'EUR'
      when coalesce(reales, 0)  <> 0 then 'BRL'
      when coalesce(usdt, 0)    <> 0 then 'USDT'
      when coalesce(libras, 0)  <> 0 then 'GBP'
      when coalesce(cheques, 0) <> 0 then 'CHQ'
      when coalesce(pesos, 0)   <> 0 then 'ARS'
      else '(sin importe)'
    end as moneda,
    cliente, propio, externo, operacion
  from movimientos_caja
  where op = 'T'
),
clasificadas as (
  select t.*,
    row_number() over (partition by ref, punta order by fecha, id)   as orden,
    count(*) filter (where punta = 'ingreso') over (partition by ref) as n_ing,
    count(*) filter (where punta = 'egreso')  over (partition by ref) as n_egr
  from t
  where ref is not null and punta is not null
)
select fecha, ref as referencia, punta as queda_sin_pareja, moneda, monto,
       cliente, propio, externo, operacion, id
from clasificadas
where orden > least(n_ing, n_egr)
union all
select fecha, coalesce(ref, '⚠ SIN REFERENCIA'),
       coalesce(punta, '⚠ ni ingreso ni egreso'), moneda, monto,
       cliente, propio, externo, operacion, id
from t
where ref is null or punta is null
order by fecha desc;


-- ════════════════════════════════════════════════════════════════════════════
-- 3 · CONTROL: pares con el egreso mayor al ingreso
--
--   Por definición del negocio el ingreso siempre es mayor o igual al egreso:
--   un par negativo no es una pérdida, es carga mal emparejada. Es la señal que
--   delata un grupo corrido incluso cuando la cantidad de patas cierra.
-- ════════════════════════════════════════════════════════════════════════════
with t as (
  select
    id,
    fecha,
    nullif(btrim(coalesce(notas, '')), '') as ref,
    case
      when upper(coalesce(operacion, '')) like '%INGRES%' then 'ingreso'
      when upper(coalesce(operacion, '')) like '%EGRES%'  then 'egreso'
    end as punta,
    coalesce(dolares, 0) + coalesce(euros, 0) + coalesce(reales, 0)
      + coalesce(usdt, 0) + coalesce(libras, 0) + coalesce(cheques, 0)
      + coalesce(pesos, 0) as monto,
    case
      when coalesce(dolares, 0) <> 0 then 'USD'
      when coalesce(euros, 0)   <> 0 then 'EUR'
      when coalesce(reales, 0)  <> 0 then 'BRL'
      when coalesce(usdt, 0)    <> 0 then 'USDT'
      when coalesce(libras, 0)  <> 0 then 'GBP'
      when coalesce(cheques, 0) <> 0 then 'CHQ'
      when coalesce(pesos, 0)   <> 0 then 'ARS'
      else '(sin importe)'
    end as moneda
  from movimientos_caja
  where op = 'T'
),
clasificadas as (
  select t.*,
    row_number() over (partition by ref, punta order by fecha, id)   as orden,
    count(*) filter (where punta = 'ingreso') over (partition by ref) as n_ing,
    count(*) filter (where punta = 'egreso')  over (partition by ref) as n_egr
  from t
  where ref is not null and punta is not null
),
pares as (
  select
    i.ref,
    greatest(i.fecha, e.fecha) as se_cerro,
    i.fecha as fecha_ingreso,
    e.fecha as fecha_egreso,
    i.moneda,
    i.monto as ingreso,
    e.monto as egreso,
    i.monto + e.monto as resultado
  from clasificadas i
  join clasificadas e
    on e.ref = i.ref and e.punta = 'egreso' and e.orden = i.orden
  where i.punta = 'ingreso' and i.orden <= least(i.n_ing, i.n_egr)
)
select se_cerro, ref as referencia, moneda, ingreso, egreso, resultado,
       fecha_ingreso, fecha_egreso
from pares
where round(resultado) < 0
order by se_cerro desc;
