-- La planilla calcula las columnas de moneda con COTEXT (=IF(COT=0;1;COT)), pero en
-- ~490 filas históricas el operador pisó esa fórmula a mano con la cotización efectiva
-- (con decimales) mientras en COT quedó un valor redondeado. Para que el motor de
-- cálculo reproduzca EXACTO a la planilla hay que conservar ambas: `cot` (lo que cargó
-- el operador) y `cot_efectiva` (COTEXT, la que usa el cálculo).
alter table public.movimientos_caja
  add column if not exists cot_efectiva numeric(18,6);

comment on column public.movimientos_caja.cot_efectiva is
  'Columna COTEXT de la planilla: la cotización que realmente usa el cálculo. '
  'Normalmente igual a cot (o 1 si cot está vacía), salvo en filas donde el operador '
  'la pisó a mano con la tasa efectiva con decimales.';
