-- Escritura directa de movimientos desde la app (Nueva transacción → movimientos_caja).
-- Hasta ahora solo escribía el sync (service role); para que el movimiento se vea al
-- instante en Transacciones/Inicio/Ganancias, el staff necesita policy de INSERT.
-- Segura de correr más de una vez (drop if exists + create).
drop policy if exists "Operadores y superusuarios insertan movimientos de caja"
  on public.movimientos_caja;
create policy "Operadores y superusuarios insertan movimientos de caja"
  on public.movimientos_caja for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  );
