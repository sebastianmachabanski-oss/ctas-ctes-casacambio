import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GananciasView, { type DiaAgg, type ParAgg, type TTAgg } from '@/components/ganancias/GananciasView'
import { veGanancias } from '@/lib/roles'
import { esPeriodoValido, hoyArgentina, rangoDe } from '@/lib/periodos'

// Módulo de Ganancias — exclusivo del rol superadmin (ver src/lib/roles.ts).
// Réplica de la solapa COLO: el servidor agrega por día las operaciones COMPRA/VENTA/
// GASTOS del período usando las columnas CALCULADAS POR LA PLANILLA (exactitud
// garantizada); el cliente aplica la configuración (par, cta cte, valuación del stock,
// gastos) sin volver a consultar.


const parVacio = (): ParAgg => ({ vC: 0, aC: 0, vV: 0, aV: 0, vCcc: 0, aCcc: 0, vVcc: 0, aVcc: 0 })
const ttVacio = (): TTAgg => ({ usd: 0, eur: 0, brl: 0, usdt: 0, chq: 0, pesos: 0 })

export default async function GananciasPage({
  searchParams,
}: {
  searchParams: { p?: string; fecha?: string; desde?: string; hasta?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const profile = profileData as { rol: string } | null

  if (!veGanancias(profile?.rol)) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <div className="card p-8 text-center space-y-3">
          <p className="text-4xl">🔒</p>
          <p className="font-semibold text-gray-900">Acceso restringido</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            El módulo de Ganancias es exclusivo del rol <b>Superadmin</b>, que tu usuario no tiene.
            Solo otro Superadmin puede asignarlo, desde la pantalla de <b>Usuarios</b>.
          </p>
        </div>
      </div>
    )
  }

  // Período: p=dia|semana|mes|anio con fecha cursor, o rango explícito desde/hasta.
  const hoy = hoyArgentina()
  // Por defecto abre en DÍA (26/8/2026): la pregunta de todos los días es cuánto se ganó
  // hoy, y con el mes por defecto había que cambiar el período en cada visita.
  const p = esPeriodoValido(searchParams.p) ? searchParams.p! : 'dia'
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? '') ? searchParams.fecha! : hoy
  const esRango = !!(searchParams.desde && searchParams.hasta)
  const [ini, fin] = esRango ? [searchParams.desde!, searchParams.hasta!] : rangoDe(p, fecha)

  // Trae las operaciones del período (solo columnas necesarias) y agrega por día.
  const PAGE = 1000
  const filas: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: pg } = await supabase.from('movimientos_caja')
      .select('fecha,operacion,pesos,cheques,dolares,euros,reales,usdt,cc_pesos,cc_dolares,cc_euros,cc_reales')
      .in('operacion', ['COMPRA', 'VENTA', 'GASTOS'])
      // Las transferencias se miden con su propia regla (más abajo), no con el calce de
      // compras y ventas. Si alguna vez una COMPRA se marcara con T, contarla en los dos
      // lados la duplicaría. Va con `or` y no con `neq` porque `op` es NULL en casi todo
      // el histórico y un `neq` dejaría afuera justamente esas filas.
      .or('op.is.null,op.neq.T')
      .gte('fecha', ini)
      .lte('fecha', fin)
      .order('fecha', { ascending: true })
      .range(from, from + PAGE - 1)
    const rows = (pg ?? []) as any[]
    filas.push(...rows)
    if (rows.length < PAGE) break
  }

  // USDT y CHEQUES solo tienen columna de caja (no hay cc_usdt ni cc_cheques): la pata CC
  // queda siempre en 0. En cuenta corriente el cheque igual se registra en la columna
  // CHEQUES y la contrapartida en CC PESOS, así que el margen se mide igual.
  const PARES: ['usd' | 'eur' | 'brl' | 'usdt' | 'chq', string, string][] = [
    ['usd', 'dolares', 'cc_dolares'], ['eur', 'euros', 'cc_euros'], ['brl', 'reales', 'cc_reales'],
    ['usdt', 'usdt', 'cc_usdt'], ['chq', 'cheques', 'cc_cheques'],
  ]
  const porDia = new Map<string, DiaAgg>()
  const diaDe = (f: string): DiaAgg => {
    let d = porDia.get(f)
    if (!d) { d = { f, usd: parVacio(), eur: parVacio(), brl: parVacio(), usdt: parVacio(), chq: parVacio(), g: 0, gcc: 0, tt: ttVacio() }; porDia.set(f, d) }
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

  // ── Transferencias (op = 'T') ────────────────────────────────────────────
  // La ganancia de una transferencia NO sale del calce de compras y ventas: no hay pata
  // en pesos y por lo tanto no hay tasa de la que sacar un spread. Es, simplemente, lo
  // que ENTRA menos lo que SALE de cada par de movimientos — criterio confirmado por el
  // cliente el 1/9/2026.
  //
  // Las columnas de caja ya traen el signo puesto (INGRESAN suma, EGRESAN resta), así que
  // sumarlas da la diferencia directamente. Se suma la pata de CAJA y no la de cuenta
  // corriente: en una fila de cta cte las dos son la misma plata con signo opuesto y
  // sumar ambas daría siempre cero.
  // Se traen TODAS las transferencias hasta el fin del período, no solo las del período:
  // para saber si un grupo tiene sus dos puntas hay que mirar su historia completa. Una
  // punta puede haberse cargado meses antes.
  const filasTT: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: pg } = await supabase.from('movimientos_caja')
      .select('fecha,notas,operacion,pesos,dolares,euros,reales,usdt,cheques')
      .eq('op', 'T')
      .lte('fecha', fin)
      .order('fecha', { ascending: true })
      .range(from, from + PAGE - 1)
    const rows = (pg ?? []) as any[]
    filasTT.push(...rows)
    if (rows.length < PAGE) break
  }

  // Un grupo (la NOTA, que nombra a los participantes) está CERRADO cuando tiene las dos
  // puntas: al menos un INGRESAN y al menos un EGRESAN.
  //
  // POR QUÉ NO SE IMPUTA TODO AL MOVIMIENTO QUE CIERRA
  // Los grupos se REPITEN: "JOACO SIZOKO" no es una transferencia, es una contraparte que
  // aparece decenas de veces. Llevar la ganancia de toda su historia a la fecha del último
  // movimiento inventaría un pico enorme en un día y vaciaría todos los meses anteriores.
  // Cada movimiento cuenta en SU fecha; lo que decide el grupo es si cuenta o no.
  const puntas = new Map<string, { ing: boolean; egr: boolean }>()
  const claveGrupo = (m: any) => (m.notas ?? '').trim() || '(sin nota)'
  for (const m of filasTT) {
    const k = claveGrupo(m)
    const p = puntas.get(k) ?? { ing: false, egr: false }
    const op = String(m.operacion ?? '').toUpperCase()
    if (op.includes('INGRES')) p.ing = true
    else if (op.includes('EGRES')) p.egr = true
    puntas.set(k, p)
  }
  const cerrado = (m: any) => {
    const p = puntas.get(claveGrupo(m))
    return !!p && p.ing && p.egr
  }

  // Los grupos con UNA SOLA punta no son ganancia: son plata que entró y todavía no se
  // entregó (o al revés). Es una POSICIÓN ABIERTA. Se muestra aparte y entra al resultado
  // recién cuando se carga la contraparte y el grupo se cierra.
  const abiertas = ttVacio()
  const gruposAbiertos = new Set<string>()

  for (const m of filasTT) {
    const suma = (t: TTAgg) => {
      t.usd   += Number(m.dolares) || 0
      t.eur   += Number(m.euros)   || 0
      t.brl   += Number(m.reales)  || 0
      t.usdt  += Number(m.usdt)    || 0
      t.chq   += Number(m.cheques) || 0
      t.pesos += Number(m.pesos)   || 0
    }
    if (cerrado(m)) {
      // Solo lo que ocurrió DENTRO del período suma al resultado del período.
      if (m.fecha >= ini) suma(diaDe(m.fecha).tt)
    } else {
      // La posición abierta es un saldo, no un flujo: se acumula toda su historia hasta
      // el cierre del período, sin importar cuándo entró.
      suma(abiertas)
      gruposAbiertos.add(claveGrupo(m))
    }
  }

  const dias = Array.from(porDia.values()).sort((a, b) => a.f.localeCompare(b.f))

  return (
    <GananciasView
      dias={dias}
      abiertas={abiertas}
      gruposAbiertos={gruposAbiertos.size}
      periodo={esRango ? '' : p}
      fecha={fecha}
      rDesde={esRango ? searchParams.desde! : ''}
      rHasta={esRango ? searchParams.hasta! : ''}
      hoy={hoy}
    />
  )
}
