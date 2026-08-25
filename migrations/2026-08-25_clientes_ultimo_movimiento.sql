-- Inicio: fecha del ultimo movimiento de cada cliente (25/8/2026).
--
-- La tabla de clientes del tablero lista TODOS los clientes en orden alfabetico, y son
-- mas de 1.000. El que opero ayer queda enterrado entre cientos que no aparecen hace un
-- anio. Con esta fecha, la pantalla puede mostrar primero a los activos y esconder al
-- resto, sin perderlos: siguen apareciendo al buscarlos por nombre.
--
-- Es SEGURO correr esta migracion dos veces (create or replace / drop-create).
--
-- Los comentarios van sin acentos ni guiones largos a proposito: el SQL Editor de
-- Supabase rompe la linea al pegar esos caracteres y la consulta falla.

-- Totales de CAJA por cliente, con la fecha de su ultimo movimiento.
--
-- Se borra primero: la funcion ya existia y ahora devuelve una columna mas, y Postgres
-- no permite cambiar las columnas de salida con create or replace.
drop function if exists public.caja_clientes_periodo(date, date);

create function public.caja_clientes_periodo(p_desde date default null, p_hasta date default null)
returns table(
  cliente text, pesos numeric, dolares numeric, euros numeric, reales numeric,
  movimientos bigint, ultimo_movimiento date
)
language sql
stable
as $$
  select
    cliente,
    sum(pesos)   as pesos,
    sum(dolares) as dolares,
    sum(euros)   as euros,
    sum(reales)  as reales,
    count(*)     as movimientos,
    max(fecha)   as ultimo_movimiento
  from public.movimientos_caja
  where operacion <> 'OPERACION?'
    and cliente is not null
    and btrim(cliente) <> ''
    and (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha <= p_hasta)
  group by cliente;
$$;

-- Misma informacion en la vista de respaldo: la pantalla cae a esta vista si la
-- funcion no esta disponible.
drop view if exists public.caja_clientes;
create view public.caja_clientes
with (security_invoker = true) as
select
  cliente,
  sum(pesos)   as pesos,
  sum(dolares) as dolares,
  sum(euros)   as euros,
  sum(reales)  as reales,
  count(*)     as movimientos,
  max(fecha)   as ultimo_movimiento
from public.movimientos_caja
where operacion <> 'OPERACION?'
  and cliente is not null
  and btrim(cliente) <> ''
group by cliente;
