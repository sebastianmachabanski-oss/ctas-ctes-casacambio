-- ════════════════════════════════════════════════════════════════════════════
-- REPARACIÓN DE DATOS · transferencias cargadas con tres patas (16/11/2026)
--
-- Se corre A MANO en el SQL Editor de Supabase, de a un paso por vez.
-- TOCA PRODUCCIÓN Y BORRA FILAS: el paso 0 es obligatorio.
--
-- ── QUÉ ARREGLA ─────────────────────────────────────────────────────────────
-- Tres transferencias del histórico de la planilla se cargaron con UN ingreso y
-- DOS egresos, siempre con CHAMI como segundo destinatario. El emparejador de
-- Ganancias casa una pata contra una pata, así que desde cada una de esas fechas
-- el grupo quedó corrido un lugar: cada par mezclaba patas de transferencias
-- distintas. El total seguía cerrando, pero caía en fechas equivocadas y la
-- última pata del grupo quedaba suelta y se informaba como "en curso".
--
--   AND - EDY   22/5/2025     ING 99.495  = EGR 80.000  + EGR 18.810 (CHAMI) + 685
--   TOM - EICH  10-12/3/2025  ING 125.938 = EGR 100.200 + EGR 25.162 (CHAMI) + 576
--   CAR - EDY   29-30/1/2026  ING 52.330  = EGR 34.780  + EGR 16.830 (CHAMI) + 720
--
-- La reparación une los dos egresos en uno solo por el total. No inventa ningún
-- importe: el spread que queda es el verdadero, en la fecha verdadera.
--
-- ── POR QUÉ ES SEGURO ───────────────────────────────────────────────────────
-- Las seis filas son tipo = CAJA y cuenta = CAJA: no existen en `diario`, así que
-- no hay saldo de cuenta corriente en juego (verificado el 16/11/2026, dio 0).
-- La suma de las columnas de caja no cambia —51.610 es 34.780 + 16.830—, así que
-- la posición de caja queda idéntica.
--
-- ── LO QUE SÍ CAMBIA ────────────────────────────────────────────────────────
--  · Se pierde el nombre de CHAMI en esas tres salidas dentro de la app. El
--    detalle sigue en la planilla y en la tabla de respaldo.
--  · Las filas conservan su `fila_sheet`. Si alguna vez corre el sync, vuelve a
--    traerlas como están en la planilla y DESHACE esto en silencio. Para que sea
--    definitivo hay que corregir también las tres filas allá.
--
-- NO hace falta desplegar nada: con los datos parejos, el motor que está hoy en
-- producción ya los calcula bien.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 0 · RESPALDO (obligatorio, antes de todo)
--
-- Guarda las seis filas ENTERAS. Es lo que hace posible el rollback, porque tres
-- de ellas se borran. Va en un esquema aparte: PostgREST solo expone `public`,
-- así que el respaldo no queda accesible desde la API.
-- Segura de correr más de una vez: no duplica.
-- ════════════════════════════════════════════════════════════════════════════
create schema if not exists respaldos;

create table if not exists respaldos.tt_20261116
  as select * from public.movimientos_caja where 1 = 0;

insert into respaldos.tt_20261116
select m.* from public.movimientos_caja m
where m.id in (
  'e5c7aae0-a482-4f3a-b993-f8f300308c3d',  -- AND - EDY  · EGR EDY   80.000  (queda)
  'ae102c91-5f56-4c45-95f3-58d23724b138',  -- AND - EDY  · EGR CHAMI 18.810  (se borra)
  '4bea13e6-a3a3-4573-9276-995a0f4fdf53',  -- TOM - EICH · EGR EICH 100.200  (queda)
  'e05e1266-788a-4bc5-8e7c-ed52b1bcb9cd',  -- TOM - EICH · EGR CHAMI 25.162  (se borra)
  'bf7b999e-4a95-42aa-a5a8-8ea4cd4ad6b9',  -- CAR - EDY  · EGR EDY   34.780  (queda)
  'be9586b3-f79c-441c-8d96-d8c49668dd93'   -- CAR - EDY  · EGR CHAMI 16.830  (se borra)
)
and not exists (select 1 from respaldos.tt_20261116 r where r.id = m.id);

-- Tiene que devolver 6. Si devuelve menos, PARAR: alguna fila ya no es la que era.
select count(*) as filas_respaldadas from respaldos.tt_20261116;


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 1 · AND - EDY (22/5/2025)
--   EGR EDY 80.000 + EGR CHAMI 18.810  →  un egreso de 98.810
--   Contra el ingreso de 99.495 queda un spread de 685.
-- ════════════════════════════════════════════════════════════════════════════
begin;

update public.movimientos_caja
set monto = 98810, dolares = -98810
where id = 'e5c7aae0-a482-4f3a-b993-f8f300308c3d'
  and op = 'T' and btrim(coalesce(notas, '')) = 'AND - EDY';

delete from public.movimientos_caja
where id = 'ae102c91-5f56-4c45-95f3-58d23724b138'
  and op = 'T' and btrim(coalesce(notas, '')) = 'AND - EDY'
  and coalesce(dolares, 0) = -18810;

commit;

-- Verificación: 3 ingresos, 3 egresos, spread 846 (685 + 135 + 26).
select
  count(*) filter (where upper(operacion) like '%INGRES%') as ingresos,
  count(*) filter (where upper(operacion) like '%EGRES%')  as egresos,
  sum(coalesce(dolares, 0))                                as spread_total
from public.movimientos_caja
where op = 'T' and btrim(coalesce(notas, '')) = 'AND - EDY';


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 2 · TOM - EICH (10-12/3/2025)
--   EGR EICH 100.200 (10/3) + EGR CHAMI 25.162 (12/3)  →  un egreso de 125.362
--   Contra el ingreso de 125.938 queda un spread de 576.
--   Las dos salidas son de días distintos: al unirlas, la ganancia queda el 10/3
--   en vez del 12/3. Dos días, el mismo mes.
-- ════════════════════════════════════════════════════════════════════════════
begin;

update public.movimientos_caja
set monto = 125362, dolares = -125362
where id = '4bea13e6-a3a3-4573-9276-995a0f4fdf53'
  and op = 'T' and btrim(coalesce(notas, '')) = 'TOM - EICH';

delete from public.movimientos_caja
where id = 'e05e1266-788a-4bc5-8e7c-ed52b1bcb9cd'
  and op = 'T' and btrim(coalesce(notas, '')) = 'TOM - EICH'
  and coalesce(dolares, 0) = -25162;

commit;

-- Verificación: 8 ingresos, 8 egresos, spread_total positivo.
select
  count(*) filter (where upper(operacion) like '%INGRES%') as ingresos,
  count(*) filter (where upper(operacion) like '%EGRES%')  as egresos,
  sum(coalesce(dolares, 0))                                as spread_total
from public.movimientos_caja
where op = 'T' and btrim(coalesce(notas, '')) = 'TOM - EICH';


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 3 · CAR - EDY (29-30/1/2026) — la que se ve hoy en pantalla
--   EGR EDY 34.780 + EGR CHAMI 16.830  →  un egreso de 51.610
--   Contra el ingreso de 52.330 queda un spread de 720.
-- ════════════════════════════════════════════════════════════════════════════
begin;

update public.movimientos_caja
set monto = 51610, dolares = -51610
where id = 'bf7b999e-4a95-42aa-a5a8-8ea4cd4ad6b9'
  and op = 'T' and btrim(coalesce(notas, '')) = 'CAR - EDY';

delete from public.movimientos_caja
where id = 'be9586b3-f79c-441c-8d96-d8c49668dd93'
  and op = 'T' and btrim(coalesce(notas, '')) = 'CAR - EDY'
  and coalesce(dolares, 0) = -16830;

commit;

-- Verificación: 8 ingresos, 8 egresos, spread 1.760.
select
  count(*) filter (where upper(operacion) like '%INGRES%') as ingresos,
  count(*) filter (where upper(operacion) like '%EGRES%')  as egresos,
  sum(coalesce(dolares, 0))                                as spread_total
from public.movimientos_caja
where op = 'T' and btrim(coalesce(notas, '')) = 'CAR - EDY';


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL
-- No tiene que devolver NINGUNA fila: ya no quedan referencias descalzadas.
-- Es la consulta 1 de scripts/transferencias-sin-pareja.sql.
-- ════════════════════════════════════════════════════════════════════════════
with t as (
  select
    nullif(btrim(coalesce(notas, '')), '') as ref,
    case
      when upper(coalesce(operacion, '')) like '%INGRES%' then 'ingreso'
      when upper(coalesce(operacion, '')) like '%EGRES%'  then 'egreso'
    end as punta
  from public.movimientos_caja
  where op = 'T'
)
select
  coalesce(ref, '⚠ SIN REFERENCIA')         as referencia,
  count(*) filter (where punta = 'ingreso') as ingresos,
  count(*) filter (where punta = 'egreso')  as egresos
from t
group by 1
having
  count(*) filter (where punta = 'ingreso') <> count(*) filter (where punta = 'egreso')
  or count(*) filter (where punta is null) > 0
  or bool_or(ref is null);


-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK · deja todo exactamente como estaba
--
-- Devuelve los importes a las filas que se consolidaron y vuelve a insertar las
-- tres que se borraron, con su id original. Segura de correr más de una vez.
-- Correrla completa: no tiene sentido volver atrás solo un caso.
-- ════════════════════════════════════════════════════════════════════════════
-- begin;
--
-- update public.movimientos_caja m
-- set monto = r.monto, dolares = r.dolares
-- from respaldos.tt_20261116 r
-- where r.id = m.id
--   and r.id in ('e5c7aae0-a482-4f3a-b993-f8f300308c3d',
--                '4bea13e6-a3a3-4573-9276-995a0f4fdf53',
--                'bf7b999e-4a95-42aa-a5a8-8ea4cd4ad6b9');
--
-- insert into public.movimientos_caja
-- select r.* from respaldos.tt_20261116 r
-- where r.id in ('ae102c91-5f56-4c45-95f3-58d23724b138',
--                'e05e1266-788a-4bc5-8e7c-ed52b1bcb9cd',
--                'be9586b3-f79c-441c-8d96-d8c49668dd93')
--   and not exists (select 1 from public.movimientos_caja m where m.id = r.id);
--
-- commit;
--
-- El `insert ... select r.*` copia la fila entera por posición de columna. Si
-- alguna vez se agrega una columna a `movimientos_caja`, el respaldo deja de
-- calzar: si hay que volver atrás, conviene hacerlo antes de tocar el esquema.
--
-- Una vez validado y con el cliente conforme, el respaldo se puede tirar:
--   drop table respaldos.tt_20261116;
