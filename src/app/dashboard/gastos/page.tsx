import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'
import GastosView from '@/components/gastos/GastosView'

// Listado de GASTOS (26/8/2026).
//
// GASTOS es una operación de caja como cualquier otra y ya aparece en Transacciones
// mezclada con el resto. Acá tiene pantalla propia porque la pregunta "cuánto gastamos
// este mes" no se contesta bien scrolleando un listado de miles de movimientos.
//
// Regla del dominio: GASTOS solo existe en PESOS.

export const dynamic = 'force-dynamic'

const POR_PAGINA = 100
const COLUMNAS = 'id,fecha,cliente,notas,monto,pesos,debe,creado_por,creado_at'

export default async function GastosPage({ searchParams }: {
  searchParams: { desde?: string; hasta?: string; q?: string; pagina?: string }
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
  const q = (searchParams.q || '').trim()
  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1', 10) || 1)

  // Un solo lugar arma el filtro: lo usan la página que se muestra y el recorrido que
  // suma los totales. Si se separaran, un cambio en uno dejaría al otro sumando otra cosa.
  const conFiltros = (columnas: string, opciones?: { count?: 'exact' }) => {
    let qy = supabase.from('movimientos_caja')
      .select(columnas, opciones as any)
      .eq('operacion', 'GASTOS')
    if (desde) qy = qy.gte('fecha', desde)
    if (hasta) qy = qy.lte('fecha', hasta)
    // El concepto del gasto va en CLIENTE (texto libre) y a veces se amplía en NOTAS.
    if (q) qy = qy.or(`cliente.ilike.%${q}%,notas.ilike.%${q}%`)
    return qy
  }

  const { data, count } = await conFiltros(COLUMNAS, { count: 'exact' })
    .order('fecha', { ascending: false })
    .order('creado_at', { ascending: false, nullsFirst: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)

  const filas = (data ?? []) as any[]
  const total = count ?? 0

  // El total es de TODO lo filtrado, no de la página: un total de los 100 que entraron en
  // pantalla no contesta "cuánto gastamos este mes". Se recorre de a 1.000 porque
  // PostgREST corta ahí sin un rango explícito.
  let totalPesos = 0
  let conDebe = 0
  const TANDA = 1000
  for (let desdeFila = 0; desdeFila < total; desdeFila += TANDA) {
    const { data: tanda } = await conFiltros('pesos,debe')
      .range(desdeFila, desdeFila + TANDA - 1)
    for (const r of (tanda ?? []) as any[]) {
      totalPesos += Number(r.pesos) || 0
      if (r.debe && String(r.debe).trim()) conDebe++
    }
    if (!tanda || tanda.length < TANDA) break
  }

  return (
    <GastosView
      filas={filas}
      total={total}
      totalPesos={totalPesos}
      conDebe={conDebe}
      pagina={pagina}
      totalPaginas={Math.max(1, Math.ceil(total / POR_PAGINA))}
      filtros={{ desde, hasta, q }}
    />
  )
}
