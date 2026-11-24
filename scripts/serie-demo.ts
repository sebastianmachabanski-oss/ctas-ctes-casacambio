/**
 * El resultado mes a mes de lo que un sembrador está por escribir.
 *
 * PARA QUÉ
 * Es el único control que importa antes de tocar la base: un generador puede producir
 * saldos correctos y, aun así, una serie que ningún negocio tendría —meses que varían
 * 400 %—, y eso se ve recién en el tablero, con los datos ya cargados y la demo rehecha.
 * Acá se ve antes, y sin conectarse a nada.
 *
 * Usa `serieMensual`, el MISMO cálculo que la pantalla. Reimplementarlo acá dejaría a la
 * vista previa y al tablero capaces de diferir, y no habría forma de saber cuál mirar.
 */
import { serieMensual, type MesSerie } from '../src/lib/ganancias-series'
import { ttVacio } from '../src/lib/ganancias-tt'
import type { DiaAgg, ParAgg } from '../src/lib/ganancias-composicion'

const parVacio = (): ParAgg => ({ vC: 0, aC: 0, vV: 0, aV: 0, vCcc: 0, aCcc: 0, vVcc: 0, aVcc: 0 })

export const diaVacio = (f: string): DiaAgg => ({
  f, usd: parVacio(), eur: parVacio(), brl: parVacio(),
  usdt: parVacio(), gbp: parVacio(), chq: parVacio(), g: 0, gcc: 0, tt: ttVacio(),
})

/** Columna de `movimientos_caja` → par de Ganancias. */
const PAR_DE: Record<string, 'usd' | 'eur' | 'brl' | 'usdt' | 'gbp'> = {
  dolares: 'usd', euros: 'eur', reales: 'brl', usdt: 'usdt', libras: 'gbp',
}

/** Cuántos meses hay entre dos fechas ISO, ambas incluidas. */
export function mesesEntre(a: string, b: string): number {
  const [a1, m1] = a.slice(0, 7).split('-').map(Number)
  const [a2, m2] = b.slice(0, 7).split('-').map(Number)
  return (a2 * 12 + m2) - (a1 * 12 + m1) + 1
}

/**
 * Agrega las filas por día, con las mismas reglas que `cargarGanancias`.
 *
 * `base` permite arrancar de días que ya están en la base: un día que ya vino de ahí no
 * se pisa, porque los tramos generados nunca se superponen con los existentes.
 */
export function agruparPorDia(movimientos: Record<string, any>[], base?: Map<string, DiaAgg>) {
  const porDia = base ?? new Map<string, DiaAgg>()
  for (const m of movimientos) {
    let d = porDia.get(m.fecha)
    if (!d) { d = diaVacio(m.fecha); porDia.set(m.fecha, d) }
    if (m.operacion === 'GASTOS') { d.g += Number(m.pesos) || 0; continue }
    // Las transferencias no tienen pata en pesos: su resultado es lo que entra menos lo
    // que sale, y la demo las arma siempre en dólares.
    if (m.op === 'T') { d.tt.usd += Number(m.dolares) || 0; continue }
    for (const [col, par] of Object.entries(PAR_DE)) {
      const vol = Number(m[col]) || 0, ars = Number(m.pesos) || 0
      const volcc = Number(m[`cc_${col}`]) || 0, arscc = Number(m.cc_pesos) || 0
      const agg = d[par]
      if (m.operacion === 'COMPRA' && vol > 0 && ars < 0) { agg.vC += vol; agg.aC += -ars }
      if (m.operacion === 'VENTA' && vol < 0 && ars > 0) { agg.vV += -vol; agg.aV += ars }
      if (volcc > 0 && arscc < 0) { agg.vCcc += volcc; agg.aCcc += -arscc }
      if (volcc < 0 && arscc > 0) { agg.vVcc += -volcc; agg.aVcc += arscc }
    }
  }
  return porDia
}

/** La serie mensual que saldría de estos días. */
export function serieDeDias(porDia: Map<string, DiaAgg>): MesSerie[] {
  const dias = Array.from(porDia.values()).sort((a, b) => a.f.localeCompare(b.f))
  if (dias.length === 0) return []
  const ultimo = dias[dias.length - 1].f
  return serieMensual(dias, ultimo, { cc: true, gastos: true, transferencias: true },
    mesesEntre(dias[0].f, ultimo))
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))

/**
 * El bloque de texto para la vista previa, con la variación de cada mes y un aviso si
 * alguna pasa del umbral.
 *
 * El umbral es 30 %: por debajo, un mes flojo y uno bueno es la vida de cualquier casa
 * de cambio; por arriba empieza a no parecer un negocio.
 */
export function informeDeSerie(serie: MesSerie[], umbral = 0.30): string {
  const lineas: string[] = []
  let peor = 0
  serie.forEach((m, i) => {
    const prev = i > 0 ? serie[i - 1].neto : null
    const v = prev && prev > 0 ? (m.neto - prev) / prev : null
    if (v !== null && Math.abs(v) > peor) peor = Math.abs(v)
    const marca = v !== null && Math.abs(v) > umbral ? '  ←' : ''
    lineas.push(`  ${m.mes}  ${fmt(m.neto).padStart(13)}   `
      + `${v === null ? '' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' %'}${marca}`)
  })
  // El último mes casi siempre está a medio transcurrir: compararlo contra uno entero da
  // una caída que no significa nada. La pantalla lo resuelve comparando tramo contra
  // tramo; acá alcanza con no asustar.
  const cuerpo = lineas.join('\n')
  const aviso = peor > umbral
    ? `\n  ⚠️  Hay meses que varían más del ${(umbral * 100).toFixed(0)} % (marcados con ←).`
      + '\n      El último mes está a medio transcurrir: esa caída es normal y la pantalla'
      + '\n      la corrige comparando tramo contra tramo. Las otras, no: probá --semilla=<n>.'
    : `\n  ✅ Ninguna variación pasa del ${(umbral * 100).toFixed(0)} %.`
  return cuerpo + aviso
}
