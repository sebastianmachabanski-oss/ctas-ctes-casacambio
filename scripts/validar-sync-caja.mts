// Valida el parser de movimientos de CAJA (parseMovimientosCaja del sync) contra un
// dump real de la planilla, usando los valores confirmados durante la reconciliación
// Sheet↔Excel de julio 2026 (ver docs/SINCRONIZACION.md).
//
// Uso: npx tsx scripts/validar-sync-caja.mts <dump.json>
//   donde <dump.json> es la matriz de filas de la solapa CAJA tal como la devuelve
//   la Sheets API con FORMATTED_VALUE (la misma forma que consume el sync).
import { readFileSync } from 'fs'
import { parseMovimientosCaja } from '../netlify/functions/sync-background.mts'

const path = process.argv[2]
if (!path) { console.error('Uso: npx tsx scripts/validar-sync-caja.mts <dump.json>'); process.exit(2) }
const rows: any[][] = JSON.parse(readFileSync(path, 'utf8'))

const movs = parseMovimientosCaja(rows)
console.log(`Filas parseadas: ${movs.length}`)

let ok = 0, fail = 0
function check(nombre: string, actual: number, esperado: number, tolerancia = 0.01) {
  if (Math.abs(actual - esperado) <= tolerancia) { ok++; console.log(`✅ ${nombre}: ${actual}`) }
  else { fail++; console.error(`❌ ${nombre}: dio ${actual}, esperado ${esperado}`) }
}

// ── Valores confirmados en la reconciliación (barra de estado del usuario + R CAJA) ──
// El dump debe ser UNFORMATTED_VALUE (como lee el sync): los esperados son los valores
// EXACTOS internos de la planilla; el display redondea (-98.252 y 445.565).
// Rango 17/4/2026 a 19/6/2026: 4.078 filas, suma DOLARES exacta -98.251,73.
const rango = movs.filter(m => m.fecha >= '2026-04-17' && m.fecha <= '2026-06-19')
check('Filas 17/4–19/6', rango.length, 4078, 0)
check('Suma DOLARES 17/4–19/6', rango.reduce((s, m) => s + m.dolares, 0), -98251.73)

// Saldo inicial DOLARES de R CAJA al 2/7/2026 (celda D5 validada, display 445.565).
const previo = movs.filter(m => m.fecha < '2026-07-02')
check('SALDO INICIAL DOLARES (fecha < 2/7)', previo.reduce((s, m) => s + m.dolares, 0), 445565.43)

// ── Chequeos estructurales ──
const sinTipo = movs.filter(m => m.tipo !== 'CAJA' && m.tipo !== 'CTA CTE').length
check('Filas con tipo inválido', sinTipo, 0, 0)
const ctacte = movs.filter(m => m.tipo === 'CTA CTE')
check('CTA CTE con nombre de cuenta', ctacte.filter(m => !m.cliente).length, 0, 0)

console.log(`\nResumen: ${ok} OK, ${fail} con diferencias`)
console.log(`Tipos: CAJA=${movs.filter(m => m.tipo === 'CAJA').length} CTA CTE=${ctacte.length}`)
console.log(`Con DEBE (calle): ${movs.filter(m => m.debe).length} · Con COT: ${movs.filter(m => m.cot !== null).length}`)
process.exit(fail > 0 ? 1 : 0)
