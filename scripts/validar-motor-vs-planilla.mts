// Validación EN PARALELO del motor de cálculo contra la planilla real: corre
// calcularMovimiento sobre cada fila de CAJA y compara las 10 columnas calculadas
// (y CUENTA) contra lo que calculó la planilla con sus fórmulas.
//
// Uso: npx tsx scripts/validar-motor-vs-planilla.mts <dump.json>
//   <dump.json> = solapa CAJA completa leída con UNFORMATTED_VALUE (como lee el sync).
import { readFileSync } from 'fs'
import { parseMovimientosCaja } from '../netlify/functions/sync-background.mts'
import { calcularMovimiento, COLUMNAS_SALIDA } from '../src/lib/motor-calculo/index'

const path = process.argv[2]
if (!path) { console.error('Uso: npx tsx scripts/validar-motor-vs-planilla.mts <dump.json>'); process.exit(2) }
const rows: any[][] = JSON.parse(readFileSync(path, 'utf8'))
const movs = parseMovimientosCaja(rows)

// El dump puede estar truncado en columnas (ej. hasta DOLARES): solo se comparan las
// columnas calculadas que realmente están presentes en el encabezado.
const headerRow = rows.find(r => (r ?? []).some((c: any) => String(c ?? '').trim().toUpperCase() === 'FECHA')) ?? []
const headersSet = new Set(headerRow.map((c: any) => String(c ?? '').trim().toUpperCase()))
const COLUMNAS_PRESENTES = COLUMNAS_SALIDA.filter(c => headersSet.has(c))
console.log(`Columnas comparadas (${COLUMNAS_PRESENTES.length}/10): ${COLUMNAS_PRESENTES.join(', ')}`)

// columna del motor → campo de movimientos_caja
const CAMPO: Record<string, string> = {
  'PESOS': 'pesos', 'CHEQUES': 'cheques', 'DOLARES': 'dolares', 'EUROS': 'euros',
  'REALES': 'reales', 'BANCO': 'banco', 'CC PESOS': 'cc_pesos', 'CC DOLARES': 'cc_dolares',
  'CC EUROS': 'cc_euros', 'CC REALES': 'cc_reales',
}
const TOL = 0.011  // media unidad del segundo decimal, con margen por flotantes

let ok = 0, conDif = 0, conError = 0, cuentaDif = 0
const difPorOperacion = new Map<string, number>()
const errPorMotivo = new Map<string, number>()
const ejemplos: string[] = []

for (const m of movs) {
  let r
  try {
    r = calcularMovimiento({
      tipo: m.tipo, operacion: m.operacion, propio: m.propio ?? '', externo: m.externo ?? '',
      // La planilla calcula con COTEXT (cot_efectiva); COT es solo lo que tipeó el operador.
      monto: m.monto, cotizacion: m.cot_efectiva ?? m.cot, costoPorcentaje: m.costo_pct,
    })
  } catch (e: any) {
    conError++
    const clave = `${m.operacion} — ${e.message}`
    errPorMotivo.set(clave, (errPorMotivo.get(clave) ?? 0) + 1)
    continue
  }

  const difs = COLUMNAS_PRESENTES.filter(col => Math.abs(r.valores[col] - (m[CAMPO[col]] ?? 0)) > TOL)
  if (difs.length) {
    conDif++
    difPorOperacion.set(m.operacion, (difPorOperacion.get(m.operacion) ?? 0) + 1)
    if (ejemplos.length < 8) {
      const det = difs.map(c => `${c}: motor=${r.valores[c].toFixed(2)} planilla=${(m[CAMPO[c]] ?? 0).toFixed(2)}`).join(' · ')
      ejemplos.push(`fila ${m.fila_sheet} ${m.fecha} ${m.tipo} ${m.operacion} ${m.propio ?? ''}/${m.externo ?? ''} monto=${m.monto} cot=${m.cot ?? '—'} → ${det}`)
    }
  } else ok++

  if (m.cuenta && r.cuenta && m.cuenta !== r.cuenta) cuentaDif++
}

const total = movs.length
const pct = (n: number) => ((n / total) * 100).toFixed(2) + '%'
console.log(`Filas: ${total}`)
console.log(`✅ Motor coincide EXACTO (10 columnas): ${ok} (${pct(ok)})`)
console.log(`❌ Con diferencias numéricas: ${conDif} (${pct(conDif)})`)
console.log(`⚠️  El motor no pudo calcular: ${conError} (${pct(conError)})`)
console.log(`CUENTA distinta (solo informativo): ${cuentaDif}`)

if (errPorMotivo.size) {
  console.log('\n— Motivos de "no pudo calcular" —')
  for (const [k, v] of [...errPorMotivo].sort((a, b) => b[1] - a[1])) console.log(`  ${v}× ${k}`)
}
if (difPorOperacion.size) {
  console.log('\n— Diferencias por operación —')
  for (const [k, v] of [...difPorOperacion].sort((a, b) => b[1] - a[1])) console.log(`  ${v}× ${k}`)
}
if (ejemplos.length) {
  console.log('\n— Ejemplos —')
  for (const e of ejemplos) console.log(' ', e)
}
process.exit(conDif + conError > 0 ? 1 : 0)
