import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleToken } from '@/lib/google'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx')

export const maxDuration = 30

const FILE_ID    = '12F-FTw8ueaKdRgb6wr_r3y6PqJjjA_06'
const SHEET_NAME = 'CAJA'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error(`Timeout (${ms}ms)`)), ms))])
}

function mapMoneda(val: string): string {
  const m = val.trim().toUpperCase()
  if (m.includes('DOLAR') || m === 'USD') return 'DOLARES'
  if (m.includes('PESO') || m === 'ARS') return 'PESOS'
  if (m.includes('EURO') || m === 'EUR') return 'EUROS'
  if (m.includes('REAL') || m === 'BRL') return 'REALES'
  return m
}

async function appendRowToExcel(token: string, data: {
  fecha: string
  tipo: string
  col_f: string
  cuenta_cte: string
  operacion: string
  propio: string
  externo: string
  monto: number
  cotizacion: number | null
  notas: string | null
  cc_pesos: number
  cc_dolares: number
  cc_euros: number
  cc_reales: number
}) {
  const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`
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

  // Find header row: any row in the first 20 that contains both 'FECHA' and 'OPERACION' anywhere
  let headerIdx = -1
  let headers: string[] = []
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i]
    if (!row) continue
    const cells = row.map((c: any) => String(c || '').trim().toUpperCase())
    const hasFecha     = cells.some(c => c === 'FECHA')
    const hasOperacion = cells.some(c => c === 'OPERACION')
    if (hasFecha && hasOperacion) {
      headerIdx = i
      headers = cells
      break
    }
  }
  if (headerIdx < 0) throw new Error(`No se encontró encabezado (FECHA+OPERACION) en las primeras 20 filas. Disponibles: ${rows.slice(0,5).map(r => r ? r.slice(0,5).join('|') : '').join(' / ')}`)

  // Find first available row: col H has placeholder value 'OPERACION'
  let targetRow = -1
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (row && String(row[COL_OPERACION] || '').trim().toUpperCase() === 'OPERACION?') {
      targetRow = i
      break
    }
  }
  if (targetRow < 0) throw new Error('No hay filas disponibles en el Excel (col H = OPERACION no encontrada)')

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
    `https://www.googleapis.com/upload/drive/v3/files/${FILE_ID}?uploadType=media`,
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

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (profile as any).rol
  if (rol !== 'superusuario' && rol !== 'operador')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  const { fecha, tipo, col_f, cuenta_cte, operacion, propio, externo, monto, cotizacion, notas } = body

  if (!fecha || !tipo || !col_f || !cuenta_cte || !operacion || !propio || !externo || monto == null)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  if (!['CTA CTE', 'CAJA'].includes(tipo))
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

  if (!['C', 'T'].includes(col_f))
    return NextResponse.json({ error: 'Op debe ser C o T' }, { status: 400 })

  if (!['INGRESAN', 'EGRESAN'].includes(operacion))
    return NextResponse.json({ error: 'Operación inválida' }, { status: 400 })

  // Calculate currency deltas for Supabase (view uses SUM)
  const sign = operacion === 'INGRESAN' ? 1 : -1
  const monedaNorm = mapMoneda(propio)
  const cc_pesos    = monedaNorm === 'PESOS'   ? sign * monto : 0
  const cc_dolares  = monedaNorm === 'DOLARES' ? sign * monto : 0
  const cc_euros    = monedaNorm === 'EUROS'   ? sign * monto : 0
  const cc_reales   = monedaNorm === 'REALES'  ? sign * monto : 0

  // Insert into Supabase
  const { error: insertError } = await supabase.from('diario').insert({
    fecha,
    tipo,
    cuenta_cte,
    operacion,
    concepto: `${propio.trim()} → ${externo.trim()}`,
    detalle: col_f,
    moneda: monedaNorm,
    monto,
    cotizacion: cotizacion || null,
    cc_pesos,
    cc_dolares,
    cc_euros,
    cc_reales,
    notas: notas || null,
    creado_por: (profile as any).nombre ?? user.email,
    anulado: false,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Write to Excel synchronously so we can confirm result to user
  try {
    const token = await withTimeout(getGoogleToken(DRIVE_SCOPE), 8000)
    await withTimeout(appendRowToExcel(token, {
      fecha, tipo, col_f, cuenta_cte, operacion, propio, externo,
      monto: Number(monto),
      cotizacion: cotizacion ? Number(cotizacion) : null,
      notas: notas || null,
      cc_pesos, cc_dolares, cc_euros, cc_reales,
    }), 20000)
    return NextResponse.json({ success: true, excel: true })
  } catch (excelErr: any) {
    return NextResponse.json({
      success: true,
      excel: false,
      warning: `Guardado en sistema pero no en Excel: ${excelErr.message}`,
    })
  }
}
