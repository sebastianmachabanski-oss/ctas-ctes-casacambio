-- ═════════════════════════════════════════════════════════════════════════
-- Cheque incobrable (27/11/2026)
-- ═════════════════════════════════════════════════════════════════════════
-- Un cheque rechazado que nadie levanta no es lo mismo que uno devuelto: en el devuelto
-- el cliente resolvió y se llevó el papel; en el incobrable la casa se quedó con un
-- documento que no vale y perdió la plata que adelantó.
--
-- Mezclarlos en `devuelto` haría que la pérdida por incobrables deje de ser consultable, y
-- es justamente el número que justifica medir la concentración por librador: cuánto se
-- pierde y con quién.
--
-- SEGURA DE CORRER DOS VECES. Solo reemplaza dos CHECK por versiones con un valor más;
-- no toca ninguna fila y no borra nada.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.cheques
  drop constraint if exists cheques_estado_ok;

alter table public.cheques
  add constraint cheques_estado_ok check (estado in
    ('en_cartera', 'depositado', 'acreditado', 'rechazado', 'endosado', 'devuelto',
     'incobrable'));

alter table public.cheques_eventos
  drop constraint if exists cheques_eventos_estado_ok;

alter table public.cheques_eventos
  add constraint cheques_eventos_estado_ok check (estado in
    ('en_cartera', 'depositado', 'acreditado', 'rechazado', 'endosado', 'devuelto',
     'incobrable'));

comment on column public.cheques.estado is
  'El estado de HOY, para consultar rápido. Cómo llegó hasta acá está en '
  'cheques_eventos; los dos se escriben juntos. `incobrable` es el rechazado que '
  'nadie levantó: la casa se quedó el papel y perdió lo que adelantó.';
