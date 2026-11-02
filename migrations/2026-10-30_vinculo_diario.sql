-- ─────────────────────────────────────────────────────────────────────────
-- VÍNCULO ENTRE `movimientos_caja` Y `diario`  (30/10/2026)
--
-- EL PROBLEMA
-- Un movimiento de cuenta corriente vive en las dos tablas y hay que tocarlas a la par.
-- Como no compartían ningún identificador, la fila gemela se buscaba por CONTENIDO:
-- cuenta + fecha + operación + monto, desempatando por la referencia.
--
-- Esa búsqueda falla justo cuando más importa. Caso real de producción, 30/10/2026: se
-- cargaron DOS ingresos de U$S 19.300 el mismo día en la misma cuenta, los dos sin
-- referencia. Al borrar uno, la búsqueda encontró dos filas idénticas en `diario`, no se
-- animó a elegir y no borró ninguna. El movimiento desapareció del listado y el saldo del
-- cliente siguió contándolo — y ese saldo es lo que se le manda al cliente.
--
-- LA SOLUCIÓN
-- Una columna `vinculo` con el mismo uuid en las dos filas, que escribe el alta. Deja de
-- ser una deducción y pasa a ser un dato.
--
-- Es NULL en todo lo anterior a hoy y en todo lo que traiga la sincronización desde la
-- planilla, que no tiene cómo conocerlo. Para esas filas se sigue usando la búsqueda por
-- contenido de siempre, así que esto no rompe nada de lo que hoy funciona: solo agrega
-- certeza donde antes había que adivinar.
--
-- SE PUEDE CORRER DOS VECES SIN PROBLEMA.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.movimientos_caja add column if not exists vinculo uuid;
alter table public.diario            add column if not exists vinculo uuid;

comment on column public.movimientos_caja.vinculo is
  'uuid compartido con la fila gemela de `diario`. Lo escribe el alta de la app. NULL en '
  'lo cargado antes del 30/10/2026 y en lo que trae el sync desde la planilla: para esas '
  'filas la gemela se sigue ubicando por contenido (ver src/lib/diario.ts).';

comment on column public.diario.vinculo is
  'uuid compartido con la fila gemela de `movimientos_caja`. Ver el comentario de esa '
  'columna.';

-- Los dos índices son parciales: la enorme mayoría de las filas históricas tienen el
-- vínculo en NULL y no aportan nada al índice.
create index if not exists idx_mcaja_vinculo  on public.movimientos_caja(vinculo) where vinculo is not null;
create index if not exists idx_diario_vinculo on public.diario(vinculo)            where vinculo is not null;
