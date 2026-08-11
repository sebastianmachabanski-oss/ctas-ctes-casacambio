import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleToken } from '@/lib/google'
import { esStaff } from '@/lib/roles'
export const maxDuration = 30

// El Google Sheet es el ÚNICO origen externo. El camino al .xlsx viejo de Drive existió
// hasta el 11/8/2026, conmutable por la env var WRITE_SOURCE, y se eliminó: si la
// variable faltaba o cambiaba de valor, la app escribía en el Excel viejo SIN AVISO y
// el borrado espejado dejaba de limpiar la planilla. Un origen, sin fallback silencioso.
const SHEET_ID    = '1BxW5TGUbi12LHATOIjnkBc71GY9JZARsy5_LP5Sl1CE'
const SHEET_NAME  = 'CAJA'
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

interface NuevaTransaccion {
  fecha: string
  tipo: string
  col_f: string
  cuenta_cte: string
  operacion: string
  propio: string
  externo: string
  monto: number
  cotizacion: number | null
  costo_porcentaje: number | null
  debe: string | null
  notas: string | null
  cc_pesos: number
  cc_dolares: number
  cc_euros: number
  cc_reales: number
}

function mapMoneda(val: string): string {
  const m = val.trim().toUpperCase()
  if (m.includes('DOLAR') || m === 'USD') return 'DOLARES'
  if (m.includes('PESO') || m === 'ARS') return 'PESOS'
  if (m.includes('EURO') || m === 'EUR') return 'EUROS'
  if (m.includes('REAL') || m === 'BRL') return 'REALES'
  return m
}

// ─────────────────────────────────────────────────────────────────────────
// Fuente 'sheets': escribe directo en el Google Sheet nativo con la Sheets API.
//
// La planilla mantiene filas pre-armadas (con las fórmulas de CUENTA, PESOS,
// CHEQUES, DOLARES, EUROS, REALES, NRO ya puestas) esperando datos: se
// identifican porque la columna OPERACIÓN todavía tiene el texto literal
// "OPERACION?" (el valor por defecto de la validación de datos de esa
// columna). La app busca la PRIMERA fila en orden con ese marcador y
// escribe ahí encima solo las columnas de ENTRADA (FECHA, CLIENTE, OP, CAJA,
// OPERACIÓN, PROPIO, EXTERNO, MONTO, COT, COSTO %, DEBE, NOTAS) — las
// fórmulas ya presentes en esa fila calculan solas al completarse.
// ─────────────────────────────────────────────────────────────────────────

function colLetter(index0: number): string {
  let n = index0 + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function toSheetDate(iso: string): string {
  // 'YYYY-MM-DD' -> 'DD/MM/YYYY', el formato del resto de la columna FECHA.
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

async function sheetsFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`)
  return res.json()
}

// Localiza la fila de encabezados (busca 'FECHA') y devuelve los nombres de columna
// normalizados, en el mismo orden en que aparecen en la planilla.
async function getHeaderCells(token: string): Promise<string[]> {
  const range = encodeURIComponent(`${SHEET_NAME}!A1:Z15`)
  const data = await sheetsFetch(token, `/values/${range}`)
  const rows: any[][] = data.values ?? []
  for (const row of rows) {
    const cells = (row ?? []).map((c: any) => String(c || '').trim().toUpperCase())
    if (cells.includes('FECHA')) return cells
  }
  throw new Error('No se encontró la fila de encabezados (FECHA) en la planilla')
}

// Primera fila (en orden) cuya columna OPERACIÓN todavía dice "OPERACION?": es una fila
// pre-armada con fórmulas, lista para recibir datos. Lee solo esa columna (liviano).
async function findFilaLibre(token: string, operacionCol: string): Promise<number> {
  const range = encodeURIComponent(`${SHEET_NAME}!${operacionCol}:${operacionCol}`)
  const data = await sheetsFetch(token, `/values/${range}`)
  const values: any[][] = data.values ?? []
  const idx = values.findIndex(row => String(row?.[0] ?? '').trim().toUpperCase() === 'OPERACION?')
  if (idx < 0) throw new Error('No hay filas disponibles en la planilla (ninguna celda OPERACIÓN = "OPERACION?")')
  return idx + 1 // El rango arranca en la fila 1, así que esto ya es el N° de fila 1-indexado.
}

async function writeInputRow(token: string, targetRow: number, startCol: number, endCol: number, values: any[]) {
  const range = `${SHEET_NAME}!${colLetter(startCol)}${targetRow}:${colLetter(endCol)}${targetRow}`
  await sheetsFetch(token, `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ range, values: [values] }),
  })
}

async function appendRowToSheet(token: string, data: NuevaTransaccion) {
  const headers = await getHeaderCells(token)

  // 'OPERACI' (sin acento al final) matchea tanto 'OPERACIÓN' como 'OPERACION'.
  const find = (name: string) => headers.findIndex(h => h === name)
  const findContains = (name: string) => headers.findIndex(h => h.includes(name))

  const iFecha     = find('FECHA')
  const iCliente   = find('CLIENTE')
  const iOp        = find('OP')
  const iCaja      = find('CAJA')
  const iOperacion = findContains('OPERACI')
  const iPropio    = find('PROPIO')
  const iExterno   = find('EXTERNO')
  const iMonto     = find('MONTO')
  const iCot       = find('COT')
  const iCostoPct  = findContains('COSTO')
  const iDebe      = find('DEBE')
  const iNotas     = find('NOTAS')

  const required: Record<string, number> = {
    FECHA: iFecha, CLIENTE: iCliente, OP: iOp, CAJA: iCaja, OPERACIÓN: iOperacion,
    PROPIO: iPropio, EXTERNO: iExterno, MONTO: iMonto, COT: iCot,
  }
  for (const [name, idx] of Object.entries(required)) {
    if (idx < 0) throw new Error(`No se encontró la columna "${name}" en la planilla`)
  }

  const inputIdx = [iFecha, iCliente, iOp, iCaja, iOperacion, iPropio, iExterno, iMonto, iCot, iCostoPct, iDebe, iNotas]
    .filter(i => i >= 0)
  const startCol = Math.min(...inputIdx)
  const endCol = Math.max(...inputIdx)
  const operacionColLetter = colLetter(iOperacion)

  const targetRow = await findFilaLibre(token, operacionColLetter)

  const row = new Array(endCol - startCol + 1).fill('')
  const put = (idx: number, val: any) => { if (idx >= 0) row[idx - startCol] = val }
  put(iFecha, toSheetDate(data.fecha))
  put(iOp, data.col_f)
  put(iOperacion, data.operacion)
  if (data.tipo === 'CAJA') {
    put(iCliente, data.cuenta_cte)
    put(iCaja, 'CAJA')
  } else {
    put(iCliente, 'CTA CTE')
    put(iCaja, data.cuenta_cte)
  }
  put(iPropio, data.propio)
  put(iExterno, data.externo)
  put(iMonto, data.monto)
  put(iCot, data.cotizacion ?? '')
  if (data.costo_porcentaje != null) put(iCostoPct, data.costo_porcentaje)
  if (data.debe) put(iDebe, data.debe)
  if (data.notas) put(iNotas, data.notas)

  await writeInputRow(token, targetRow, startCol, endCol, row)
}

// ─────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ excel: false, warning: 'No autorizado' })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ excel: false, warning: 'No autorizado' })
  const rol = (profile as any).rol
  if (!esStaff(rol))
    return NextResponse.json({ excel: false, warning: 'Sin permisos' })

  const body = await request.json()
  const {
    fecha, tipo, col_f, cuenta_cte, operacion, propio, externo, monto, cotizacion,
    costo_porcentaje, debe, notas,
  } = body

  // Recalculate cc_* deltas (solo informativo para el camino Excel; el Sheet no las usa).
  const sign = operacion === 'INGRESAN' ? 1 : operacion === 'EGRESAN' ? -1 : 0
  const monedaNorm = mapMoneda(propio)
  const cc_pesos    = sign && monedaNorm === 'PESOS'   ? sign * monto : 0
  const cc_dolares  = sign && monedaNorm === 'DOLARES' ? sign * monto : 0
  const cc_euros    = sign && monedaNorm === 'EUROS'   ? sign * monto : 0
  const cc_reales   = sign && monedaNorm === 'REALES'  ? sign * monto : 0

  const data: NuevaTransaccion = {
    fecha, tipo, col_f, cuenta_cte, operacion, propio, externo,
    monto: Number(monto),
    cotizacion: cotizacion ? Number(cotizacion) : null,
    costo_porcentaje: costo_porcentaje ? Number(costo_porcentaje) : null,
    debe: debe || null,
    notas: notas || null,
    cc_pesos, cc_dolares, cc_euros, cc_reales,
  }

  try {
    const token = await getGoogleToken(SHEETS_SCOPE)
    await appendRowToSheet(token, data)
    return NextResponse.json({ excel: true })
  } catch (excelErr: any) {
    return NextResponse.json({ excel: false, warning: excelErr.message })
  }
}
