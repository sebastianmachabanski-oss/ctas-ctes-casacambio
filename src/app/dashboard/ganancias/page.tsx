import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GananciasView, { type DiaAgg, type ParAgg, type TTAgg } from '@/components/ganancias/GananciasView'
import { veGanancias } from '@/lib/roles'
import { esPeriodoValido, hoyArgentina, rangoDe } from '@/lib/periodos'
import { repartirTT, ttVacio } from '@/lib/ganancias-tt'

// Módulo de Ganancias — exclusivo del rol superadmin (ver src/lib/roles.ts).
// Réplica de la solapa COLO: el servidor agrega por día las operaciones COMPRA/VENTA/
// GASTOS del período usando las columnas CALCULADAS POR LA PLANILLA (exactitud
// garantizada); el cliente aplica la configuración (par, cta cte, valuación del stock,
// gastos) sin volver a consultar.


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
      // `cc_usdt` va en la lista desde el 20/11/2026. Faltaba, y como la pata se lee por
      // nombre de columna, su ausencia no daba error: devolvía `undefined`, que se
      // redondea a 0. Las compras y ventas de USDT por CUENTA CORRIENTE —que existen
      // desde el 25/8/2026— no contaban en Ganancias y no había nada en pantalla que lo
      // dijera. `cc_cheques` sí está bien ausente: esa columna no existe en la tabla.
      .select('fecha,operacion,pesos,cheques,dolares,euros,reales,usdt,libras,cc_pesos,cc_dolares,cc_euros,cc_reales,cc_usdt,cc_libras')
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

  // CHEQUES es el único que solo tiene columna de caja (no existe `cc_cheques`): su pata
  // CC queda siempre en 0, y no es una pérdida, porque en cuenta corriente el cheque se
  // registra igual en la columna CHEQUES con la contrapartida en CC PESOS, así que el
  // margen se mide lo mismo. USDT sí tiene `cc_usdt` desde el 25/8/2026.
  const PARES: ['usd' | 'eur' | 'brl' | 'usdt' | 'gbp' | 'chq', string, string][] = [
    ['usd', 'dolares', 'cc_dolares'], ['eur', 'euros', 'cc_euros'], ['brl', 'reales', 'cc_reales'],
    ['usdt', 'usdt', 'cc_usdt'], ['gbp', 'libras', 'cc_libras'], ['chq', 'cheques', 'cc_cheques'],
  ]
  const porDia = new Map<string, DiaAgg>()
  const diaDe = (f: string): DiaAgg => {
    let d = porDia.get(f)
    if (!d) { d = { f, usd: parVacio(), eur: parVacio(), brl: parVacio(), usdt: parVacio(), gbp: parVacio(), chq: parVacio(), g: 0, gcc: 0, tt: ttVacio() }; porDia.set(f, d) }
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
      .select('id,fecha,notas,operacion,pesos,dolares,euros,reales,usdt,libras,cheques')
      .eq('op', 'T')
      .lte('fecha', fin)
      .order('fecha', { ascending: true })
      .range(from, from + PAGE - 1)
    const rows = (pg ?? []) as any[]
    filasTT.push(...rows)
    if (rows.length < PAGE) break
  }

  // El reparto entre "resultado del período" y "posición abierta" vive en `src/lib/
  // ganancias-tt.ts` para poder validarlo sin montar un navegador ni tener la base
  // delante (mismo criterio que `posicion.ts`). Ver scripts/validar-ganancias-tt.mts.
  const { porFecha, abiertas, puntasAbiertas, paresNegativos } = repartirTT(filasTT, ini)
  porFecha.forEach((t, f) => { diaDe(f).tt = t })
  // Pares cuyo egreso superó al ingreso. Por definición del negocio no deberían existir
  // (ver ganancias-tt.ts); los que se realizaron DENTRO del período se avisan en pantalla
  // para corregir la carga, en vez de dejarlos diluidos adentro del total.
  const negativosDelPeriodo = paresNegativos.filter(p => p.fecha >= ini).length

  const dias = Array.from(porDia.values()).sort((a, b) => a.f.localeCompare(b.f))

  // Los "Reportes de caja" —saldos por cliente y evolución del saldo en dólares— se
  // sacaron de esta pantalla el 24/11/2026. Habían llegado desde Inicio el 10/9/2026 como
  // el detalle detrás del número, pero no lo eran: contestaban "cuánto me debe cada uno",
  // que es la pregunta de Cuentas Corrientes y Deudores, no la de Ganancias. Mezcladas acá
  // competían con el cálculo, que es lo único que esta pantalla tiene que explicar.
  //
  // El costo tampoco era menor: eran seis consultas, dos de ellas paginando más de mil
  // clientes, en cada carga de la pantalla.
  //
  // Lo que quedó en la base: la vista `caja_clientes` y las funciones
  // `caja_clientes_periodo` y `caja_saldo_diario` siguen existiendo, sin que nadie las
  // llame. No se borran acá a propósito: eso es una migración y una decisión aparte.
  // `saldos_cuenta_corriente` SÍ se sigue usando, en Deudores, Cuentas Corrientes y el
  // extracto — esa no se toca.

  return (
    <GananciasView
      dias={dias}
      abiertas={abiertas}
      puntasAbiertas={puntasAbiertas}
      paresNegativos={negativosDelPeriodo}
      periodo={esRango ? '' : p}
      fecha={fecha}
      rDesde={esRango ? searchParams.desde! : ''}
      rHasta={esRango ? searchParams.hasta! : ''}
      hoy={hoy}
    />
  )
}
