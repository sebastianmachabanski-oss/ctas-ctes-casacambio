/**
 * La carga de datos de Ganancias, agregada por día.
 *
 * POR QUÉ ESTÁ ACÁ
 * La usan DOS pantallas —Ganancias y la composición del resultado— y es la parte más
 * fácil de romper sin que se note: una columna que falta en el `select` no da error,
 * devuelve `undefined`, se redondea a cero, y el número en pantalla sigue pareciendo
 * razonable. Ya pasó con `cc_usdt` el 20/11/2026: las operaciones de USDT por cuenta
 * corriente no contaban y nada lo decía.
 *
 * Duplicada en dos páginas, el próximo arreglo entraría en una sola.
 */
import { repartirTT, ttVacio } from '@/lib/ganancias-tt'
import type { DiaAgg, ParAgg, TTAgg } from '@/lib/ganancias-composicion'

const parVacio = (): ParAgg => ({ vC: 0, aC: 0, vV: 0, aV: 0, vCcc: 0, aCcc: 0, vVcc: 0, aVcc: 0 })

/**
 * CHEQUES es el único que solo tiene columna de caja (no existe `cc_cheques`): su pata CC
 * queda siempre en 0, y no es una pérdida, porque en cuenta corriente el cheque se
 * registra igual en la columna CHEQUES con la contrapartida en CC PESOS, así que el margen
 * se mide lo mismo. USDT sí tiene `cc_usdt` desde el 25/8/2026.
 */
const PARES: ['usd' | 'eur' | 'brl' | 'usdt' | 'gbp' | 'chq', string, string][] = [
  ['usd', 'dolares', 'cc_dolares'], ['eur', 'euros', 'cc_euros'], ['brl', 'reales', 'cc_reales'],
  ['usdt', 'usdt', 'cc_usdt'], ['gbp', 'libras', 'cc_libras'], ['chq', 'cheques', 'cc_cheques'],
]

/** Postgrest corta cualquier respuesta en 1.000 filas: todo lo que lea tiene que paginar. */
const PAGE = 1000

export type DatosGanancias = {
  dias: DiaAgg[]
  /** Posición de las patas de transferencia que todavía no encontraron pareja. */
  abiertas: TTAgg
  /** Cuántas patas de transferencia quedaron sin parear. */
  puntasAbiertas: number
  /** Transferencias realizadas EN EL PERÍODO cuyo egreso superó al ingreso (error de carga). */
  paresNegativos: number
}

/**
 * Trae las operaciones del período y las agrega por día.
 *
 * Usa las columnas CALCULADAS por el motor (las mismas que escribe el alta y que traía la
 * planilla), no recalcula nada: la exactitud contra el Sheet depende de eso.
 */
export async function cargarGanancias(
  supabase: any, ini: string, fin: string,
): Promise<DatosGanancias> {
  // ── Compras, ventas y gastos del período ─────────────────────────────────
  const filas: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: pg } = await supabase.from('movimientos_caja')
      // `cc_usdt` va en la lista desde el 20/11/2026. Faltaba, y como la pata se lee por
      // nombre de columna, su ausencia no daba error: devolvía `undefined`, que se
      // redondea a 0. Las compras y ventas de USDT por CUENTA CORRIENTE —que existen desde
      // el 25/8/2026— no contaban en Ganancias y no había nada en pantalla que lo dijera.
      .select('fecha,operacion,pesos,cheques,dolares,euros,reales,usdt,libras,cc_pesos,cc_dolares,cc_euros,cc_reales,cc_usdt,cc_libras')
      .in('operacion', ['COMPRA', 'VENTA', 'GASTOS'])
      // Las transferencias se miden con su propia regla (más abajo), no con el calce de
      // compras y ventas. Si alguna vez una COMPRA se marcara con T, contarla en los dos
      // lados la duplicaría. Va con `or` y no con `neq` porque `op` es NULL en casi todo el
      // histórico y un `neq` dejaría afuera justamente esas filas.
      .or('op.is.null,op.neq.T')
      .gte('fecha', ini)
      .lte('fecha', fin)
      .order('fecha', { ascending: true })
      .range(from, from + PAGE - 1)
    const rows = (pg ?? []) as any[]
    filas.push(...rows)
    if (rows.length < PAGE) break
  }

  const porDia = new Map<string, DiaAgg>()
  const diaDe = (f: string): DiaAgg => {
    let d = porDia.get(f)
    if (!d) {
      d = {
        f, usd: parVacio(), eur: parVacio(), brl: parVacio(),
        usdt: parVacio(), gbp: parVacio(), chq: parVacio(),
        g: 0, gcc: 0, tt: ttVacio(),
      }
      porDia.set(f, d)
    }
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
  // La ganancia de una transferencia NO sale del calce de compras y ventas: no hay pata en
  // pesos y por lo tanto no hay tasa de la que sacar un spread. Es, simplemente, lo que
  // ENTRA menos lo que SALE de cada par de movimientos — criterio confirmado por el cliente
  // el 1/9/2026.
  //
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

  // El reparto entre "resultado del período" y "posición abierta" vive en
  // `src/lib/ganancias-tt.ts` para poder validarlo sin montar un navegador ni tener la base
  // delante. Ver scripts/validar-ganancias-tt.mts.
  const { porFecha, abiertas, puntasAbiertas, paresNegativos } = repartirTT(filasTT, ini)
  porFecha.forEach((t, f) => { diaDe(f).tt = t })

  return {
    dias: Array.from(porDia.values()).sort((a, b) => a.f.localeCompare(b.f)),
    abiertas,
    puntasAbiertas,
    // Pares cuyo egreso superó al ingreso. Por definición del negocio no deberían existir
    // (ver ganancias-tt.ts); los que se realizaron DENTRO del período se avisan en pantalla
    // para corregir la carga, en vez de dejarlos diluidos adentro del total.
    paresNegativos: paresNegativos.filter((p: { fecha: string }) => p.fecha >= ini).length,
  }
}
