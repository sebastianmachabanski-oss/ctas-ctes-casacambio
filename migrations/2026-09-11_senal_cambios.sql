-- ═══════════════════════════════════════════════════════════════════════════
-- Senal de cambios: una consulta baratisima para saber si hay algo nuevo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- La pantalla de Inicio se refrescaba sola cada 60 segundos. El problema no era el
-- refresco en si, sino QUE recalculaba: los totales del listado se computan trayendo
-- todas las filas que coinciden con el filtro, asi que sin filtros se recorria la tabla
-- entera, cada minuto, por cada pestaña abierta. Y el 99% de las veces no habia cambiado
-- nada.
--
-- Ahora el navegador primero pregunta por esta señal. Si no cambio, no hace nada. El
-- refresco caro ocurre solo cuando de verdad hubo un movimiento.
--
-- QUE MIRA, Y POR QUE MIRA DOS COSAS
--   1. auditoria.ts    -> alta, edicion y borrado hechos DESDE LA APP. Es un indice
--                         (auditoria_ts_idx, ts desc), asi que max() se resuelve leyendo
--                         una sola entrada del indice.
--   2. movimientos_caja.creado_at -> lo que trae el SYNC desde la planilla. El sync lee
--                         la auditoria pero no escribe en ella, asi que sin esta segunda
--                         parte los movimientos que llegan por sincronizacion no
--                         dispararian ningun refresco.
--
-- LIMITE CONOCIDO: un borrado hecho por el sync (no por la app) no mueve ninguno de los
-- dos valores. Es el unico camino que queda sin cubrir; se resuelve al navegar o al
-- recargar, igual que antes.
--
-- SECURITY DEFINER: la lectura de `auditoria` esta restringida por RLS a superusuario, y
-- esta señal la necesitan tambien operadores y administradores. La funcion no expone
-- ningun dato: devuelve dos marcas de tiempo, nada mas.
--
-- Es SEGURO correr esta migracion dos veces.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Indice para que max(creado_at) no recorra la tabla
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists idx_mcaja_creado_at
  on public.movimientos_caja (creado_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. La señal
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.senal_cambios()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select max(ts)::text         from public.auditoria), '')
      || '|'
      || coalesce((select max(creado_at)::text  from public.movimientos_caja), '');
$$;

comment on function public.senal_cambios() is
  'Marca que cambia cuando hay movimientos nuevos, editados o borrados desde la app, o '
  'cuando el sync trae filas de la planilla. La usa el refresco automatico de Inicio '
  'para no recalcular la pantalla cuando no paso nada.';

revoke all on function public.senal_cambios() from public;
grant execute on function public.senal_cambios() to authenticated;
