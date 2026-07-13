-- Borrado de movimientos desde la app (pantalla Transacciones → 🗑️).
-- SOLO superusuario (mismo criterio que editar). Igual que la edición, NO toca el
-- Google Sheet: si la fila también existe en la planilla, el próximo sync la vuelve
-- a traer (comportamiento asumido durante la convivencia).
-- Segura de correr más de una vez (drop if exists + create).
drop policy if exists "Superusuarios eliminan movimientos de caja"
  on public.movimientos_caja;
create policy "Superusuarios eliminan movimientos de caja"
  on public.movimientos_caja for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );
