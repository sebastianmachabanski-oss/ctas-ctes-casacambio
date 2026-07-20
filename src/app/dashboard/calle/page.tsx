import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ListaCalle from '@/components/calle/ListaCalle'

// Dinero "en la calle": movimientos cuyo campo DEBE tiene un repartidor cargado — plata
// que todavía no se integró a la caja. Réplica del recuadro rojo "Calle" de la solapa
// CAJA. Regla de la planilla: al total de calle solo suman los valores POSITIVOS.

const COLUMNAS = ['pesos', 'cheques', 'dolares', 'euros', 'reales', 'usdt', 'banco', 'cc_pesos', 'cc_dolares', 'cc_euros', 'cc_reales'] as const

export default async function CallePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as { rol: string } | null)?.rol
  if (rol !== 'superusuario' && rol !== 'operador') redirect('/dashboard')

  const { data, error } = await supabase.from('movimientos_caja')
    .select('*')
    .not('debe', 'is', null)
    .neq('operacion', 'OPERACION?')
    .order('fecha', { ascending: false })
    .order('fila_sheet', { ascending: false })

  const movimientos = (data ?? []) as any[]

  // Total en calle por moneda (solo valores positivos — regla de la planilla).
  const totales: Record<string, number> = {}
  for (const col of COLUMNAS) {
    const s = movimientos.reduce((acc, m) => acc + Math.max(0, m[col] ?? 0), 0)
    if (s > 0) totales[col] = s
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {error ? (
        <div className="card p-6 text-center text-red-600 text-sm">
          No se pudo cargar el dinero en calle: {error.message}
        </div>
      ) : (
        <ListaCalle
          movimientos={movimientos}
          totales={totales}
          puedeIngresar={rol === 'superusuario'}
        />
      )}

      {/* Aviso al pie, como el mockup */}
      {rol === 'superusuario' && (
        <div className="banner-warn">
          ⚠️ Marcar un ingreso acá <b>no borra el DEBE en la planilla</b>: si allá sigue
          cargado, la próxima sincronización lo vuelve a mostrar. Mientras dure la
          convivencia, el borrado definitivo se hace en la planilla (como hasta ahora).
        </div>
      )}
    </div>
  )
}
