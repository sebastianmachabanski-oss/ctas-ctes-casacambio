import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TableroInicio from '@/components/inicio/TableroInicio'

// Columnas de "calle" (dinero con repartidor asignado). Regla de la planilla: al total
// solo suman los valores POSITIVOS.
const COLS_CALLE = ['pesos', 'cheques', 'dolares', 'euros', 'reales'] as const

async function traerTodo<T>(fetchPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const PAGE = 1000
  const acc: T[] = []
  for (let from = 0; ; from += PAGE) {
    const page = await fetchPage(from, from + PAGE - 1)
    if (!page.length) break
    acc.push(...page)
    if (page.length < PAGE) break
  }
  return acc
}

// Período elegido en el tablero → rango de fechas (hoy en huso de Argentina).
function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
// Períodos de CALENDARIO (pedido 17/7/2026): Día = hoy, Semana = desde el lunes,
// Mes = desde el 1 del mes en curso, Año = desde el 1/1. Así "Mes" coincide con
// filtrar los días del mes actual en la planilla (antes eran ventanas móviles de
// 30/365 días corridos y los totales no cerraban contra el Sheet).
const PERIODOS = ['dia', 'semana', 'mes', 'anio'] as const
function inicioPeriodo(p: string, hoy: string): string {
  if (p === 'semana') {
    const d = new Date(hoy + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) // retrocede al lunes
    return d.toISOString().slice(0, 10)
  }
  if (p === 'mes') return hoy.slice(0, 8) + '01'
  if (p === 'anio') return hoy.slice(0, 5) + '01-01'
  return hoy // dia
}

export default async function InicioPage({
  searchParams,
}: {
  searchParams: { p?: string; desde?: string; hasta?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileData } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  const profile = profileData as { rol: string; nombre: string } | null
  if (!profile) redirect('/login')
  if (profile.rol !== 'superusuario' && profile.rol !== 'operador') redirect('/dashboard/cuenta-corriente')

  // Rango del período: sin parámetros = TODO el historial (situación actual de caja).
  // Con p=dia|semana|mes|anio o desde/hasta, TODOS los reportes se consultan con ese rango.
  const p = searchParams.p ?? ''
  let desde: string | null = null
  let hasta: string | null = null
  if (searchParams.desde || searchParams.hasta) {
    desde = searchParams.desde || null
    hasta = searchParams.hasta || null
  } else if ((PERIODOS as readonly string[]).includes(p)) {
    hasta = hoyArgentina()
    desde = inicioPeriodo(p, hasta)
  }

  // 1) Totales de caja del período (saldo/movimiento por moneda = suma de cada columna).
  const { data: totalesData } = await (supabase as any).rpc('caja_totales', { p_desde: desde, p_hasta: hasta })
  const t = (totalesData ?? {}) as Record<string, number>

  // 2) Total en calle por moneda (solo positivos).
  const calleRows = await traerTodo<Record<string, number>>(async (from, to) => {
    const { data } = await supabase.from('movimientos_caja')
      .select('pesos,cheques,dolares,euros,reales')
      .not('debe', 'is', null)
      .neq('operacion', 'OPERACION?')
      .range(from, to)
    return (data ?? []) as any[]
  })
  const calle: Record<string, number> = {}
  for (const col of COLS_CALLE) calle[col] = calleRows.reduce((s, m) => s + Math.max(0, m[col] ?? 0), 0)

  // 3) Clientes — pestaña Caja (totales por cliente EN EL PERÍODO) y pestaña Cta cte.
  // OJO: Postgrest corta CUALQUIER respuesta (también las RPC) en 1.000 filas y hay más
  // de 1.000 clientes — hay que paginar con order + range, si no la lista llega
  // incompleta y clientes enteros "desaparecen" del tablero.
  let clientesCaja: any[] = []
  let rpcOk = true
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: pg, error } = await (supabase as any)
      .rpc('caja_clientes_periodo', { p_desde: desde, p_hasta: hasta })
      .order('cliente')
      .range(from, from + PAGE - 1)
    if (error) { rpcOk = false; break }
    const rows = (pg ?? []) as any[]
    clientesCaja.push(...rows)
    if (rows.length < PAGE) break
  }
  if (!rpcOk) {
    // Si la migración de la RPC aún no corrió, cae a la vista sin filtro de período.
    clientesCaja = await traerTodo<any>(async (from, to) => {
      const { data } = await supabase.from('caja_clientes')
        .select('cliente,pesos,dolares,euros,reales')
        .order('cliente')
        .range(from, to)
      return (data ?? []) as any[]
    })
  }
  const clientesCC = await traerTodo<any>(async (from, to) => {
    const { data } = await supabase.from('saldos_cuenta_corriente')
      .select('cuenta_cte,saldo_pesos,saldo_dolares,saldo_euros,saldo_reales')
      .order('cuenta_cte')
      .range(from, to)
    return (data ?? []) as any[]
  })

  // 4) Serie diaria del saldo en dólares (para el gráfico de línea y los deltas mensuales).
  const { data: serieData } = await (supabase as any).rpc('caja_saldo_diario', { p_moneda: 'dolares' })
  const serie = ((serieData ?? []) as any[]).map(r => ({ fecha: r.fecha as string, saldo: Number(r.saldo) }))

  const kpis = [
    { cur: 'Pesos',   col: '#2563eb', caja: t.pesos ?? 0,   calle: calle.pesos,   cc: t.cc_pesos ?? 0 },
    { cur: 'Dólares', col: '#16a34a', caja: t.dolares ?? 0, calle: calle.dolares, cc: t.cc_dolares ?? 0 },
    { cur: 'Euros',   col: '#7c3aed', caja: t.euros ?? 0,   calle: calle.euros,   cc: t.cc_euros ?? 0 },
    { cur: 'Reales',  col: '#eab308', caja: t.reales ?? 0,  calle: calle.reales,  cc: t.cc_reales ?? 0 },
    { cur: 'Cheques', col: '#0d9488', caja: t.cheques ?? 0, calle: calle.cheques, cc: null },
    { cur: 'Banco',   col: '#8a94a6', caja: t.banco ?? 0,   calle: null,          cc: null },
  ]

  const clientesCajaN = clientesCaja.map(c => ({
    nombre: c.cliente, pesos: Number(c.pesos) || 0, dolares: Number(c.dolares) || 0,
    euros: Number(c.euros) || 0, reales: Number(c.reales) || 0,
  }))
  const clientesCCN = clientesCC.map(c => ({
    nombre: c.cuenta_cte, pesos: Number(c.saldo_pesos) || 0, dolares: Number(c.saldo_dolares) || 0,
    euros: Number(c.saldo_euros) || 0, reales: Number(c.saldo_reales) || 0,
  }))

  return (
    <TableroInicio
      kpis={kpis}
      clientesCaja={clientesCajaN}
      clientesCC={clientesCCN}
      serieUSD={serie}
      periodo={(PERIODOS as readonly string[]).includes(p) ? p : ''}
      rDesde={searchParams.desde ?? ''}
      rHasta={searchParams.hasta ?? ''}
    />
  )
}
