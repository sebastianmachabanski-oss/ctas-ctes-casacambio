import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  // Traer todos los movimientos CTA CTE no anulados
  const { data, error } = await supabase
    .from('diario')
    .select('cuenta_cte, cc_dolares, cc_pesos')
    .eq('tipo', 'CTA CTE')
    .eq('anulado', false)
    .order('cuenta_cte')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupar por cuenta y tomar el ÚLTIMO valor de cc_dolares/cc_pesos (saldo corriente)
  // El saldo de cada cuenta está en la última fila de esa cuenta
  const porCuenta: Record<string, { dolares: number; pesos: number; filas: number }> = {}
  for (const row of (data || [])) {
    const nombre = row.cuenta_cte || '(sin nombre)'
    if (!porCuenta[nombre]) porCuenta[nombre] = { dolares: 0, pesos: 0, filas: 0 }
    porCuenta[nombre].dolares = row.cc_dolares ?? 0
    porCuenta[nombre].pesos = row.cc_pesos ?? 0
    porCuenta[nombre].filas++
  }

  const cuentas = Object.entries(porCuenta)
    .map(([nombre, v]) => ({ nombre, dolares: v.dolares, pesos: v.pesos, filas: v.filas }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  const totalDolares = cuentas.reduce((s, c) => s + c.dolares, 0)
  const totalPesos = cuentas.reduce((s, c) => s + c.pesos, 0)

  return NextResponse.json({ cuentas, totalDolares, totalPesos })
}
