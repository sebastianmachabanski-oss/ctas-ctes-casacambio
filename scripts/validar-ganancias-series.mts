/**
 * Validador de la serie mensual del tablero (`src/lib/ganancias-series.ts`).
 *
 *   npx tsx scripts/validar-ganancias-series.mts
 *
 * No toca la base: arma escenarios a mano.
 *
 * QUÉ VERIFICA
 *   - La aritmética de meses, que es donde se esconden los errores: cruces de año,
 *     ventanas de trece meses, el mismo mes del año pasado.
 *   - Que partir los días por mes dé lo mismo que componer ese mes por separado. Si no,
 *     el tablero y la pantalla de composición mostrarían números distintos para el mismo
 *     mes, que es exactamente la clase de contradicción que nadie detecta a tiempo.
 *   - Que la variación no invente porcentajes sobre bases negativas o en cero.
 */
import {
  compararUltimo, inicioDeVentana, mesDe, mesesHasta, serieMensual, variacion,
  MESES_TABLERO,
} from '../src/lib/ganancias-series'
import { componer, type DiaAgg, type ParAgg, type TTAgg } from '../src/lib/ganancias-composicion'

let ok = 0
const fallas: string[] = []

function asert(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok++; return }
  fallas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
}
function igual(nombre: string, obtenido: number, esperado: number, tol = 0.5) {
  asert(nombre, Math.abs(obtenido - esperado) <= tol, `esperado ${esperado}, obtenido ${obtenido}`)
}
function igualTexto(nombre: string, obtenido: string, esperado: string) {
  asert(nombre, obtenido === esperado, `esperado "${esperado}", obtenido "${obtenido}"`)
}

const p0 = (): ParAgg => ({ vC: 0, aC: 0, vV: 0, aV: 0, vCcc: 0, aCcc: 0, vVcc: 0, aVcc: 0 })
const t0 = (): TTAgg => ({ usd: 0, eur: 0, brl: 0, usdt: 0, gbp: 0, chq: 0, pesos: 0 })
const dia0 = (f: string): DiaAgg => ({
  f, usd: p0(), eur: p0(), brl: p0(), usdt: p0(), gbp: p0(), chq: p0(), g: 0, gcc: 0, tt: t0(),
})
/** Un día con una compra y una venta de dólares. */
function diaUsd(f: string, vc: number, tc: number, vv: number, tv: number): DiaAgg {
  const d = dia0(f)
  d.usd = { ...p0(), vC: vc, aC: vc * tc, vV: vv, aV: vv * tv }
  return d
}
const OP = { cc: true, gastos: true, transferencias: true }

// ── 1. mesDe ──────────────────────────────────────────────────────────────
{
  igualTexto('1a · mesDe', mesDe('2026-11-24'), '2026-11')
  igualTexto('1b · mesDe en enero', mesDe('2026-01-01'), '2026-01')
}

// ── 2. mesesHasta: la aritmética, sobre todo el cruce de año ──────────────
{
  const m = mesesHasta('2026-11-24', 13)
  asert('2a · trece meses', m.length === 13, `vinieron ${m.length}`)
  igualTexto('2b · el último es el del cursor', m[12], '2026-11')
  igualTexto('2c · el primero es trece meses antes', m[0], '2025-11')
  asert('2d · no se repite ninguno', new Set(m).size === 13)
  // Consecutivos de verdad: cada uno es el mes siguiente del anterior.
  let bien = true
  for (let i = 1; i < m.length; i++) {
    const [a0, m0] = m[i - 1].split('-').map(Number)
    const [a1, m1] = m[i].split('-').map(Number)
    if (a1 * 12 + m1 !== a0 * 12 + m0 + 1) bien = false
  }
  asert('2e · son consecutivos', bien, m.join(' '))
}
{
  // Cruzando enero hacia atrás: el error clásico es que diciembre caiga en el año que no es.
  const m = mesesHasta('2026-02-15', 4)
  igualTexto('3a · feb 26', m[3], '2026-02')
  igualTexto('3b · ene 26', m[2], '2026-01')
  igualTexto('3c · dic 25, no dic 26', m[1], '2025-12')
  igualTexto('3d · nov 25', m[0], '2025-11')
}
{
  // El 31 tiene que comportarse igual que cualquier otro día: la ventana es de meses, no
  // de días. Con `setMonth` sobre un Date, el 31 de marzo menos un mes da el 3 de marzo.
  const a = mesesHasta('2026-03-31', 3)
  const b = mesesHasta('2026-03-01', 3)
  asert('4a · el día del mes no cambia la ventana', a.join() === b.join(), `${a.join()} vs ${b.join()}`)
  igualTexto('4b · incluye enero', a[0], '2026-01')
}
{
  igualTexto('5a · inicioDeVentana es el día 1 del mes más viejo',
    inicioDeVentana('2026-11-24', 13), '2025-11-01')
  igualTexto('5b · el default son 13 meses', inicioDeVentana('2026-11-24'),
    inicioDeVentana('2026-11-24', MESES_TABLERO))
}

// ── 6. serieMensual: partir por mes no cambia los números ─────────────────
// Cada mes de la serie tiene que dar lo mismo que componer ese mes por separado. Si no,
// el tablero contradice a la pantalla de composición para el mismo mes.
{
  const dias = [
    diaUsd('2026-09-10', 1000, 1000, 800, 1100),
    diaUsd('2026-10-05', 2000, 1020, 1500, 1120),
    diaUsd('2026-10-20', 900, 1030, 1200, 1130),
    diaUsd('2026-11-03', 1500, 1040, 1400, 1140),
  ]
  dias[2].g = -200_000
  const serie = serieMensual(dias, '2026-11-15', OP, 3)

  asert('6a · tres meses', serie.length === 3)
  igualTexto('6b · el orden es del más viejo al más nuevo',
    serie.map(s => s.mes).join(' '), '2026-09 2026-10 2026-11')

  for (const s of serie) {
    const delMes = dias.filter(d => mesDe(d.f) === s.mes)
    const esperado = componer(delMes, OP)
    igual(`6c · ${s.mes} coincide con componer() de ese mes`, s.neto, esperado.neto)
  }

  // Un gasto de octubre no puede aparecer en septiembre ni en noviembre.
  igual('6d · el gasto cae solo en octubre', serie[1].c.gastos, -200_000)
  igual('6e · septiembre sin gastos', serie[0].c.gastos, 0)
  igual('6f · noviembre sin gastos', serie[2].c.gastos, 0)
}

// Un mes sin movimiento se marca vacío, no en cero: no es lo mismo "no operó" que
// "operó y empató".
{
  const dias = [diaUsd('2026-11-03', 1000, 1000, 800, 1100)]
  const serie = serieMensual(dias, '2026-11-15', OP, 3)
  asert('7a · los meses sin datos se marcan', !serie[0].conDatos && !serie[1].conDatos)
  asert('7b · el mes con datos se marca', serie[2].conDatos)
  igual('7c · un mes vacío da cero', serie[0].neto, 0)
}

// Los días fuera de la ventana se ignoran en vez de romper.
{
  const dias = [
    diaUsd('2020-01-05', 5000, 900, 5000, 1000),   // muy viejo, fuera de la ventana
    diaUsd('2026-11-03', 1000, 1000, 800, 1100),
  ]
  const serie = serieMensual(dias, '2026-11-15', OP, 3)
  igual('8a · lo viejo no se cuela en ningún mes',
    serie.reduce((a, s) => a + s.neto, 0), componer([dias[1]], OP).neto)
}

// ── 9. Las etiquetas del eje ──────────────────────────────────────────────
{
  const serie = serieMensual([], '2026-11-24', OP, 13)
  igualTexto('9a · el primero lleva el año', serie[0].etiqueta, 'nov 25')
  igualTexto('9b · enero lleva el año', serie[2].etiqueta, 'ene 26')
  igualTexto('9c · el resto no', serie[3].etiqueta, 'feb')
  igualTexto('9d · el último tampoco, si no es enero', serie[12].etiqueta, 'nov')
}

// ── 10. spread y tenencia suman el resultado del cambio de monedas ────────
{
  const d = diaUsd('2026-11-03', 1000, 1000, 600, 1100)
  d.eur = { ...p0(), vC: 200, aC: 200 * 1700, vV: 150, aV: 150 * 1760 }
  const serie = serieMensual([d], '2026-11-15', OP, 1)
  const s = serie[0]
  igual('10a · spread + tenencia = subtotal por cambio de monedas',
    s.porSpread + s.porTenencia, s.c.subtotalMonedas)
}

// ── 11. variacion: no inventa porcentajes ─────────────────────────────────
{
  igual('11a · variación normal', variacion(110, 100) ?? -99, 0.1)
  asert('11b · base cero no da porcentaje', variacion(100, 0) === null)
  asert('11c · base negativa tampoco', variacion(50, -100) === null)
  igual('11d · una caída da negativo', variacion(80, 100) ?? 99, -0.2)
}

// ── 12. compararUltimo ────────────────────────────────────────────────────
{
  // Trece meses con noviembre 25 y octubre 26 cargados, para comparar contra los dos.
  const dias = [
    diaUsd('2025-11-10', 1000, 1000, 1000, 1100),   // 100.000
    diaUsd('2026-10-10', 1000, 1000, 1000, 1200),   // 200.000
    diaUsd('2026-11-10', 1000, 1000, 1000, 1250),   // 250.000
  ]
  const serie = serieMensual(dias, '2026-11-24', OP, 13)
  const cmp = compararUltimo(serie)
  asert('12a · devuelve algo', cmp !== null)
  igualTexto('12b · el actual es noviembre 26', cmp!.actual.mes, '2026-11')
  igualTexto('12c · el anterior es octubre 26', cmp!.anterior?.mes ?? '', '2026-10')
  igualTexto('12d · el del año pasado es noviembre 25', cmp!.anioPasado?.mes ?? '', '2025-11')
  igual('12e · vs mes anterior: 250.000 sobre 200.000', cmp!.vsAnterior ?? -9, 0.25, 0.001)
  igual('12f · vs año pasado: 250.000 sobre 100.000', cmp!.vsAnioPasado ?? -9, 1.5, 0.001)
}
{
  // Sin mes anterior cargado no se compara: no se usa cero como base.
  const serie = serieMensual([diaUsd('2026-11-10', 1000, 1000, 1000, 1250)], '2026-11-24', OP, 13)
  const cmp = compararUltimo(serie)
  asert('13a · sin mes anterior con datos no hay comparación', cmp!.anterior === null && cmp!.vsAnterior === null)
  asert('13b · sin año pasado tampoco', cmp!.anioPasado === null && cmp!.vsAnioPasado === null)
}
{
  asert('14a · una serie vacía devuelve null', compararUltimo([]) === null)
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
