import { redirect } from 'next/navigation'

/**
 * El listado de transacciones se mudó a Inicio el 10/9/2026 y salió del menú.
 *
 * La ruta se conserva —redirigiendo— y no se borra: hay enlaces guardados, y sobre todo
 * la pantalla de edición cuelga de acá (`/dashboard/transacciones/[id]/editar`). Borrar
 * este archivo no rompería la edición, pero dejaría a quien llegue por un favorito viejo
 * frente a un 404 sin explicación.
 *
 * Los filtros que traiga la URL vieja se descartan: en Inicio viajan con el prefijo `t`
 * (tdesde, thasta, tcli…) y traducirlos acá sería mantener para siempre dos formatos.
 */
export default function TransaccionesPage() {
  redirect('/dashboard/inicio')
}
