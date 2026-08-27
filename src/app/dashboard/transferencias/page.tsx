import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'
import TransferenciasView from '@/components/transferencias/TransferenciasView'

// Réplica de la tabla dinámica RESULTADO TT de la planilla (26/8/2026).
//
// La original agrupaba por NOTAS —donde el cliente escribe los participantes de la
// transferencia, ej. "BOH - GRA"— con un subtotal por grupo, y debajo el detalle de cada
// movimiento. El filtro que la definía era OP = "T".
//
// Ver docs/GUIA-MIGRACION-SHEETS.md (punto 4.5) para la definición original.

export const dynamic = 'force-dynamic'

export default async function TransferenciasPage({ searchParams }: {
  searchParams: { desde?: string; hasta?: string; cliente?: string; caja?: string; q?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const profile = profileData as { rol: string } | null
  if (!profile) redirect('/login')
  // Es un reporte de la operación: no lo ve el rol cliente.
  if (!esStaff(profile.rol)) redirect('/dashboard/cuenta-corriente')

  const { desde = '', hasta = '', cliente = '', caja = '', q = '' } = searchParams

  // Se traen TODAS las filas del filtro, no una página: el reporte agrupa y subtotaliza,
  // y un subtotal calculado sobre media página sería falso. PostgREST corta en 1.000 sin
  // un rango explícito, así que se pide de a tandas hasta que no venga más.
  const COLUMNAS = 'id,fecha,fila_sheet,cliente,cuenta,operacion,operacion_externa,propio,externo,monto,cot,costo_pct,notas,pesos,cheques,dolares,euros,reales'
  const TANDA = 1000
  const filas: any[] = []
  for (let desdeFila = 0; ; desdeFila += TANDA) {
    let qy = supabase.from('movimientos_caja').select(COLUMNAS)
      .eq('op', 'T')
      .order('fecha', { ascending: false })
      .order('fila_sheet', { ascending: false, nullsFirst: true })
      .range(desdeFila, desdeFila + TANDA - 1)
    if (desde) qy = qy.gte('fecha', desde)
    if (hasta) qy = qy.lte('fecha', hasta)
    if (cliente) qy = qy.eq('cliente', cliente)
    if (caja) qy = qy.eq('cuenta', caja)
    if (q) qy = qy.ilike('notas', `%${q}%`)
    const { data, error } = await qy
    if (error) break
    const tanda = (data ?? []) as any[]
    filas.push(...tanda)
    if (tanda.length < TANDA) break
  }

  // Opciones de los filtros: se sacan del universo de transferencias, no de todos los
  // movimientos — ofrecer un cliente que nunca hizo una TT solo da resultados vacíos.
  const { data: universo } = await supabase
    .from('movimientos_caja').select('cliente,cuenta').eq('op', 'T').limit(20000)
  const uni = (universo ?? []) as any[]
  const clientes = Array.from(new Set(uni.map(r => r.cliente).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
  const cajas = Array.from(new Set(uni.map(r => r.cuenta).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))

  return (
    <TransferenciasView
      filas={filas}
      clientes={clientes as string[]}
      cajas={cajas as string[]}
      filtros={{ desde, hasta, cliente, caja, q }}
      hayDatos={uni.length > 0}
    />
  )
}
