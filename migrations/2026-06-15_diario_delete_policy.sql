-- ============================================================
-- FIX: Falta policy de DELETE en la tabla diario
-- ============================================================
-- Problema: con RLS activado, si no existe una policy FOR DELETE,
-- todos los DELETE afectan 0 filas SIN dar error. Por eso el sync
-- nunca borraba los datos viejos y se acumulaban duplicados
-- (ej: el registro 9,27 generado por una version vieja del parser).
--
-- Ejecutar este bloque en el SQL Editor de Supabase UNA sola vez.
-- ============================================================

create policy "Superusuarios borran"
  on public.diario for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );

-- Despues de ejecutar esto, entra a la app y sincroniza una vez.
-- El sync ahora SI borra los datos viejos antes de reinsertar,
-- eliminando los duplicados.
