// Motor de cálculo — replica la lógica de las columnas calculadas de la planilla
// (CUENTA, PESOS, CHEQUES, DOLARES, EUROS, REALES, BANCO, CC PESOS, CC DOLARES, CC EUROS,
// CC REALES) sin depender del Google Sheet. Ver docs/MOTOR-CALCULO.md para el detalle del
// relevamiento y la validación contra un caso real de la planilla.
//
// AÚN NO ESTÁ CONECTADO a ningún flujo de la app (Nueva Transacción, reportes, etc.) — es
// un módulo aislado, listo para usarse cuando se decida dar ese paso.
import { buscarSignoOperacion, buscarMultCotizacion } from './signos'
import { OPERACIONES_CUENTA } from './operaciones'

export const MONEDAS = ['PESOS', 'CHEQUES', 'DOLARES', 'EUROS', 'REALES'] as const
export type Moneda = typeof MONEDAS[number]

// Las 10 columnas de salida, en el mismo orden que la planilla.
export const COLUMNAS_SALIDA = [
  'PESOS', 'CHEQUES', 'DOLARES', 'EUROS', 'REALES', 'BANCO',
  'CC PESOS', 'CC DOLARES', 'CC EUROS', 'CC REALES',
] as const
export type ColumnaSalida = typeof COLUMNAS_SALIDA[number]

export interface DatosTransaccion {
  tipo: 'CTA CTE' | 'CAJA'
  operacion: string   // INGRESAN, EGRESAN, COMPRA, VENTA, GASTOS, SWITCH, ENTRA TT, SALE TT, ...
  propio: string       // moneda propia (PESOS, DOLARES, EUROS, REALES, CHEQUES, o "CC <moneda>" para switch/TT)
  externo: string      // moneda externa, o '' si la operación no cambia de moneda (INGRESAN/EGRESAN/GASTOS)
  monto: number
  cotizacion: number | null
  costoPorcentaje: number | null // casi siempre null/0 en la práctica — ver docs/MOTOR-CALCULO.md
}

export interface ResultadoCalculo {
  cuenta: string | null   // agrupación para reportes (CAJA / CAMBIO CHEQUES / CAMBIO DIVISAS / CTA CTE)
  valores: Record<ColumnaSalida, number>
  codop: string           // útil para debug/trazabilidad
}

export class MotorCalculoError extends Error {}

// Arma el mismo código de operación (CODOP) que usa la planilla, para buscar CUENTA.
function construirCodop(tipo: string, operacion: string, monedaPropiaFmt: string, monedaExternaFmt: string): string {
  if (tipo === 'CTA CTE') return `CTA CTE${operacion}${monedaPropiaFmt}${monedaExternaFmt}`
  return `${operacion}${monedaPropiaFmt}${monedaExternaFmt}`
}

// Formatea la moneda PROPIA (columna MPR de la planilla): en CTA CTE solo lleva el
// prefijo "CC " cuando la operación tiene doble movimiento de cuenta corriente (OPCC≠0,
// ej. SWITCH/ENTRA TT/SALE TT). Para INGRESAN/EGRESAN/COMPRA/VENTA/GASTOS (OPCC=0) no.
function formatearMonedaPropia(moneda: string, tipo: string, opcc: number): string {
  if (!moneda) return ''
  if (tipo === 'CTA CTE' && opcc !== 0 && !moneda.startsWith('CC ')) return `CC ${moneda}`
  return moneda
}

// Formatea la moneda EXTERNA (columna MEX de la planilla): en CTA CTE SIEMPRE lleva el
// prefijo "CC " si no está vacía, sin importar OPCC — a diferencia de la propia. Así lo
// hace la fórmula real (columna R de CAJA).
function formatearMonedaExterna(moneda: string, tipo: string): string {
  if (!moneda) return ''
  if (tipo === 'CTA CTE' && !moneda.startsWith('CC ')) return `CC ${moneda}`
  return moneda
}

// Regla de negocio confirmada en el relevamiento: GASTOS solo existe en PESOS en la
// planilla real (no hay fila GASTOSDOLARES/EUROS/REALES en OPERACIONES) — sin esta
// restricción, la columna CUENTA daría error en la planilla original.
export function validarOperacion(data: Pick<DatosTransaccion, 'operacion' | 'propio'>): string | null {
  if (data.operacion.trim().toUpperCase() === 'GASTOS' && data.propio.trim().toUpperCase() !== 'PESOS') {
    return 'GASTOS solo se puede registrar en PESOS'
  }
  return null
}

export function calcularMovimiento(data: DatosTransaccion): ResultadoCalculo {
  const operacion = data.operacion.trim().toUpperCase()
  const propioRaw = data.propio.trim().toUpperCase()
  const externoRaw = data.externo.trim().toUpperCase()

  const errorValidacion = validarOperacion({ operacion, propio: propioRaw })
  if (errorValidacion) throw new MotorCalculoError(errorValidacion)

  const signo = buscarSignoOperacion(operacion)
  if (!signo) throw new MotorCalculoError(`Operación desconocida: "${data.operacion}"`)

  const pr = signo.op         // signo de la moneda propia
  const ex = (pr * -1) as 1 | -1  // signo de la moneda externa (siempre opuesto)

  const monedaPropiaCol = formatearMonedaPropia(propioRaw, data.tipo, signo.opcc)
  const monedaExternaCol = formatearMonedaExterna(externoRaw, data.tipo)

  // El multiplicador de cotización SIEMPRE se busca con las monedas crudas (sin "CC "),
  // aunque la operación sea de cuenta corriente — así lo hace la fórmula real.
  const mult = externoRaw ? buscarMultCotizacion(propioRaw, externoRaw) : 'NADA'
  if (externoRaw && !mult) {
    throw new MotorCalculoError(`No hay cotización definida entre ${propioRaw} y ${externoRaw}`)
  }
  const cotBase = !data.cotizacion || data.cotizacion === 0 ? 1 : data.cotizacion
  const cotAjustada = mult === 'DIV' ? 1 / cotBase : cotBase

  // Factor de Costo %: en la práctica casi siempre 1 (costoPorcentaje suele ser null/0
  // en los datos reales — ver docs/MOTOR-CALCULO.md). Se calcula igual por completitud.
  const costoPct = data.costoPorcentaje ?? 0
  const factorCosto = 1 + costoPct * ex

  const valores = Object.fromEntries(COLUMNAS_SALIDA.map(col => {
    if (col === monedaPropiaCol) return [col, pr * data.monto]
    if (col === monedaExternaCol) return [col, ex * cotAjustada * factorCosto * data.monto]
    return [col, 0]
  })) as Record<ColumnaSalida, number>

  const codop = construirCodop(data.tipo, operacion, monedaPropiaCol, monedaExternaCol)
  const cuenta = OPERACIONES_CUENTA[codop] ?? null

  return { cuenta, valores, codop }
}

// "Dinero en la calle": suma de los valores positivos de una columna cuyas filas tienen
// el campo DEBE cargado (repartidor que todavía tiene el dinero en su poder). Distinto de
// la fórmula original de la planilla, que en las columnas CC * usaba por error la columna
// de moneda equivocada como criterio — acá se usa siempre la propia columna, consistente
// para las 10 columnas.
export function calcularCalle(
  movimientos: { debe: string | null; valores: Record<ColumnaSalida, number> }[]
): Record<ColumnaSalida, number> {
  const enCalle = Object.fromEntries(COLUMNAS_SALIDA.map(c => [c, 0])) as Record<ColumnaSalida, number>
  for (const mov of movimientos) {
    if (!mov.debe || !mov.debe.trim()) continue
    for (const col of COLUMNAS_SALIDA) {
      if (mov.valores[col] > 0) enCalle[col] += mov.valores[col]
    }
  }
  return enCalle
}
