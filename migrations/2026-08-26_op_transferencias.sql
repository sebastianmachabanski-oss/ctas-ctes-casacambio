-- Transferencias: traer el marcador OP y la OPERACION EXTERNA de la planilla (26/8/2026).
--
-- QUE PROBLEMA RESUELVE
-- El cliente marca las transferencias poniendo "T" en la columna OP de la planilla y
-- escribe los participantes en NOTAS. Con eso armaba la tabla dinamica RESULTADO TT.
--
-- El sync nunca leyo esa columna y la base no tenia donde guardarla, asi que en la app
-- no habia forma de saber cual movimiento es una transferencia. Lo mismo con OPERACION
-- EXTERNA, que era una de las filas de esa tabla dinamica.
--
-- DESPUES DE CORRER ESTO HAY QUE CORRER UN SYNC FULL
-- Las columnas quedan vacias hasta que el sync vuelva a leer la planilla. Un sync full
-- desde GitHub Actions (workflow "Sincronizar CAJA", modo full) las completa.
--
-- Es SEGURO correr esta migracion dos veces.
--
-- Los comentarios van sin acentos a proposito: el SQL Editor de Supabase rompe la linea
-- al pegar acentos y guiones largos.

alter table public.movimientos_caja
  add column if not exists op                text,
  add column if not exists operacion_externa text;

comment on column public.movimientos_caja.op is
  'Marcador de la columna OP de la planilla. "T" = la fila es parte de una transferencia; '
  '"C" = operacion comun. Los participantes de la transferencia van en NOTAS.';

comment on column public.movimientos_caja.operacion_externa is
  'Columna OPERACION EXTERNA de la planilla: la contrapartida de OPERACION. Se usa en el '
  'listado de transferencias.';

-- La pantalla de transferencias entra siempre por op = 'T'. Indice parcial: las filas
-- con "C" son la enorme mayoria y no hace falta indexarlas.
create index if not exists idx_mcaja_op_t
  on public.movimientos_caja (fecha desc)
  where op = 'T';
