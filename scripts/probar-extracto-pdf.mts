// Genera extractos PDF de prueba con datos fabricados, sin tocar la base.
// Uso: npx tsx scripts/probar-extracto-pdf.mts [carpeta]
//
// Sirve para dos cosas que no se pueden ver de otra forma:
//   1. Mirar el formato antes de conectarlo (los tres archivos quedan en disco).
//   2. Medir el caso grande. La cuenta más grande tiene ~7.700 movimientos y el tope del
//      extracto es 20.000: si generar eso tardara medio minuto o pesara veinte megas, el
//      PDF no sirve para mandarlo por WhatsApp y hay que saberlo ANTES de conectarlo.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { generarExtractoPdf } from '../src/lib/pdf/extracto'
import { MONEDAS, nombreArchivo, type DatosExtracto } from '../src/lib/consultas/extracto'

const salida = process.argv[2] ?? '/tmp/extractos'
mkdirSync(salida, { recursive: true })

const OPS = ['INGRESAN', 'EGRESAN', 'INGRESAN', 'EGRESAN', 'DONACION']
const CONCEPTOS = ['Cambio de divisas', 'Pago a proveedor', 'Depósito', 'Retiro de efectivo', 'Ajuste de saldo']

// Generador con semilla fija: dos corridas dan el mismo PDF y las diferencias que se vean
// son cambios del código, no del azar.
let semilla = 20260910
const rnd = () => {
  semilla = (semilla * 1103515245 + 12345) % 2147483648
  return semilla / 2147483648
}

function fabricar(cuenta: string, n: number, cuantasMonedas: number): DatosExtracto {
  const monedas = MONEDAS.slice(0, cuantasMonedas)
  const acum: Record<string, number> = {}
  for (const m of monedas) acum[m.acum] = 0

  const movimientos: any[] = []
  for (let i = 0; i < n; i++) {
    const op = OPS[Math.floor(rnd() * OPS.length)]
    const ing = op !== 'EGRESAN'
    const d = new Date(2026, 0, 1 + Math.floor((i / Math.max(1, n)) * 250))
    const fila: any = {
      id: `m${i}`,
      fecha: d.toISOString().slice(0, 10),
      operacion: op,
      concepto: CONCEPTOS[Math.floor(rnd() * CONCEPTOS.length)],
      evento: rnd() < 0.4 ? `REF-${1000 + i}` : null,
      notas: null,
      total_filas: n,
    }
    for (const m of monedas) {
      // No todas las monedas se mueven en cada fila: así se ve la columna con guiones.
      const mueve = rnd() < 0.55
      const v = mueve ? Math.round(rnd() * 5_000_00) / 100 * (ing ? 1 : -1) : 0
      fila[m.cc] = v
      acum[m.acum] += v
      fila[m.acum] = acum[m.acum]
    }
    movimientos.push(fila)
  }

  const saldos: Record<string, any> = { cuenta_cte: cuenta }
  for (const m of monedas) saldos[m.saldo] = acum[m.acum]

  const totales = Object.fromEntries(
    monedas.map(m => [m.cc, movimientos.reduce((a, x) => a + (Number(x[m.cc]) || 0), 0)])
  ) as Record<string, number>

  return {
    cuenta, movimientos, saldos, monedas, totales,
    periodo: '01/01/2026 al 10/09/2026',
    filtroOp: '',
    conAcumulado: true,
    total: n,
    recortado: false,
  }
}

const CASOS: [string, number, number][] = [
  // nombre de la cuenta, movimientos, cuántas monedas mueve
  ['ARIEL J', 40, 2],
  ['CUENTA CON CINCO MONEDAS', 120, 5],
  ['CUENTA GRANDE (caso extremo)', 7700, 3],
]

console.log(`Escribiendo en ${salida}\n`)
for (const [cuenta, n, mon] of CASOS) {
  const datos = fabricar(cuenta, n, mon)
  const t0 = Date.now()
  const pdf = generarExtractoPdf(datos)
  const ms = Date.now() - t0
  const nombre = nombreArchivo(datos)
  writeFileSync(join(salida, nombre), pdf)
  const kb = pdf.byteLength / 1024
  const peso = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`
  console.log(
    `${cuenta.padEnd(30)} ${String(n).padStart(5)} mov · ${mon} monedas · ` +
    `${String(ms).padStart(5)} ms · ${peso.padStart(8)}  →  ${nombre}`
  )
}
console.log('\nWhatsApp admite documentos de hasta 100 MB.')
