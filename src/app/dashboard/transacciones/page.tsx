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
    .order('fecha', { ascending: false })
    // Desempate dentro del mismo día. Las transacciones cargadas en la app nacen con
    // `fila_sheet` en null —todavía no tienen lugar en la planilla—, así que entre varias
    // del mismo día el orden quedaba indefinido. `creado_at` las ordena de la más nueva a
    // la más vieja; las que vienen de la planilla no lo tienen y caen después, ordenadas
    // por su posición en el Sheet.
    .order('creado_at', { ascending: false, nullsFirst: false })
    .order('fila_sheet', { ascending: false })
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
