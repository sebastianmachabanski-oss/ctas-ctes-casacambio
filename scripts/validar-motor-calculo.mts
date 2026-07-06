// Valida el motor de cálculo contra casos reales/conocidos de la planilla.
// Uso: npx tsx scripts/validar-motor-calculo.mts
import { calcularMovimiento, calcularCalle, validarOperacion } from '../src/lib/motor-calculo/index'

let ok = 0
let fail = 0

function assertCasi(actual: number, esperado: number, msg: string) {
  const diff = Math.abs(actual - esperado)
  if (diff < 0.01) {
    ok++
    console.log(`✅ ${msg}`)
  } else {
    fail++
    console.error(`❌ ${msg} — esperado ${esperado}, dio ${actual}`)
  }
}

function assertIgual<T>(actual: T, esperado: T, msg: string) {
  if (actual === esperado) { ok++; console.log(`✅ ${msg}`) }
  else { fail++; console.error(`❌ ${msg} — esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(actual)}`) }
}

// ── Caso real: MACHA, COMPRA DOLARES con PESOS, monto 2000, cot 1490 ──
// Fila real observada en la planilla: PESOS=(2.980.000), DOLARES=2.000, CUENTA=CAMBIO DIVISAS
{
  const r = calcularMovimiento({
    tipo: 'CAJA', operacion: 'COMPRA', propio: 'DOLARES', externo: 'PESOS',
    monto: 2000, cotizacion: 1490, costoPorcentaje: null,
  })
  assertCasi(r.valores.PESOS, -2_980_000, 'MACHA: PESOS = -2.980.000')
  assertCasi(r.valores.DOLARES, 2000, 'MACHA: DOLARES = 2.000')
  assertCasi(r.valores.CHEQUES, 0, 'MACHA: CHEQUES = 0')
  assertIgual(r.cuenta, 'CAMBIO DIVISAS', 'MACHA: CUENTA = CAMBIO DIVISAS')
}

// ── VENTA es la operación inversa a COMPRA: mismos montos, signos invertidos ──
{
  const r = calcularMovimiento({
    tipo: 'CAJA', operacion: 'VENTA', propio: 'DOLARES', externo: 'PESOS',
    monto: 2000, cotizacion: 1490, costoPorcentaje: null,
  })
  assertCasi(r.valores.PESOS, 2_980_000, 'VENTA: PESOS = +2.980.000 (inverso a COMPRA)')
  assertCasi(r.valores.DOLARES, -2000, 'VENTA: DOLARES = -2.000 (inverso a COMPRA)')
}

// ── INGRESAN (CTA CTE): entra dinero de un cliente a su cuenta corriente. En la
// planilla real, CTA CTE siempre completa Externo con la misma moneda (ej. "CTA CTE
// INGRESAN DOLARES A CC DOLARES") — nunca queda vacío. ──
{
  const r = calcularMovimiento({
    tipo: 'CTA CTE', operacion: 'INGRESAN', propio: 'DOLARES', externo: 'DOLARES',
    monto: 500, cotizacion: null, costoPorcentaje: null,
  })
  assertCasi(r.valores.DOLARES, 500, 'CTA CTE INGRESAN: DOLARES = +500')
  assertCasi(r.valores['CC DOLARES'], -500, 'CTA CTE INGRESAN: CC DOLARES = -500 (contrapartida)')
  assertCasi(r.valores.PESOS, 0, 'CTA CTE INGRESAN: PESOS = 0 (no involucrado)')
  assertIgual(r.cuenta, 'CAJA', 'CTA CTE INGRESAN DOLARES: CUENTA = CAJA')
  assertIgual(r.codop, 'CTA CTEINGRESANDOLARESCC DOLARES', 'CTA CTE INGRESAN: CODOP correcto')
}

// ── EGRESAN (CTA CTE): opuesto a INGRESAN ──
{
  const r = calcularMovimiento({
    tipo: 'CTA CTE', operacion: 'EGRESAN', propio: 'PESOS', externo: 'PESOS',
    monto: 1000, cotizacion: null, costoPorcentaje: null,
  })
  assertCasi(r.valores.PESOS, -1000, 'CTA CTE EGRESAN: PESOS = -1.000')
  assertCasi(r.valores['CC PESOS'], 1000, 'CTA CTE EGRESAN: CC PESOS = +1.000 (contrapartida)')
}

// ── GASTOS: solo debe permitirse en PESOS (regla de negocio confirmada) ──
{
  const errorOk = validarOperacion({ operacion: 'GASTOS', propio: 'PESOS' })
  assertIgual(errorOk, null, 'GASTOS en PESOS: válido')

  const errorMal = validarOperacion({ operacion: 'GASTOS', propio: 'DOLARES' })
  assertIgual(errorMal !== null, true, 'GASTOS en DOLARES: debe rechazarse')

  const r = calcularMovimiento({
    tipo: 'CAJA', operacion: 'GASTOS', propio: 'PESOS', externo: '',
    monto: 5000, cotizacion: null, costoPorcentaje: null,
  })
  assertCasi(r.valores.PESOS, -5000, 'GASTOS PESOS: resta 5.000 de PESOS')
}

// ── Calle: solo suma columnas con DEBE cargado y valor positivo ──
{
  const m1 = calcularMovimiento({ tipo: 'CAJA', operacion: 'INGRESAN', propio: 'DOLARES', externo: '', monto: 100, cotizacion: null, costoPorcentaje: null })
  const m2 = calcularMovimiento({ tipo: 'CAJA', operacion: 'EGRESAN', propio: 'DOLARES', externo: '', monto: 40, cotizacion: null, costoPorcentaje: null })
  const m3 = calcularMovimiento({ tipo: 'CAJA', operacion: 'INGRESAN', propio: 'PESOS', externo: '', monto: 5000, cotizacion: null, costoPorcentaje: null })
  const calle = calcularCalle([
    { debe: 'ACA', valores: m1.valores },     // +100 USD con repartidor -> cuenta
    { debe: null,  valores: m2.valores },     // sin repartidor -> no cuenta
    { debe: '',    valores: m2.valores },     // -40 USD con repartidor pero negativo -> no cuenta (regla: solo positivos)
    { debe: 'TOM', valores: m3.valores },     // +5000 PESOS con repartidor -> cuenta
  ])
  assertCasi(calle.DOLARES, 100, 'Calle: DOLARES = 100 (solo la fila positiva con repartidor)')
  assertCasi(calle.PESOS, 5000, 'Calle: PESOS = 5.000')
}

console.log(`\n${ok} OK, ${fail} fallidas`)
process.exit(fail > 0 ? 1 : 0)
