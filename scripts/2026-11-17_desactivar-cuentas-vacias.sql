-- ════════════════════════════════════════════════════════════════════════════
-- DEPURACIÓN · desactivar las cuentas corrientes que nunca tuvieron movimientos
--
-- Se corre A MANO en el SQL Editor de Supabase, de a un paso por vez.
-- TOCA PRODUCCIÓN, pero NO BORRA NADA: solo apaga el campo `activo`.
--
-- ── QUÉ HACE ────────────────────────────────────────────────────────────────
-- Seis cuentas existen en el padrón y no tienen un solo movimiento de cuenta
-- corriente. No hay nada que unificar: no tienen saldo ni historia. Apagadas
-- desaparecen de los desplegables y dejan de ser candidatas a elegirse por error.
--
--   COLO BRUK · COLO CIRCULO · MONI JALABE · PADDLE · DAVID RICHARD · SERGIO SUS
--
-- Son además el origen de nueve de los veintiún pares de nombres parecidos que
-- devolvió scripts/cuentas-corrientes-parecidas.sql: apagarlas limpia un tercio
-- del ruido sin consultarle nada a nadie.
--
-- ── POR QUÉ DESACTIVAR Y NO BORRAR ──────────────────────────────────────────
-- Porque es reversible y porque alcanza: todas las pantallas filtran por
-- `activo = true`, así que una cuenta apagada no se puede elegir en ningún lado.
-- Borrar la fila no agrega nada y perdería el rastro de que esa cuenta existió.
--
-- ── LAS DOS TABLAS ──────────────────────────────────────────────────────────
-- El nombre vive en dos padrones distintos y hay que mirarlos por separado:
--
--   cuentas_corrientes  las cuentas elegibles en el alta y en Cuenta Corriente
--   clientes            el padrón del filtro del listado de Transacciones, que
--                       incluye además los clientes EVENTUALES de las filas de CAJA
--
-- Un nombre puede no tener movimientos de cuenta corriente y sí tenerlos en CAJA.
-- Apagarlo en `clientes` dejaría esos movimientos a la vista en el listado pero
-- imposibles de filtrar — exactamente el error que se corrigió el 12/11/2026. Por
-- eso el paso 3 se apaga SOLO si el nombre no aparece en ninguna de las dos tablas
-- de movimientos, y la condición está escrita dentro del propio UPDATE: si alguno
-- tiene movimientos, ese se saltea solo.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 0 · VERIFICAR (antes de tocar nada)
--
-- `cta_cte` tiene que dar 0 en las seis. Si alguna da distinto de 0, PARAR: esa
-- cuenta tiene historia y no entra en esta limpieza.
-- `caja` puede dar cualquier cosa: dice si el nombre además se usó como cliente
-- de CAJA, y es lo que decide si se apaga también en el padrón del filtro.
-- ════════════════════════════════════════════════════════════════════════════
select
  c.nombre,
  c.activo as activa_hoy,
  (select count(*) from public.diario d
     where d.cuenta_cte = c.nombre and d.tipo = 'CTA CTE')      as cta_cte,
  (select count(*) from public.diario d
     where d.cuenta_cte = c.nombre)                             as diario_total,
  (select count(*) from public.movimientos_caja m
     where m.cliente = c.nombre)                                as caja
from public.cuentas_corrientes c
where c.nombre in ('COLO BRUK', 'COLO CIRCULO', 'MONI JALABE',
                   'PADDLE', 'DAVID RICHARD', 'SERGIO SUS')
order by c.nombre;


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 1 · RESPALDO
--
-- Guarda el estado actual de las filas de los dos padrones. Es lo que permite
-- volver atrás con los valores exactos en vez de suponer que todas estaban en
-- `true`. Segura de correr más de una vez: no duplica.
-- ════════════════════════════════════════════════════════════════════════════
create schema if not exists respaldos;

create table if not exists respaldos.cuentas_20261117
  as select * from public.cuentas_corrientes where 1 = 0;
create table if not exists respaldos.clientes_20261117
  as select * from public.clientes where 1 = 0;

insert into respaldos.cuentas_20261117
select c.* from public.cuentas_corrientes c
where c.nombre in ('COLO BRUK', 'COLO CIRCULO', 'MONI JALABE',
                   'PADDLE', 'DAVID RICHARD', 'SERGIO SUS')
  and not exists (select 1 from respaldos.cuentas_20261117 r where r.nombre = c.nombre);

insert into respaldos.clientes_20261117
select c.* from public.clientes c
where c.nombre in ('COLO BRUK', 'COLO CIRCULO', 'MONI JALABE',
                   'PADDLE', 'DAVID RICHARD', 'SERGIO SUS')
  and not exists (select 1 from respaldos.clientes_20261117 r where r.nombre = c.nombre);

select
  (select count(*) from respaldos.cuentas_20261117)  as cuentas_respaldadas,
  (select count(*) from respaldos.clientes_20261117) as clientes_respaldados;


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 2 · APAGARLAS EN cuentas_corrientes
--
-- La condición `not exists` es una red: si alguna tuviera movimientos de cuenta
-- corriente, el UPDATE la saltea sola en vez de apagarla.
-- ════════════════════════════════════════════════════════════════════════════
update public.cuentas_corrientes c
set activo = false
where c.nombre in ('COLO BRUK', 'COLO CIRCULO', 'MONI JALABE',
                   'PADDLE', 'DAVID RICHARD', 'SERGIO SUS')
  and c.activo = true
  and not exists (
    select 1 from public.diario d
    where d.cuenta_cte = c.nombre and d.tipo = 'CTA CTE'
  );


-- ════════════════════════════════════════════════════════════════════════════
-- PASO 3 · APAGARLAS EN EL PADRÓN DEL FILTRO
--
-- Solo las que no aparecen en NINGUNA de las dos tablas de movimientos. Un
-- nombre con movimientos de CAJA se queda encendido acá: si no, esos movimientos
-- se seguirían viendo en el listado y el filtro no los encontraría.
-- ════════════════════════════════════════════════════════════════════════════
update public.clientes c
set activo = false
where c.nombre in ('COLO BRUK', 'COLO CIRCULO', 'MONI JALABE',
                   'PADDLE', 'DAVID RICHARD', 'SERGIO SUS')
  and c.activo = true
  and not exists (select 1 from public.diario d where d.cuenta_cte = c.nombre)
  and not exists (select 1 from public.movimientos_caja m where m.cliente = c.nombre);


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL
--
-- `en_cuentas` tiene que decir false en las seis.
-- `en_filtro` puede quedar en true en las que tengan movimientos de CAJA: eso
-- está bien y es a propósito.
-- ════════════════════════════════════════════════════════════════════════════
select
  n.nombre,
  cc.activo as en_cuentas,
  cl.activo as en_filtro,
  (select count(*) from public.movimientos_caja m where m.cliente = n.nombre) as caja
from (values ('COLO BRUK'), ('COLO CIRCULO'), ('MONI JALABE'),
             ('PADDLE'), ('DAVID RICHARD'), ('SERGIO SUS')) as n(nombre)
left join public.cuentas_corrientes cc on cc.nombre = n.nombre
left join public.clientes cl           on cl.nombre = n.nombre
order by n.nombre;


-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK · las vuelve a encender con el valor que tenían
-- ════════════════════════════════════════════════════════════════════════════
-- update public.cuentas_corrientes c
-- set activo = r.activo
-- from respaldos.cuentas_20261117 r
-- where r.nombre = c.nombre;
--
-- update public.clientes c
-- set activo = r.activo
-- from respaldos.clientes_20261117 r
-- where r.nombre = c.nombre;
--
-- Una vez conforme, el respaldo se puede tirar:
--   drop table respaldos.cuentas_20261117, respaldos.clientes_20261117;
