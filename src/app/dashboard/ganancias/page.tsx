import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GananciasView, { type DiaAgg, type ParAgg } from '@/components/ganancias/GananciasView'

// Módulo de Ganancias — acceso por permiso INDIVIDUAL (profiles.ve_ganancias).
// Réplica de la solapa COLO: el servidor agrega por día las operaciones COMPRA/VENTA/
// GASTOS del período usando las columnas CALCULADAS POR LA PLANILLA (exactitud
// garantizada); el cliente aplica la configuración (par, cta cte, valuación del stock,
// gastos) sin volver a consultar.

function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// Rango de fechas del período, anclado en la fecha cursor.
function rangoDe(p: string, cursor: string): [string, string] {
  const d = new Date(cursor + 'T12:00:00Z')
  if (p === 'semana') {
    const dow = (d.getUTCDay() + 6) % 7 // lunes = 0
    const ini = addDays(cursor, -dow)
    return [ini, addDays(ini, 6)]
  }
  if (p === 'mes') {
    const ini = cursor.slice(0, 8) + '01'
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))
    return [ini, fin.toISOString().slice(0, 10)]
  }
  if (p === 'anio') return [cursor.slice(0, 4) + '-01-01', cursor.slice(0, 4) + '-12-31']
  return [cursor, cursor] // dia
}

const parVacio = (): ParAgg => ({ vC: 0, aC: 0, vV: 0, aV: 0, vCcc: 0, aCcc: 0, vVcc: 0, aVcc: 0 })

export default async function GananciasPage({
  searchParams,
}: {
  searchParams: { p?: string; fecha?: string; desde?: string; hasta?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol, ve_ganancias').eq('id', user.id).single()
  const profile = profileData as { rol: string; ve_ganancias?: boolean } | null

  if (!profile?.ve_ganancias) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <div className="card p-8 text-center space-y-3">
          <p className="text-4xl">🔒</p>
          <p className="font-semibold text-gray-900">Acceso restringido</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            El módulo de Ganancias usa un permiso individual (💰) que hoy tu usuario no tiene.
            Se habilita desde <b>Usuarios</b>, marcando el acceso a Ganancias en el perfil.
          </p>
        </div>
      </div>
    )
  }

  // Período: p=dia|semana|mes|anio con fecha cursor, o rango explícito desde/hasta.
  const hoy = hoyArgentina()
  // Sin período elegido, el default es el MES en curso.
  const p = ['dia', 'semana', 'mes', 'anio'].includes(searchParams.p ?? '') ? searchParams.p! : 'mes'
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? '') ? searchParams.fecha! : hoy
  const esRango = !!(searchParams.desde && searchParams.hasta)
  const [ini, fin] = esRango ? [searchParams.desde!, searchParams.hasta!] : rangoDe(p, fecha)

  // Trae las operaciones del período (solo columnas necesarias) y agrega por día.
  const PAGE = 1000
  const filas: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: pg } = await supabase.from('movimientos_caja')
      .select('fecha,operacion,pesos,dolares,euros,reales,cc_pesos,cc_dolares,cc_euros,cc_reales')
      .in('operacion', ['COMPRA', 'VENTA', 'GASTOS'])
      .gte('fecha', ini)
      .lte('fecha', fin)
      .order('fecha', { ascending: true })
      .range(from, from + PAGE - 1)
    const rows = (pg ?? []) as any[]
    filas.push(...rows)
    if (rows.length < PAGE) break
  }

  const PARES: ['usd' | 'eur' | 'brl', string, string][] = [
    ['usd', 'dolares', 'cc_dolares'], ['eur', 'euros', 'cc_euros'], ['brl', 'reales', 'cc_reales'],
  ]
  const porDia = new Map<string, DiaAgg>()
  const diaDe = (f: string): DiaAgg => {
    let d = porDia.get(f)
    if (!d) { d = { f, usd: parVacio(), eur: parVacio(), brl: parVacio(), g: 0, gcc: 0 }; porDia.set(f, d) }
    return d
  }
  for (const m of filas) {
    const dia = diaDe(m.fecha)
    if (m.operacion === 'GASTOS') {
      // GASTOS solo existe en PESOS (regla del dominio); las columnas ya traen el signo.
      dia.g += Number(m.pesos) || 0
      dia.gcc += Number(m.cc_pesos) || 0
      continue
    }
    for (const [par, col, colCC] of PARES) {
      // Pata por caja y pata por cta cte: en una fila solo una tiene valores.
      const patas: [number, number, boolean][] = [
        [Number(m[col]) || 0, Number(m.pesos) || 0, false],
        [Number(m[colCC]) || 0, Number(m.cc_pesos) || 0, true],
      ]
      for (const [vol, ars, esCC] of patas) {
        if (!vol || !ars) continue // no es un cambio de esta moneda contra pesos
        const agg = dia[par]
        if (m.operacion === 'COMPRA' && vol > 0 && ars < 0) {
          if (esCC) { agg.vCcc += vol; agg.aCcc += -ars } else { agg.vC += vol; agg.aC += -ars }
        } else if (m.operacion === 'VENTA' && vol < 0 && ars > 0) {
          if (esCC) { agg.vVcc += -vol; agg.aVcc += ars } else { agg.vV += -vol; agg.aV += ars }
        }
      }
    }
  }

  const dias = Array.from(porDia.values()).sort((a, b) => a.f.localeCompare(b.f))

  return (
    <GananciasView
      dias={dias}
      periodo={esRango ? '' : p}
      fecha={fecha}
      rDesde={esRango ? searchParams.desde! : ''}
      rHasta={esRango ? searchParams.hasta! : ''}
      hoy={hoy}
    />
  )
}
