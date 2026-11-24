/**
 * Validador de la composición de la ganancia (`src/lib/ganancias-composicion.ts`).
 *
 *   npx tsx scripts/validar-ganancias-composicion.mts
 *
 * No toca la base: arma escenarios a mano.
 *
 * QUÉ VERIFICA, y por qué cada cosa
 *   1. Que `calcPar()` siga dando exactamente lo mismo que antes de mudarse a `lib`.
 *      Es la fórmula validada contra la planilla; si el refactor la movió un peso, acá
 *      salta.
 *   2. Que `componer()` NO cuente dos veces los gastos ni las transferencias. Ese es el
 *      error que la pantalla vieja invitaba a cometer a mano, y el único motivo por el
 *      que existe esta función.
 *   3. Que el total cierre: subtotal de monedas + transferencias + gastos = neto. Las
 *      dos pantallas muestran las partes Y el total, igual que la posición de cuentas
 *      corrientes, así que tienen que dar lo mismo.
 */
import {
  calcPar, componer, cotizacionPar, SUPUESTOS_PAR,
  type Cfg, type DiaAgg, type ParAgg, type ParKey, type TTAgg,
} from '../src/lib/ganancias-composicion'

let ok = 0
const fallas: string[] = []

function asert(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok++; return }
  fallas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
}
function igual(nombre: string, obtenido: number, esperado: number, tol = 0.5) {
  asert(nombre, Math.abs(obtenido - esperado) <= tol,
    `esperado ${esperado}, obtenido ${obtenido}`)
}

const par0 = (): ParAgg => ({ vC: 0, aC: 0, vV: 0, aV: 0, vCcc: 0, aCcc: 0, vVcc: 0, aVcc: 0 })
const tt0 = (): TTAgg => ({ usd: 0, eur: 0, brl: 0, usdt: 0, gbp: 0, chq: 0, pesos: 0 })
const dia0 = (f: string): DiaAgg => ({
  f, usd: par0(), eur: par0(), brl: par0(), usdt: par0(), gbp: par0(), chq: par0(),
  g: 0, gcc: 0, tt: tt0(),
})

/** Un día con una compra y una venta de un par, a tasas dadas. */
function diaCon(f: string, par: ParKey, comprado: number, tC: number, vendido: number, tV: number): DiaAgg {
  const d = dia0(f)
  d[par] = { ...par0(), vC: comprado, aC: comprado * tC, vV: vendido, aV: vendido * tV }
  return d
}

const CFG_BASE: Omit<Cfg, 'par'> = {
  ops: new Set(['COMPRA', 'VENTA', 'GASTOS']), cc: true,
  resid: 'fijo', margen: 0.05, cierre: 1500, gastos: true, transferencias: true,
}
const cfgDe = (par: ParKey, extra: Partial<Cfg> = {}): Cfg => ({ ...CFG_BASE, par, ...extra })

// ── 1. calcPar: la fórmula de siempre ──────────────────────────────────────
// Compra 1.000 a 1.000 y vende 600 a 1.100. Calzado 600, spread 100 → 60.000.
// Stock 400 valuado al margen fijo de 0,05 → 20.
{
  const dias = [diaCon('2026-11-03', 'usd', 1000, 1000, 600, 1100)]
  const r = calcPar(dias, cfgDe('usd'), cotizacionPar(dias, 'usd'))
  igual('1a · calzado', r.calzado, 600)
  igual('1b · stock', r.stock, 400)
  igual('1c · spread por unidad', r.spread, 100)
  igual('1d · valuación del stock al margen fijo', r.gResid, 20)
  igual('1e · neto', r.neto, 60_020)
}

// La rama `mtm` tiene DOS lados, y el error de aplicar uno solo ya se cometió (3333fa1).
{
  // Comprado > vendido: el stock se valúa contra la tasa de COMPRA.
  const dias = [diaCon('2026-11-03', 'usd', 1000, 1000, 600, 1100)]
  const r = calcPar(dias, cfgDe('usd', { resid: 'mtm', cierre: 1200 }), 1000)
  igual('2a · mtm con stock comprado: 400 × (1200 − 1000)', r.gResid, 80_000)
}
{
  // Vendido > comprado: el stock se valúa contra la tasa de VENTA.
  const dias = [diaCon('2026-11-03', 'usd', 600, 1000, 1000, 1100)]
  const r = calcPar(dias, cfgDe('usd', { resid: 'mtm', cierre: 1050 }), 1000)
  igual('2b · mtm con stock vendido: 400 × (1100 − 1050)', r.gResid, 20_000)
}

// Sin una de las dos puntas no hay spread: una compra sola no genera ganancia.
{
  const dias = [diaCon('2026-11-03', 'usd', 1000, 1000, 0, 0)]
  const r = calcPar(dias, cfgDe('usd'), cotizacionPar(dias, 'usd'))
  igual('3a · sin ventas el spread es cero', r.spread, 0)
  igual('3b · todo queda en stock', r.stock, 1000)
  igual('3c · el neto es solo la valuación del stock', r.neto, 50)
}

// ── 4. componer: los gastos se cuentan UNA sola vez ────────────────────────
// Tres monedas con el mismo movimiento y un gasto de 90.000. Calculada moneda por moneda,
// cada una devuelve el gasto entero; sumarlas a mano lo contaría tres veces.
{
  const d = dia0('2026-11-03')
  for (const par of ['usd', 'eur', 'brl'] as ParKey[]) {
    d[par] = { ...par0(), vC: 1000, aC: 1000 * 1000, vV: 600, aV: 600 * 1100 }
  }
  d.g = -90_000
  const dias = [d]

  // Lo que daría sumar las monedas a mano, que es lo que la pantalla vieja invita a hacer.
  const aMano = (['usd', 'eur', 'brl'] as ParKey[])
    .reduce((a, par) => a + calcPar(dias, cfgDe(par), cotizacionPar(dias, par)).neto, 0)
  igual('4a · sumar a mano cuenta el gasto 3 veces', aMano, 3 * 60_020 - 3 * 90_000)

  const c = componer(dias, { cc: true, gastos: true, transferencias: true })
  igual('4b · el aporte de cada moneda no lleva gastos', c.subtotalMonedas, 3 * 60_020)
  igual('4c · el gasto entra una sola vez', c.gastos, -90_000)
  igual('4d · neto correcto', c.neto, 3 * 60_020 - 90_000)
  asert('4e · difiere de la suma a mano', Math.round(c.neto) !== Math.round(aMano))
}

// ── 5. componer: las transferencias en pesos se cuentan UNA sola vez ───────
// `tt.pesos` está repetido en el `tt` de todos los pares: es del día, no de la moneda.
{
  const d = diaCon('2026-11-03', 'usd', 1000, 1000, 600, 1100)
  d.eur = { ...par0(), vC: 500, aC: 500 * 1700, vV: 500, aV: 500 * 1750 }
  d.tt.pesos = 120_000
  const dias = [d]

  const c = componer(dias, { cc: true, gastos: true, transferencias: true })
  igual('5a · la transferencia en pesos entra una vez, no una por moneda', c.transferencias, 120_000)
  asert('5b · hay dos monedas con movimiento', c.monedas.length === 2,
    `monedas: ${c.monedas.map(m => m.par).join(',') || 'ninguna'}`)
}

// Una transferencia en moneda se pasa a pesos con la cotización implícita de ESA moneda.
{
  const d = diaCon('2026-11-03', 'usd', 1000, 1000, 1000, 1200)
  d.tt.usd = 100
  const dias = [d]
  // Cotización implícita: (1000×1000 + 1000×1200) / 2000 = 1100.
  const c = componer(dias, { cc: true, gastos: true, transferencias: true })
  igual('6a · cotización implícita del par', c.monedas[0].cot ?? 0, 1100)
  igual('6b · la transferencia se convierte con esa cotización', c.transferencias, 110_000)
}

// Sin operaciones del par no hay cotización: se avisa en vez de sumar cero en silencio.
{
  const d = dia0('2026-11-03')
  d.tt.gbp = 500
  const c = componer([d], { cc: true, gastos: true, transferencias: true })
  asert('7a · avisa que no pudo convertir', c.ttSinCotizacion.includes('gbp'),
    `ttSinCotizacion: ${c.ttSinCotizacion.join(',') || 'vacío'}`)
  igual('7b · no inventa un resultado', c.transferencias, 0)
}

// ── 8. El total cierre con sus partes ──────────────────────────────────────
// La pantalla muestra las partes Y el total: tienen que dar lo mismo, como en posicion.ts.
{
  const d = diaCon('2026-11-03', 'usd', 2000, 1480, 1500, 1520)
  d.eur = { ...par0(), vC: 300, aC: 300 * 1690, vV: 420, aV: 420 * 1730 }
  d.brl = { ...par0(), vCcc: 900, aCcc: 900 * 288, vVcc: 700, aVcc: 700 * 294 }
  d.g = -412_000
  d.gcc = -38_000
  d.tt.usd = 260
  d.tt.pesos = 75_000
  const dias = [d]

  const c = componer(dias, { cc: true, gastos: true, transferencias: true })
  const suma = c.subtotalMonedas + c.transferencias + c.gastos
  igual('8a · subtotal + transferencias + gastos = neto', suma, c.neto)
  igual('8b · el subtotal es la suma de los aportes',
    c.monedas.reduce((a, m) => a + m.aporta, 0), c.subtotalMonedas)
  for (const m of c.monedas) {
    igual(`8c · ${m.par}: aporta = spread + valuación`, m.porSpread + m.valuacionStock, m.aporta)
    igual(`8d · ${m.par}: operado = compras + ventas`, m.operado, m.calzado * 2 + m.stock)
  }
  asert('8e · los reales entran por cuenta corriente', c.monedas.some(m => m.par === 'brl'))
  igual('8f · los gastos suman caja y cuenta corriente', c.gastos, -450_000)
}

// Con `cc` apagado, las patas de cuenta corriente no entran por ningún lado.
{
  const d = dia0('2026-11-03')
  d.brl = { ...par0(), vCcc: 900, aCcc: 900 * 288, vVcc: 700, aVcc: 700 * 294 }
  d.gcc = -38_000
  const c = componer([d], { cc: false, gastos: true, transferencias: true })
  igual('9a · sin cta cte no aporta nada', c.subtotalMonedas, 0)
  igual('9b · sin cta cte el gasto de cta cte no entra', c.gastos, 0)
  asert('9c · los reales quedan como sin movimiento', c.sinMovimiento.includes('brl'))
}

// Los interruptores apagan de verdad.
{
  const d = diaCon('2026-11-03', 'usd', 1000, 1000, 600, 1100)
  d.g = -50_000
  d.tt.pesos = 30_000
  igual('10a · gastos apagados', componer([d], { cc: true, gastos: false, transferencias: true }).gastos, 0)
  igual('10b · transferencias apagadas', componer([d], { cc: true, gastos: true, transferencias: false }).transferencias, 0)
  igual('10c · con todo apagado queda solo el cambio de monedas',
    componer([d], { cc: true, gastos: false, transferencias: false }).neto, 60_020)
}

// ── 11. CHEQUES usa su propio supuesto ─────────────────────────────────────
// Si heredara el default de divisas, un millón en cartera mostraría ~1.499 millones de
// ganancia inexistente. Con `mtm` y cierre 1 el stock se valúa a valor nominal.
{
  asert('11a · el supuesto de cheques es mtm a valor nominal',
    SUPUESTOS_PAR.chq.resid === 'mtm' && SUPUESTOS_PAR.chq.cierre === 1)
  // Se descontaron 1.000.000 de cheques pagando 0,90 por peso; no se cobró nada todavía.
  const d = dia0('2026-11-03')
  d.chq = { ...par0(), vC: 1_000_000, aC: 900_000 }
  const c = componer([d], { cc: true, gastos: true, transferencias: true })
  const chq = c.monedas.find(m => m.par === 'chq')
  asert('11b · los cheques aparecen', !!chq)
  igual('11c · la ganancia del descuento cae en el período', chq?.aporta ?? 0, 100_000)
  asert('11d · no muestra una ganancia absurda', (chq?.aporta ?? 0) < 1_000_000)
}

// ── 12. El resultado en dólares sale del par dólares ───────────────────────
{
  const d = diaCon('2026-11-03', 'usd', 1000, 1000, 1000, 1200)
  d.eur = { ...par0(), vC: 100, aC: 100 * 1700, vV: 100, aV: 100 * 1800 }
  const c = componer([d], { cc: true, gastos: true, transferencias: true })
  igual('12a · cotización en dólares, no la del euro', c.cotUsd ?? 0, 1100)
  igual('12b · el neto en dólares es el neto sobre esa cotización', c.netoUsd ?? 0, c.neto / 1100)
}
{
  // Un período sin dólares no puede expresarse en dólares: devuelve null, no cero.
  const d = dia0('2026-11-03')
  d.eur = { ...par0(), vC: 100, aC: 100 * 1700, vV: 100, aV: 100 * 1800 }
  const c = componer([d], { cc: true, gastos: true, transferencias: true })
  asert('12c · sin dólares no inventa una cotización', c.cotUsd === null && c.netoUsd === null)
}

// ── 13. Un período vacío no rompe ──────────────────────────────────────────
{
  const c = componer([], { cc: true, gastos: true, transferencias: true })
  igual('13a · neto cero', c.neto, 0)
  asert('13b · ninguna moneda', c.monedas.length === 0)
  asert('13c · todas quedan sin movimiento', c.sinMovimiento.length === 6)
}

// ── 14. Las monedas vienen ordenadas por aporte ────────────────────────────
{
  const d = dia0('2026-11-03')
  d.eur = { ...par0(), vC: 100, aC: 100 * 1700, vV: 100, aV: 100 * 1900 }   // aporta 20.000
  d.usd = { ...par0(), vC: 1000, aC: 1000 * 1000, vV: 1000, aV: 1000 * 1100 } // aporta 100.000
  const c = componer([d], { cc: true, gastos: true, transferencias: true })
  asert('14a · primero la que más aporta', c.monedas[0].par === 'usd',
    `primero vino ${c.monedas[0]?.par}`)
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
