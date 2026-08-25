-- Índice para el orden de la pantalla Transacciones (25/8/2026).
--
-- El listado pasa a ordenarse por `fila_sheet` descendente —la secuencia de la planilla,
-- dada vuelta— en lugar de por fecha. Sin índice, cada página obliga a ordenar las más de
-- 35.000 filas de la tabla.
--
-- Es SEGURO correrla dos veces.

create index if not exists movimientos_caja_fila_sheet_idx
  on public.movimientos_caja (fila_sheet desc nulls first);
