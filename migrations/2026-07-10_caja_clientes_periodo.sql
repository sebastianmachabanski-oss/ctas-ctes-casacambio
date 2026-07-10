-- Totales de CAJA por cliente FILTRABLES POR PERÍODO, para que los filtros del tablero
-- de Inicio (Día/Semana/Mes/Año/Rango) afecten también a la tabla de clientes.
-- Misma lógica que la vista caja_clientes, con rango opcional de fechas.
-- SECURITY INVOKER (default de las funciones): respeta la RLS de movimientos_caja.
-- Segura de correr más de una vez (create or replace).
create or replace function public.caja_clientes_periodo(p_desde date default null, p_hasta date default null)
returns table(cliente text, pesos numeric, dolares numeric, euros numeric, reales numeric, movimientos bigint)
language sql
stable
as $$
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
    and (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha <= p_hasta)
  group by cliente;
$$;
