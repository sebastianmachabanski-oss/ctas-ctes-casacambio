-- Objetos de datos para el tablero de Inicio (situación de caja + histórico), todos
-- derivados EXACTAMENTE de movimientos_caja (misma fuente validada contra la planilla:
-- la suma de cada columna de moneda = saldo en caja de esa moneda).
--
-- Seguro correrla más de una vez (create or replace / drop if exists).

-- ── Vista: totales de CAJA por cliente (para la pestaña "Caja" de la tabla de clientes) ──
-- security_invoker: respeta la RLS de movimientos_caja (solo staff la consulta).
drop view if exists public.caja_clientes;
create view public.caja_clientes
with (security_invoker = true) as
select
  cliente,
  sum(pesos)   as pesos,
  sum(dolares) as dolares,
  sum(euros)   as euros,
  sum(reales)  as reales,
  count(*)     as movimientos
from public.movimientos_caja
where operacion <> 'OPERACION?'
  and cliente is not null
  and btrim(cliente) <> ''
group by cliente;

-- ── RPC: saldo diario acumulado por moneda (para el gráfico de línea del tablero) ──
-- Devuelve, por cada fecha con movimientos, el saldo acumulado (running sum) de la
-- columna de la moneda pedida. La app toma la ventana que necesite (p. ej. últimos 90
-- días) y deriva de ahí los deltas mensuales. security invoker por defecto → respeta RLS.
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
        else dolares
      end
    )) over (order by fecha) as saldo
  from public.movimientos_caja
  where operacion <> 'OPERACION?'
  group by fecha
  order by fecha;
$$;
