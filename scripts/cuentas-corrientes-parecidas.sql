-- ════════════════════════════════════════════════════════════════════════════
-- CANDIDATAS A DEPURACIÓN: cuentas corrientes con nombres parecidos
--
-- Para correr a mano en el SQL Editor de Supabase. SOLO LECTURA: no modifica
-- nada (salvo la C, que necesita habilitar una extensión; ver más abajo).
--
-- ── PARA QUÉ ────────────────────────────────────────────────────────────────
-- El mismo cliente quedó cargado con varios nombres —"EDY", "edy", "EDY " con un
-- espacio al final— y su saldo quedó repartido entre todos. Esto arma la lista de
-- candidatas para revisar con el cliente antes de unificar nada.
--
-- Son CUATRO consultas independientes, de la más segura a la más especulativa:
--
--   A · IGUALES AL NORMALIZAR  — difieren solo en mayúsculas, espacios, acentos o
--       puntuación. Son duplicados casi seguros y la decisión no tiene vuelta.
--   B · UNA CONTENIDA EN OTRA  — "PILO" y "PILO 2", "MATI CENT" y "MATI CENTRO".
--       Muy probables, pero hay que mirarlas: puede haber dos cuentas distintas
--       que compartan el principio del nombre.
--   C · PARECIDAS CON ERRATAS  — "GONZALES" y "GONZALEZ". Las encuentra por
--       similitud, así que trae ruido: es para revisar de a una.
--   D · DESPAREJAS CON EL PADRÓN — cuentas con movimientos que no están en
--       `cuentas_corrientes`, y cuentas del padrón que nunca tuvieron uno.
--       No son duplicados, pero son parte de la misma limpieza.
--
-- ── CÓMO LEER EL RESULTADO ──────────────────────────────────────────────────
-- Los nombres salen entre «comillas angulares» A PROPÓSITO: es lo que deja ver un
-- espacio al principio o al final, que es justamente el duplicado que nadie puede
-- detectar mirando la pantalla. «EDY» y «EDY » son dos cuentas distintas para la
-- base y se leen igual en una lista.
--
-- Los saldos salen de `saldos_cuenta_corriente`, la MISMA vista que usan Cuentas
-- Corrientes y Saldos Pendientes, así que los números coinciden con la pantalla.
-- `movs` cuenta los movimientos no anulados de cuenta corriente: es el mejor
-- criterio para decidir cuál nombre sobrevive a una unificación.
--
-- ── ANTES DE UNIFICAR ───────────────────────────────────────────────────────
-- Unificar dos cuentas NO es renombrar en un lugar. El mismo nombre vive en
-- cuatro tablas y hay que tocarlas todas:
--
--   diario.cuenta_cte        de donde sale el SALDO del cliente
--   movimientos_caja.cliente el espejo que leen Transacciones, Inicio y Ganancias
--   cuentas_corrientes.nombre el padrón de cuentas activas
--   clientes.nombre          el padrón del filtro de Transacciones
--
-- Tocar unas sí y otras no deja el saldo mal SIN NINGUNA SEÑAL en pantalla, que es
-- exactamente el problema del 1/9/2026 (ver CLAUDE.md). El script de unificación se
-- escribe cuando estén elegidos los grupos, con respaldo y rollback.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- A · IGUALES AL NORMALIZAR
--     Mismo nombre salvo mayúsculas, espacios, acentos o puntuación.
-- ════════════════════════════════════════════════════════════════════════════
with cuentas as (
  select nombre as cuenta, activo from public.cuentas_corrientes
  union
  select cuenta_cte, null::boolean from public.saldos_cuenta_corriente
),
movs as (
  select cuenta_cte, count(*) as movimientos, min(fecha) as primer_mov
  from public.diario
  where anulado = false and tipo = 'CTA CTE'
  group by cuenta_cte
),
clave as (
  select
    c.cuenta,
    bool_or(coalesce(c.activo, true)) as activa,
    regexp_replace(
      translate(upper(btrim(c.cuenta)),
                'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'AAAAAEEEEIIIIOOOOOUUUUNC'),
      '[^A-Z0-9]', '', 'g') as clave
  from cuentas c
  group by c.cuenta
)
select
  k.clave                              as grupo,
  '«' || k.cuenta || '»'               as cuenta,
  k.activa,
  coalesce(m.movimientos, 0)           as movs,
  s.ultimo_movimiento                  as ultimo_mov,
  m.primer_mov,
  round(coalesce(s.saldo_dolares, 0))  as usd,
  round(coalesce(s.saldo_pesos, 0))    as ars,
  round(coalesce(s.saldo_euros, 0))    as eur,
  round(coalesce(s.saldo_reales, 0))   as brl,
  round(coalesce(s.saldo_usdt, 0))     as usdt,
  round(coalesce(s.saldo_libras, 0))   as gbp
from clave k
left join movs m on m.cuenta_cte = k.cuenta
left join public.saldos_cuenta_corriente s on s.cuenta_cte = k.cuenta
where k.clave in (select clave from clave group by clave having count(*) > 1)
order by k.clave, coalesce(m.movimientos, 0) desc, k.cuenta;


-- ════════════════════════════════════════════════════════════════════════════
-- B · UNA CONTENIDA EN LA OTRA
--     De a pares: la más corta a la izquierda. Mínimo 3 caracteres, porque con
--     menos el pedazo aparece dentro de cualquier cosa y la lista se vuelve ruido.
-- ════════════════════════════════════════════════════════════════════════════
with cuentas as (
  select nombre as cuenta from public.cuentas_corrientes
  union
  select cuenta_cte from public.saldos_cuenta_corriente
),
movs as (
  select cuenta_cte, count(*) as movimientos
  from public.diario
  where anulado = false and tipo = 'CTA CTE'
  group by cuenta_cte
),
clave as (
  select
    c.cuenta,
    regexp_replace(
      translate(upper(btrim(c.cuenta)),
                'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'AAAAAEEEEIIIIOOOOOUUUUNC'),
      '[^A-Z0-9]', '', 'g') as clave
  from cuentas c
  group by c.cuenta
),
datos as (
  select k.cuenta, k.clave,
    coalesce(m.movimientos, 0)          as movs,
    s.ultimo_movimiento,
    round(coalesce(s.saldo_dolares, 0)) as usd,
    round(coalesce(s.saldo_pesos, 0))   as ars
  from clave k
  left join movs m on m.cuenta_cte = k.cuenta
  left join public.saldos_cuenta_corriente s on s.cuenta_cte = k.cuenta
)
select
  '«' || a.cuenta || '»' as corta, a.movs as movs_a,
  a.ultimo_movimiento as ultimo_a, a.usd as usd_a, a.ars as ars_a,
  '«' || b.cuenta || '»' as larga, b.movs as movs_b,
  b.ultimo_movimiento as ultimo_b, b.usd as usd_b, b.ars as ars_b
from datos a
join datos b
  on length(a.clave) < length(b.clave)
 and position(a.clave in b.clave) > 0
where length(a.clave) >= 3
order by a.cuenta, b.cuenta;


-- ════════════════════════════════════════════════════════════════════════════
-- C · PARECIDAS CON ERRATAS
--     Necesita la extensión `pg_trgm`, que compara por pedacitos de tres letras.
--     Habilitarla es seguro: no toca ningún dato y se puede quitar después con
--     `drop extension pg_trgm;`. Si no la querés, saltá esta consulta.
--     El umbral 0.55 es el punto donde deja de traer parecidos que no lo son;
--     bajalo a 0.45 si sospechás que falta alguna.
-- ════════════════════════════════════════════════════════════════════════════
create extension if not exists pg_trgm;

with cuentas as (
  select nombre as cuenta from public.cuentas_corrientes
  union
  select cuenta_cte from public.saldos_cuenta_corriente
),
movs as (
  select cuenta_cte, count(*) as movimientos
  from public.diario
  where anulado = false and tipo = 'CTA CTE'
  group by cuenta_cte
),
clave as (
  select
    c.cuenta,
    regexp_replace(
      translate(upper(btrim(c.cuenta)),
                'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'AAAAAEEEEIIIIOOOOOUUUUNC'),
      '[^A-Z0-9]', '', 'g') as clave
  from cuentas c
  group by c.cuenta
),
datos as (
  select k.cuenta, k.clave,
    coalesce(m.movimientos, 0)          as movs,
    s.ultimo_movimiento,
    round(coalesce(s.saldo_dolares, 0)) as usd,
    round(coalesce(s.saldo_pesos, 0))   as ars
  from clave k
  left join movs m on m.cuenta_cte = k.cuenta
  left join public.saldos_cuenta_corriente s on s.cuenta_cte = k.cuenta
)
select
  round(similarity(a.clave, b.clave)::numeric, 2) as parecido,
  '«' || a.cuenta || '»' as cuenta_a, a.movs as movs_a,
  a.ultimo_movimiento as ultimo_a, a.usd as usd_a, a.ars as ars_a,
  '«' || b.cuenta || '»' as cuenta_b, b.movs as movs_b,
  b.ultimo_movimiento as ultimo_b, b.usd as usd_b, b.ars as ars_b
from datos a
join datos b on a.cuenta < b.cuenta
where a.clave <> b.clave
  -- Las que se contienen ya salieron en la B: acá no se repiten.
  and position(a.clave in b.clave) = 0
  and position(b.clave in a.clave) = 0
  and similarity(a.clave, b.clave) >= 0.55
order by parecido desc, a.cuenta;


-- ════════════════════════════════════════════════════════════════════════════
-- D · DESPAREJAS ENTRE EL PADRÓN Y LOS MOVIMIENTOS
--     No son duplicados, pero salen en la misma limpieza: una cuenta con
--     movimientos que no figura en el padrón no se puede elegir en el alta, y una
--     del padrón que nunca tuvo un movimiento probablemente sobre.
-- ════════════════════════════════════════════════════════════════════════════
select
  '«' || coalesce(c.nombre, s.cuenta_cte) || '»' as cuenta,
  case
    when c.nombre is null    then 'tiene movimientos pero NO esta en el padron'
    when s.cuenta_cte is null then 'esta en el padron pero NUNCA tuvo movimientos'
  end                                            as situacion,
  c.activo                                       as activa,
  s.ultimo_movimiento                            as ultimo_mov,
  round(coalesce(s.saldo_dolares, 0))            as usd,
  round(coalesce(s.saldo_pesos, 0))              as ars
from public.cuentas_corrientes c
full outer join public.saldos_cuenta_corriente s on s.cuenta_cte = c.nombre
where c.nombre is null or s.cuenta_cte is null
order by situacion, cuenta;
