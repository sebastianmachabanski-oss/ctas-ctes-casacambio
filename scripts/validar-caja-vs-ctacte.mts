/**
 * Validador de la detección CAJA / CUENTA CORRIENTE (`src/lib/caja-vs-ctacte.ts`).
 *
 *   npx tsx scripts/validar-caja-vs-ctacte.mts
 *
 * Lo que más importa acá NO es que detecte, sino que NO AVISE DE MÁS. Un aviso que salta
 * cien veces por mes se cierra sin leer y deja de proteger. Los casos reales de abajo
 * salieron del relevamiento del 13/10/2026 sobre las últimas tres semanas.
 */
import { pareceCuentaCorriente } from '../src/lib/caja-vs-ctacte'

let ok = 0
const fallas: string[] = []

const CUENTAS = ['MAYA', 'JOSEPH', 'KUSA', 'RICHARD', 'OSCAR SEGUI', 'ARIEL J', 'MARCOS JONY', 'COLO']

function asert(nombre: string, cond: boolean) {
  if (cond) { ok++; return }
  fallas.push(nombre)
}

const avisa = (tipo: string, operacion: string, op: string, cliente: string) =>
  pareceCuentaCorriente({ tipo, operacion, op, cliente }, CUENTAS)

// ── 1. SÍ debe avisar: entra o sale plata de alguien que tiene cuenta ───────
asert('1a · CAJA INGRESAN de un cliente con cuenta', avisa('CAJA', 'INGRESAN', 'C', 'MAYA'))
asert('1b · CAJA EGRESAN de un cliente con cuenta', avisa('CAJA', 'EGRESAN', 'C', 'JOSEPH'))
asert('1c · sin distinguir mayúsculas', avisa('CAJA', 'INGRESAN', 'C', 'maya'))
asert('1d · ni espacios de sobra', avisa('CAJA', 'INGRESAN', 'C', '  MAYA  '))
asert('1e · con `op` vacío (histórico sin marcar)', avisa('CAJA', 'INGRESAN', '', 'MAYA'))

// ── 2. NO debe avisar: COMPRA y VENTA son el mostrador ──────────────────────
//     Es la mayor parte del volumen real: en tres semanas hubo más de cien compras y
//     ventas de caja a clientes que además tienen cuenta corriente. Todas legítimas.
asert('2a · CAJA COMPRA de un cliente con cuenta', !avisa('CAJA', 'COMPRA', 'C', 'MAYA'))
asert('2b · CAJA VENTA de un cliente con cuenta', !avisa('CAJA', 'VENTA', 'C', 'RICHARD'))
asert('2c · CAJA VENTA de otro más', !avisa('CAJA', 'VENTA', 'C', 'KUSA'))
asert('2d · CAJA GASTOS', !avisa('CAJA', 'GASTOS', 'C', 'MAYA'))

// ── 3. NO debe avisar: las transferencias viven en CAJA por diseño ──────────
//     Caso real: OSCAR SEGUI INGRESAN 25.500 del 30/9 es la pata de un par de
//     transferencia, y está bien cargada como CAJA.
asert('3a · transferencia INGRESAN', !avisa('CAJA', 'INGRESAN', 'T', 'OSCAR SEGUI'))
asert('3b · transferencia EGRESAN', !avisa('CAJA', 'EGRESAN', 'T', 'OSCAR SEGUI'))
asert('3c · la T puede venir en minúscula', !avisa('CAJA', 'INGRESAN', 't', 'OSCAR SEGUI'))

// ── 4. NO debe avisar: lo que ya es cuenta corriente ────────────────────────
asert('4 · tipo CTA CTE', !avisa('CTA CTE', 'INGRESAN', 'C', 'MAYA'))

// ── 5. NO debe avisar: clientes eventuales sin cuenta ───────────────────────
asert('5a · nombre que no es cuenta', !avisa('CAJA', 'INGRESAN', 'C', 'SILVA'))
asert('5b · cliente vacío', !avisa('CAJA', 'INGRESAN', 'C', ''))
asert('5c · cliente nulo', !pareceCuentaCorriente(
  { tipo: 'CAJA', operacion: 'INGRESAN', op: 'C', cliente: null }, CUENTAS))

// ── 6. La comparación es por IGUALDAD, no por "contiene" ───────────────────
//     Con `contiene`, un eventual llamado "MARCOS" dispararía por la cuenta
//     "MARCOS JONY", que es otra persona, y el aviso perdería credibilidad.
asert('6a · "MARCOS" no dispara por "MARCOS JONY"', !avisa('CAJA', 'INGRESAN', 'C', 'MARCOS'))
asert('6b · "ARIEL" no dispara por "ARIEL J"', !avisa('CAJA', 'INGRESAN', 'C', 'ARIEL'))
asert('6c · "ARIEL J" sí dispara', avisa('CAJA', 'INGRESAN', 'C', 'ARIEL J'))

// ── 7. Sin cuentas cargadas no avisa nunca ─────────────────────────────────
asert('7 · padrón vacío', !pareceCuentaCorriente(
  { tipo: 'CAJA', operacion: 'INGRESAN', op: 'C', cliente: 'MAYA' }, []))

// ── 8. Volumen: sobre la muestra real, cuántas veces saltaría ──────────────
//     Muestra tomada del relevamiento del 13/10/2026. De las 10, solo las 2 de
//     INGRESAN/EGRESAN sin T corresponden a un aviso.
{
  const muestra: [string, string, string, string][] = [
    ['CAJA', 'COMPRA',   'C', 'MAYA'],
    ['CAJA', 'COMPRA',   'C', 'JOSEPH'],
    ['CAJA', 'VENTA',    'C', 'KUSA'],
    ['CAJA', 'VENTA',    'C', 'RICHARD'],
    ['CAJA', 'COMPRA',   'C', 'SILVA'],
    ['CAJA', 'VENTA',    'C', 'OSCAR SEGUI'],
    ['CAJA', 'INGRESAN', 'T', 'OSCAR SEGUI'],
    ['CAJA', 'COMPRA',   'C', 'DAYE'],
    ['CAJA', 'INGRESAN', 'C', 'COLO'],
    ['CAJA', 'EGRESAN',  'C', 'COLO'],
  ]
  const saltan = muestra.filter(([t, o, p, c]) => avisa(t, o, p, c)).length
  asert(`8 · sobre 10 movimientos reales salta 2 (saltó ${saltan})`, saltan === 2)
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
