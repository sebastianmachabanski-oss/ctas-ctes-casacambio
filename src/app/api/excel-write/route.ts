import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleToken } from '@/lib/google'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx')

export const maxDuration = 30

const EXCEL_FILE_ID = '1tuURACcfs09rRkynmVLqLD90Je5r-u58'             // .xlsx viejo (Drive)
const SHEET_ID       = '1BxW5TGUbi12LHATOIjnkBc71GY9JZARsy5_LP5Sl1CE' // Google Sheet nuevo
const SHEET_NAME     = 'CAJA'
const DRIVE_SCOPE     = 'https://www.googleapis.com/auth/drive'
const SHEETS_SCOPE    = 'https://www.googleapis.com/auth/spreadsheets'

// Conmutable por env var, igual patrón que SYNC_SOURCE en sync-background.mts.
// Mientras WRITE_SOURCE no sea 'sheets', se mantiene el camino histórico (Excel).
const WRITE_SOURCE: 'excel' | 'sheets' = process.env.WRITE_SOURCE === 'sheets' ? 'sheets' : 'excel'

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
// Fuente 'excel': baja/sube el .xlsx binario de Drive (comportamiento histórico).
// ─────────────────────────────────────────────────────────────────────────
async function appendRowToExcel(token: string, data: NuevaTransaccion) {
  const url = `https://www.googleapis.com/drive/v3/files/${EXCEL_FILE_ID}?alt=media`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Error descargando archivo: ${res.status} ${await res.text()}`)
  const buffer = await res.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Pestaña "${SHEET_NAME}" no encontrada`)

  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true })

  // Fixed column positions (user confirmed: D=FECHA, E=CLIENTE, F=Op, G=CAJA, H=OPERACION)
  const COL_FECHA     = 3  // D
  const COL_CLIENTE   = 4  // E
  const COL_F         = 5  // F
  const COL_CAJA_COL  = 6  // G
  const COL_OPERACION = 7  // H

  // Find header row: first row containing 'FECHA' in any cell
  let headerIdx = -1
  let headers: string[] = []
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i]
    if (!row) continue
    const cells = row.map((c: any) => String(c || '').trim().toUpperCase())
    if (cells.some(c => c === 'FECHA')) {
      headerIdx = i
      headers = cells
      break
    }
  }
  if (headerIdx < 0) throw new Error('No se encontró encabezado (FECHA) en las primeras 20 filas')

  // Find first available row: any cell in the row contains exactly 'OPERACION?'
  let targetRow = -1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    if (row.some((c: any) => String(c || '').trim().toUpperCase() === 'OPERACION?')) {
      targetRow = i
      break
    }
  }
  if (targetRow < 0) throw new Error('No hay filas disponibles en el Excel (ninguna celda con valor "OPERACION?")')

  // Find remaining column positions from header
  const col = (name: string) => headers.findIndex(h => h.includes(name))
  const iPropio     = col('PROPIO')
  const iExterno    = col('EXTERNO')
  const iMonto      = col('MONTO')
  const iNotas      = col('NOTAS')
  const iCotizacion = col('COTIZACI')
  const iPesos      = headers.findIndex(h => h === 'PESOS')
  const iDolares    = headers.findIndex(h => h === 'DOLARES')
  const iEuros      = headers.findIndex(h => h === 'EUROS')
  const iReales     = headers.findIndex(h => h === 'REALES')

  // Start with existing pre-allocated row (preserves formulas/values we don't know about)
  const existingRow = rows[targetRow] ? [...rows[targetRow]] : []
  const newRow = new Array(Math.max(existingRow.length, headers.length)).fill('')
  existingRow.forEach((v, i) => { if (v != null) newRow[i] = v })

  // Override with user data
  newRow[COL_FECHA] = data.fecha
  newRow[COL_F]     = data.col_f
  newRow[COL_OPERACION] = data.operacion
  if (data.tipo === 'CAJA') {
    newRow[COL_CLIENTE]  = data.cuenta_cte
    newRow[COL_CAJA_COL] = 'CAJA'
  } else {
    newRow[COL_CLIENTE]  = 'CTA CTE'
    newRow[COL_CAJA_COL] = data.cuenta_cte
  }
  if (iPropio >= 0)   newRow[iPropio]   = data.propio
  if (iExterno >= 0)  newRow[iExterno]  = data.externo
  if (iMonto >= 0)    newRow[iMonto]    = data.monto
  if (iNotas >= 0)    newRow[iNotas]    = data.notas ?? ''
  if (iCotizacion >= 0 && data.cotizacion != null) newRow[iCotizacion] = data.cotizacion
  if (iPesos >= 0)    newRow[iPesos]    = data.cc_pesos   || ''
  if (iDolares >= 0)  newRow[iDolares]  = data.cc_dolares || ''
  if (iEuros >= 0)    newRow[iEuros]    = data.cc_euros   || ''
  if (iReales >= 0)   newRow[iReales]   = data.cc_reales  || ''

  // Replace the pre-allocated row in place
  XLSX.utils.sheet_add_aoa(sheet, [newRow], { origin: targetRow })

  const rawBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array
  const uploadBody = new Blob([rawBuffer.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const uploadRes = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${EXCEL_FILE_ID}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      body: uploadBody,
    }
  )
  if (!uploadRes.ok) {
    const msg = await uploadRes.text()
    throw new Error(`Error subiendo archivo a Drive: ${uploadRes.status} ${msg}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Fuente 'sheets': escribe directo en el Google Sheet nativo con la Sheets API.
//
// La app solo carga las columnas de ENTRADA (FECHA, CLIENTE, OP, CAJA, OPERACIÓN,
// PROPIO, EXTERNO, MONTO, COT, COSTO %, DEBE, NOTAS). Las columnas CALCULADAS
// (CUENTA, PESOS, CHEQUES, DOLARES, EUROS, REALES, NRO) las genera la propia
// planilla con fórmulas ya almacenadas: se copia la fórmula de la última fila
// con datos hacia la fila nueva (igual que "arrastrar" la fórmula a mano),
// Sheets ajusta las referencias relativas solas.
// ─────────────────────────────────────────────────────────────────────────

// Headers de entrada (los carga la app) y calculados (los genera la fórmula de la planilla).
const CALC_HEADERS = ['CUENTA', 'PESOS', 'CHEQUES', 'DOLARES', 'EUROS', 'REALES', 'NRO']

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

async function getSheetGid(token: string): Promise<number> {
  const data = await sheetsFetch(token, '?fields=sheets.properties')
  const sheet = (data.sheets ?? []).find((s: any) => s.properties?.title === SHEET_NAME)
  if (!sheet) throw new Error(`Pestaña "${SHEET_NAME}" no encontrada`)
  return sheet.properties.sheetId
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

async function getLastDataRow(token: string, fechaCol: string): Promise<number> {
  const range = encodeURIComponent(`${SHEET_NAME}!${fechaCol}:${fechaCol}`)
  const data = await sheetsFetch(token, `/values/${range}`)
  const values: any[][] = data.values ?? []
  if (!values.length) throw new Error('No se encontraron filas con FECHA')
  return values.length // El rango arranca en la fila 1, así que esto es el N° de fila 1-indexado.
}

async function isRowEmpty(token: string, row: number, fechaCol: string): Promise<boolean> {
  const range = encodeURIComponent(`${SHEET_NAME}!${fechaCol}${row}`)
  const data = await sheetsFetch(token, `/values/${range}`)
  return !(data.values && data.values[0] && data.values[0][0])
}

async function copyFormulasDown(
  token: string, sheetId: number, sourceRow: number, targetRow: number, startCol: number, endCol: number
) {
  await sheetsFetch(token, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        copyPaste: {
          source: { sheetId, startRowIndex: sourceRow - 1, endRowIndex: sourceRow, startColumnIndex: startCol, endColumnIndex: endCol + 1 },
          destination: { sheetId, startRowIndex: targetRow - 1, endRowIndex: targetRow, startColumnIndex: startCol, endColumnIndex: endCol + 1 },
          pasteType: 'PASTE_FORMULA',
        },
      }],
    }),
  })
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
  const fechaColLetter = colLetter(iFecha)

  // Ubica la primera fila libre después del último dato. Reintenta una vez por si dos
  // escrituras chocan justo en el mismo instante (colisión rara, pero posible).
  let targetRow = -1
  for (let attempt = 0; attempt < 2 && targetRow < 0; attempt++) {
    const lastRow = await getLastDataRow(token, fechaColLetter)
    const candidate = lastRow + 1
    if (await isRowEmpty(token, candidate, fechaColLetter)) targetRow = candidate
  }
  if (targetRow < 0) throw new Error('No se pudo encontrar una fila libre para escribir (reintentar)')

  // Las columnas calculadas (CUENTA, PESOS, ...) se completan copiando la fórmula de la
  // fila anterior — Sheets ajusta las referencias relativas a la fila nueva, como un
  // "arrastrar hacia abajo" manual.
  const calcIdx = CALC_HEADERS.map(h => headers.findIndex(c => c === h)).filter(i => i >= 0)
  if (calcIdx.length) {
    const gid = await getSheetGid(token)
    await copyFormulasDown(token, gid, targetRow - 1, targetRow, Math.min(...calcIdx), Math.max(...calcIdx))
  }

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
  if (rol !== 'superusuario' && rol !== 'operador')
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
    if (WRITE_SOURCE === 'sheets') {
      const token = await getGoogleToken(SHEETS_SCOPE)
      await appendRowToSheet(token, data)
    } else {
      const token = await getGoogleToken(DRIVE_SCOPE)
      await appendRowToExcel(token, data)
    }
    return NextResponse.json({ excel: true })
  } catch (excelErr: any) {
    return NextResponse.json({ excel: false, warning: excelErr.message })
  }
}
