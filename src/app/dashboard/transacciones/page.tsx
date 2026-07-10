import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TransaccionesView from '@/components/transacciones/TransaccionesView'

// Pantalla de staff: TODOS los movimientos de la caja (tabla movimientos_caja, el espejo
// completo de la solapa CAJA que llena el sync). El rango de fechas se pide al servidor;
// los filtros por columna (cliente / operación / monto) refinan en vivo lo cargado.

const TOPE = 1000 // filas máximas por rango (evita traer años enteros de una)

function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as { rol: string } | null)?.rol
  if (rol !== 'superusuario' && rol !== 'operador') redirect('/dashboard')

  const hoy = hoyArgentina()
  const desde = searchParams.desde || restarDias(hoy, 7)
  const hasta = searchParams.hasta || hoy

  const { data, count, error } = await supabase.from('movimientos_caja')
    .select('*', { count: 'exact' })
    .neq('operacion', 'OPERACION?')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('fila_sheet', { ascending: false })
    .range(0, TOPE - 1)

  const movimientos = (data ?? []) as any[]
  const total = count ?? movimientos.length

  return (
    <div className="p-4 md:p-6">
      {error ? (
        <div className="card p-6 text-center text-red-600 text-sm">
          No se pudieron cargar los movimientos: {error.message}
        </div>
      ) : (
        <TransaccionesView
          movimientos={movimientos}
          puedeEditar={rol === 'superusuario'}
          desde={desde}
          hasta={hasta}
          total={total}
        />
      )}
    </div>
  )
}
