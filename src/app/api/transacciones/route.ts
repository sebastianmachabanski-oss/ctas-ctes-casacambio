import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleToken } from '@/lib/google'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx')

const FILE_ID    = '12F-FTw8ueaKdRgb6wr_r3y6PqJjjA_06'
const SHEET_NAME = 'CAJA'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

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

  // Find header row
  let headerIdx = -1
  let headers: string[] = []
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i] && rows[i].some((c: any) => String(c || '').toUpperCase().includes('FECHA'))) {
      headerIdx = i
      headers = rows[i].map((c: any) => String(c || '').trim().toUpperCase())
      break
    }
  }
  if (headerIdx < 0) throw new Error('No se encontraron encabezados en el Excel')

  const col = (name: string) => headers.findIndex(h => h.includes(name))
  const iDate       = col('FECHA')
  const iCliente    = col('CLIENTE')
  const iCtaCte     = col('CAJA')
  const iOpTipo     = col('OPERACI')
  const iPropio     = col('PROPIO')
  const iExterno    = col('EXTERNO')
  const iMonto      = col('MONTO')
  const iNotas      = col('NOTAS')
  const iCotizacion = col('COTIZACI')
  const iPesos      = headers.findIndex(h => h === 'PESOS')
  const iDolares    = headers.findIndex(h => h === 'DOLARES')
  const iEuros      = headers.findIndex(h => h === 'EUROS')
  const iReales     = headers.findIndex(h => h === 'REALES')

  // Col F (index 5) is the "Op" column used by Excel formulas
  const iColF = 5

  const newRow = new Array(headers.length).fill('')
  if (iDate >= 0)    newRow[iDate]    = data.fecha
  if (iCliente >= 0) newRow[iCliente] = 'CTA CTE'
  if (iCtaCte >= 0)  newRow[iCtaCte]  = data.cuenta_cte
  if (iOpTipo >= 0)  newRow[iOpTipo]  = data.operacion
  if (iColF < headers.length) newRow[iColF] = data.col_f
  if (iPropio >= 0)  newRow[iPropio]  = data.propio
  if (iExterno >= 0) newRow[iExterno] = data.externo
  if (iMonto >= 0)   newRow[iMonto]   = data.monto
  if (iNotas >= 0)   newRow[iNotas]   = data.notas ?? ''
  if (iCotizacion >= 0 && data.cotizacion != null) newRow[iCotizacion] = data.cotizacion
  if (iPesos >= 0)   newRow[iPesos]   = data.cc_pesos   || ''
  if (iDolares >= 0) newRow[iDolares] = data.cc_dolares || ''
  if (iEuros >= 0)   newRow[iEuros]   = data.cc_euros   || ''
  if (iReales >= 0)  newRow[iReales]  = data.cc_reales  || ''

  // Append after last row with content
  const lastRow = rows.length
  XLSX.utils.sheet_add_aoa(sheet, [newRow], { origin: lastRow })

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
  const { fecha, col_f, cuenta_cte, operacion, propio, externo, monto, cotizacion, notas } = body

  if (!fecha || !col_f || !cuenta_cte || !operacion || !propio || !externo || monto == null)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

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
    tipo: 'CTA CTE',
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

  // Write to Excel
  try {
    const token = await getGoogleToken(DRIVE_SCOPE)
    await appendRowToExcel(token, {
      fecha, col_f, cuenta_cte, operacion, propio, externo,
      monto: Number(monto),
      cotizacion: cotizacion ? Number(cotizacion) : null,
      notas: notas || null,
      cc_pesos, cc_dolares, cc_euros, cc_reales,
    })
  } catch (excelErr: any) {
    // Excel write failed but Supabase insert succeeded — report partial success
    return NextResponse.json({
      success: true,
      warning: `Guardado en sistema pero no en Excel: ${excelErr.message}`,
    })
  }

  return NextResponse.json({ success: true })
}
