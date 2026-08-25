import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TransaccionesView from '@/components/transacciones/TransaccionesView'
import { esAdmin, esStaff } from '@/lib/roles'

// Pantalla de staff: TODOS los movimientos de la caja (tabla movimientos_caja, el espejo
// completo de la solapa CAJA que llena el sync). Por defecto muestra los 100 más recientes;
// se pagina de a 100 y se puede acotar por rango de fechas. Los filtros por columna
// (cliente / operación / monto) refinan en vivo la página cargada.

const POR_PAGINA = 100

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; pagina?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as { rol: string } | null)?.rol
  if (!esStaff(rol)) redirect('/dashboard')

  const desde = searchParams.desde || ''
  const hasta = searchParams.hasta || ''
  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1', 10) || 1)

  let query = supabase.from('movimientos_caja')
    .select('*', { count: 'exact' })
    .neq('operacion', 'OPERACION?')
    // MISMA SECUENCIA QUE LA PLANILLA, dada vuelta: lo más nuevo arriba (25/8/2026).
    //
    // Manda `fila_sheet` —la posición de la fila en la solapa CAJA— y NO la fecha. La
    // planilla es un registro corrido: el orden de carga es el de las filas, y ese es el
    // orden que el negocio reconoce. Ordenar por fecha se despegaba de la planilla en
    // cuanto alguien cargaba una fila con fecha anterior a la de arriba.
    //
    // Los nulos van PRIMERO a propósito: son las transacciones cargadas en la app que
    // todavía no tienen lugar en el Sheet, y tienen que verse arriba de todo. Entre
    // ellas desempata la fecha de carga.
    //
    // Ojo con no invertir estas dos: al sincronizar, las filas que nacieron en la app
    // recuperan su `creado_at` desde la auditoría. Si `creado_at` mandara, esas filas
    // saltarían arriba de toda la planilla aunque ya estén integradas en el Sheet.
    .order('fila_sheet', { ascending: false, nullsFirst: true })
    .order('creado_at', { ascending: false, nullsFirst: false })
  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)
  query = query.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)

  const { data, count, error } = await query
  const movimientos = (data ?? []) as any[]
  const total = count ?? movimientos.length
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <div className="p-4 md:p-6">
      {error ? (
        <div className="card p-6 text-center text-red-600 text-sm">
          No se pudieron cargar los movimientos: {error.message}
        </div>
      ) : (
        <TransaccionesView
          movimientos={movimientos}
          puedeEditar={esAdmin(rol)}
          desde={desde}
          hasta={hasta}
          total={total}
          pagina={pagina}
          totalPaginas={totalPaginas}
        />
      )}
    </div>
  )
}
