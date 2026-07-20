// Datos de las solapas SIGNOS y OPERACIONES del Google Sheet, relevados y validados
// contra la fórmula real de la planilla (ver docs/MOTOR-CALCULO.md).
//
// Tabla 1: signo de cada Operación (columnas A-E de SIGNOS).
export interface SignoOperacion {
  operacion: string   // OPERACION PROPIA (lo que carga el usuario en "Operación")
  op: 1 | -1          // signo de la moneda Propia
  opcc: 1 | -1 | 0     // signo especial para operaciones CTA CTE con doble movimiento CC (SWITCH/TT)
  operacionExterna: string
  costo: 'POR' | 'NADA' // si el Costo % de la transacción llega a afectar el cálculo
}

export const SIGNOS_OPERACION: SignoOperacion[] = [
  { operacion: 'COMPRA',         op:  1, opcc: 0,  operacionExterna: 'VENTA',        costo: 'POR' },
  { operacion: 'VENTA',          op: -1, opcc: 0,  operacionExterna: 'COMPRA',       costo: 'POR' },
  { operacion: 'SALDO INICIAL',  op:  1, opcc: 0,  operacionExterna: 'SALDO INICIAL',costo: 'POR' },
  { operacion: 'SOBRANTE',       op:  1, opcc: 0,  operacionExterna: 'FALTANTE',     costo: 'POR' },
  { operacion: 'FALTANTE',       op: -1, opcc: 0,  operacionExterna: 'SOBRANTE',     costo: 'POR' },
  { operacion: 'EGRESAN',        op: -1, opcc: 0,  operacionExterna: 'RETIRA',       costo: 'POR' },
  { operacion: 'INGRESAN',       op:  1, opcc: 0,  operacionExterna: 'ENTREGA',      costo: 'POR' },
  { operacion: 'GANANCIA',       op:  1, opcc: 0,  operacionExterna: 'GANANCIA',     costo: 'POR' },
  { operacion: 'SWITCH',         op:  1, opcc: 1,  operacionExterna: 'SWITCH',       costo: 'POR' },
  { operacion: 'ENTRA TT',       op: -1, opcc: -1, operacionExterna: 'ENTREGA TT',   costo: 'POR' },
  { operacion: 'SALE TT',        op:  1, opcc: 1,  operacionExterna: 'RECIBE TT',    costo: 'POR' },
  { operacion: 'GASTOS',         op: -1, opcc: 0,  operacionExterna: 'RETIRA',       costo: 'POR' },
]

// Tabla 2: multiplicador de cotización según el par Moneda Propia / Moneda Externa
// (columnas G-J de SIGNOS). La búsqueda siempre usa las monedas CRUDAS (sin prefijo
// "CC "), aunque la operación sea de cuenta corriente — así lo hace la fórmula real.
export type MultCotizacion = 'POR' | 'DIV' | 'NADA'

export interface SignoMoneda {
  monedaPropia: string
  monedaExterna: string  // '' cuando la operación no tiene moneda externa (INGRESAN/EGRESAN/GASTOS)
  mult: MultCotizacion
}

// USDT (agregado 20/7/2026): NO existe en la planilla; es una moneda solo-app. Se
// comporta como un "segundo dólar" (se cotiza en pesos por USDT y ~1:1 contra el dólar
// físico con el spread que cargue el operador). La matriz espeja la fila/columna de
// DOLARES, y el par USDT/DOLARES lleva cotización explícita (POR/DIV, no NADA) porque el
// canje tiene spread. Por decisión de negocio solo se opera contra PESOS y DÓLARES, pero
// se completan todos los pares para no lanzar "No hay cotización" y quedar consistente.
const MONEDAS = ['PESOS', 'CHEQUES', 'DOLARES', 'EUROS', 'REALES', 'USDT'] as const

// Matriz mult[propia][externa] tal como está cargada en SIGNOS, extendida con USDT.
// NADA = no hay conversión (mismas monedas, o sin externa); POR = multiplicar por la
// cotización; DIV = dividir por la cotización. Cada par (A,B) es opuesto a (B,A).
const MATRIZ_MULT: Record<string, Record<string, MultCotizacion>> = {
  PESOS:   { PESOS: 'NADA', CHEQUES: 'NADA', DOLARES: 'DIV', EUROS: 'DIV', REALES: 'DIV', USDT: 'DIV' },
  CHEQUES: { PESOS: 'NADA', CHEQUES: 'NADA', DOLARES: 'DIV', EUROS: 'DIV', REALES: 'DIV', USDT: 'DIV' },
  DOLARES: { PESOS: 'POR',  CHEQUES: 'POR',  DOLARES: 'NADA', EUROS: 'DIV', REALES: 'POR', USDT: 'DIV' },
  EUROS:   { PESOS: 'POR',  CHEQUES: 'POR',  DOLARES: 'POR',  EUROS: 'NADA', REALES: 'POR', USDT: 'POR' },
  REALES:  { PESOS: 'POR',  CHEQUES: 'POR',  DOLARES: 'DIV',  EUROS: 'DIV',  REALES: 'NADA', USDT: 'DIV' },
  USDT:    { PESOS: 'POR',  CHEQUES: 'POR',  DOLARES: 'POR',  EUROS: 'DIV',  REALES: 'POR',  USDT: 'NADA' },
}

export const SIGNOS_MONEDA: SignoMoneda[] = [
  ...MONEDAS.map(m => ({ monedaPropia: m, monedaExterna: '', mult: 'NADA' as MultCotizacion })),
  ...MONEDAS.flatMap(propia => MONEDAS.map(externa => ({
    monedaPropia: propia, monedaExterna: externa, mult: MATRIZ_MULT[propia][externa],
  }))),
]

export function buscarSignoOperacion(operacion: string): SignoOperacion | null {
  return SIGNOS_OPERACION.find(s => s.operacion === operacion.trim().toUpperCase()) ?? null
}

export function buscarMultCotizacion(monedaPropia: string, monedaExterna: string): MultCotizacion | null {
  const propia = monedaPropia.trim().toUpperCase()
  const externa = monedaExterna.trim().toUpperCase()
  const fila = SIGNOS_MONEDA.find(s => s.monedaPropia === propia && s.monedaExterna === externa)
  return fila?.mult ?? null
}
