-- LA FOTO DEL CHEQUE (23/11/2026).
--
-- ── QUÉ RESUELVE Y QUÉ NO ─────────────────────────────────────────────────
-- La imagen NO es el instrumento: el instrumento es el papel, y una vez depositado lo
-- tiene el banco. Sirve en dos momentos, los dos breves: verificar un dato tipeado antes
-- de depositar, y la gestión de cobro si el cheque rebota.
--
-- Lo que la justifica a largo plazo es otra cosa: es el INSUMO DEL OCR. Sin imagen
-- guardada no hay con qué reprocesar ni con qué mejorar la lectura más adelante.
--
-- ── DATOS DE TERCEROS ─────────────────────────────────────────────────────
-- Un cheque muestra CUIT, número de cuenta y FIRMA DEL LIBRADOR, que no es el cliente de
-- la casa de cambio: es alguien que nunca aceptó nada. Por eso el bucket es PRIVADO y no
-- público: a las imágenes se llega con un enlace firmado y de vida corta, nunca con una
-- URL adivinable.
--
-- Queda pendiente definir CUÁNTO TIEMPO se conservan. No se resuelve acá porque con cero
-- cheques no hay nada que conservar, pero se decide antes de que sean miles de imágenes.
--
-- ── DÓNDE SE GUARDA LA REFERENCIA ─────────────────────────────────────────
-- En `cheques.archivo_url` va la RUTA dentro del bucket (p. ej. `2026/11/<uuid>.jpg`), no
-- una URL. Una URL firmada vence; guardarla sería guardar algo que dentro de una hora no
-- sirve. La pantalla pide la firma cada vez que muestra la imagen.
--
-- Es SEGURO correr esta migración dos veces.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. El bucket
-- ═════════════════════════════════════════════════════════════════════════
-- `public = false`: sin esto cualquiera con la URL ve la firma del librador.
-- 10 MB alcanza de sobra para una foto de teléfono; el tope existe para que un video
-- cargado por error no se suba entero antes de fallar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cheques', 'cheques', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    -- Los teléfonos de Apple sacan HEIC por defecto. Sin esto, la mitad de las fotos
    -- tomadas desde el mostrador se rechazan sin que se entienda por qué.
    'image/heic', 'image/heif',
    -- Un echeq no es una foto: es un archivo. Suele venir en PDF.
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Quién puede qué
-- ═════════════════════════════════════════════════════════════════════════
-- Los predicados de rol son los de `docs/ROLES.md`. Nunca comparar roles a mano.
-- Un cliente NO ve estas imágenes: son documentos de terceros, no de su cuenta.

drop policy if exists "Staff ve imágenes de cheques" on storage.objects;
create policy "Staff ve imágenes de cheques"
  on storage.objects for select
  using (bucket_id = 'cheques' and public.es_staff());

drop policy if exists "Staff sube imágenes de cheques" on storage.objects;
create policy "Staff sube imágenes de cheques"
  on storage.objects for insert
  with check (bucket_id = 'cheques' and public.es_staff());

-- Reemplazar una imagen es excepcional —la foto es de un momento— y borrarla, más.
drop policy if exists "Admin reemplaza imágenes de cheques" on storage.objects;
create policy "Admin reemplaza imágenes de cheques"
  on storage.objects for update
  using (bucket_id = 'cheques' and public.es_admin());

drop policy if exists "Admin borra imágenes de cheques" on storage.objects;
create policy "Admin borra imágenes de cheques"
  on storage.objects for delete
  using (bucket_id = 'cheques' and public.es_admin());

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Qué guarda la columna
-- ═════════════════════════════════════════════════════════════════════════
comment on column public.cheques.archivo_url is
  'RUTA dentro del bucket privado `cheques` (ej. 2026/11/<uuid>.jpg), NO una URL: una '
  'URL firmada vence y guardarla sería guardar algo que mañana no sirve. La pantalla '
  'pide la firma cada vez que muestra la imagen.';

-- ═════════════════════════════════════════════════════════════════════════
-- Verificación
-- ═════════════════════════════════════════════════════════════════════════
-- El bucket tiene que figurar como privado:
--   select id, public, file_size_limit from storage.buckets where id = 'cheques';
--
-- Y tiene que haber cuatro policies suyas:
--   select policyname, cmd from pg_policies
--    where tablename = 'objects' and policyname ilike '%cheques%';
