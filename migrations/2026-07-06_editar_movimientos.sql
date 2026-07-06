-- Edición de movimientos desde la app (pantalla Transacciones → Editar).
--
-- IMPORTANTE (decisión de negocio 5/7/2026): mientras la planilla siga siendo la fuente
-- de verdad, la edición NO se escribe en el Google Sheet, y el próximo sync (que borra y
-- reinserta) PISA los cambios hechos desde la app. La funcionalidad queda construida
-- para el momento en que la app pase a ser la única fuente de verdad.

alter table public.movimientos_caja
  add column if not exists editado_por text,
  add column if not exists editado_at  timestamptz;

comment on column public.movimientos_caja.editado_por is
  'Nombre del usuario de la app que editó la fila por última vez. Se pierde con el '
  'próximo sync mientras dure la convivencia con la planilla (comportamiento asumido).';

-- El staff puede actualizar movimientos desde la app (el select ya existía; inserts
-- siguen reservados al sync via service role).
create policy "Operadores y superusuarios editan movimientos de caja"
  on public.movimientos_caja for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  );
