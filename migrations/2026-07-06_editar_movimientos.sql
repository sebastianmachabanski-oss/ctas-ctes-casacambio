-- Edición de movimientos desde la app (pantalla Transacciones → Editar).
-- SOLO superusuario puede editar (el operador ve la pantalla pero no la acción).
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

-- Se elimina la versión anterior de la policy si existiera (permitía también operador).
drop policy if exists "Operadores y superusuarios editan movimientos de caja"
  on public.movimientos_caja;
drop policy if exists "Superusuarios editan movimientos de caja"
  on public.movimientos_caja;

create policy "Superusuarios editan movimientos de caja"
  on public.movimientos_caja for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );
