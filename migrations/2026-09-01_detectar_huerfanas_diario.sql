-- Detectar filas huerfanas en `diario` (1/9/2026). NO borra nada: solo diagnostica.
--
-- QUE BUSCA
-- Un movimiento de cuenta corriente vive en las DOS tablas: `movimientos_caja` (lo que
-- ven Transacciones e Inicio) y `diario` (de donde sale el saldo del cliente).
--
-- Hasta el 1/9/2026 el borrado desde la app sacaba la fila de `movimientos_caja` y dejaba
-- la de `diario` intacta. El movimiento desaparecia del listado y seguia sumando al
-- saldo, sin ninguna senal en pantalla. El codigo ya esta corregido; esto encuentra lo
-- que quedo de antes.
--
-- COMO LAS ENCUENTRA
-- Por contenido: cuenta, fecha, operacion y monto. Es el mismo criterio con el que la app
-- ubica la fila gemela. Ojo con la contracara: si un cliente tiene DOS movimientos
-- realmente identicos el mismo dia, y uno se borro, este listado no los marca (el que
-- queda hace de pareja del huerfano). Es el limite de identificar por contenido.
--
-- OJO CON EL SYNC
-- Un sync FULL borra y reinserta `diario` desde la planilla, asi que se lleva puestas las
-- huerfanas anteriores a esa corrida. Lo que aparezca aca son borrados posteriores al
-- ultimo sync full.
--
-- Los comentarios van sin acentos a proposito: el SQL Editor de Supabase rompe la linea
-- al pegar acentos y guiones largos.

-- ── Resumen: cuanto esta de mas cada cuenta ─────────────────────────────────
select d.cuenta_cte,
       count(*)            as filas_huerfanas,
       sum(d.cc_pesos)     as pesos_de_mas,
       sum(d.cc_dolares)   as dolares_de_mas,
       sum(d.cc_euros)     as euros_de_mas,
       sum(d.cc_reales)    as reales_de_mas,
       sum(coalesce(d.cc_usdt, 0)) as usdt_de_mas
from public.diario d
where d.tipo = 'CTA CTE'
  and d.anulado = false
  and not exists (
    select 1 from public.movimientos_caja m
    where m.tipo = 'CTA CTE'
      and m.cliente = d.cuenta_cte
      and m.fecha = d.fecha
      and m.operacion = d.operacion
      and m.monto = d.monto
  )
group by d.cuenta_cte
order by count(*) desc;

-- ── Detalle: una por una, para revisarlas antes de decidir ──────────────────
select d.id, d.cuenta_cte, d.fecha, d.operacion, d.moneda, d.monto,
       d.cc_pesos, d.cc_dolares, d.cc_euros, d.cc_reales, d.cc_usdt,
       d.evento, d.notas, d.creado_por, d.created_at
from public.diario d
where d.tipo = 'CTA CTE'
  and d.anulado = false
  and not exists (
    select 1 from public.movimientos_caja m
    where m.tipo = 'CTA CTE'
      and m.cliente = d.cuenta_cte
      and m.fecha = d.fecha
      and m.operacion = d.operacion
      and m.monto = d.monto
  )
order by d.cuenta_cte, d.fecha desc;

-- ── Para borrarlas, UNA VEZ REVISADAS ───────────────────────────────────────
-- No se deja lista para ejecutar a proposito: borra saldos de clientes y hay que mirar
-- antes lo que devuelve el detalle de arriba. Si lo que aparece son borrados que
-- efectivamente se hicieron desde la app, se sacan por id:
--
--   delete from public.diario where id in ('...', '...');
