import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx')

const FILE_ID    = '12F-FTw8ueaKdRgb6wr_r3y6PqJjjA_06'
const SHEET_NAME = 'CAJA'

function toNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') {
    const rounded = Math.round(val * 100) / 100
    return isFinite(rounded) ? rounded : 0
  }
  let s = String(val).trim()
  if (!s || s === '-' || s.replace(/\s/g, '') === '') return 0
  s = s.replace(/\s/g, '')
  s = s.replace(/[%$€£]/g, '')
  const isNegative = s.startsWith('(') && s.endsWith(')')
  if (isNegative) s = s.slice(1, -1)

  if (s.includes('.') && s.includes(',')) {
    const lastDot   = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (s.includes('.') && !s.includes(',')) {
    const parts = s.replace(/^-/, '').split('.')
    const allThreeDigits = parts.length > 1 && parts.slice(1).every((p: string) => p.length === 3)
    if (allThreeDigits) s = s.replace(/\./g, '')
  } else if (s.includes(',') && !s.includes('.')) {
    const parts = s.replace(/^-/, '').split(',')
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/,/g, '')
    } else {
      s = s.replace(',', '.')
    }
  }

  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return isNegative ? -n : n
}

// Parsea un monto usando el valor crudo de la celda (numero binario) y el texto formateado.
// En este dataset todos los montos son enteros. Si la celda guarda un numero con decimales
// (ej: 9.265 cargado con punto de miles que Excel tomo como decimal), se corrige
// multiplicando por 1000 hasta obtener un entero (9.265 -> 9265, 4.3 -> 4300).
function parseMonto(rawVal: any, fmtVal: any): number {
  if (typeof rawVal === 'number' && isFinite(rawVal)) {
    if (Number.isInteger(rawVal)) return rawVal
    let v = rawVal
    for (let k = 0; k < 3; k++) {
      v = v * 1000
      const r = Math.round(v)
      if (Math.abs(v - r) < 1e-6) return r
    }
    return Math.round(rawVal * 100) / 100
  }
  // Celda de texto: parsear el string formateado
  return toNum(fmtVal !== undefined ? fmtVal : rawVal)
}

function parseFecha(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val).trim()
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{2}$/)) {
    const [m, d, y] = s.split('/')
    const year = parseInt(y) + 2000
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10)
  return null
}

function mapMoneda(val: any): string {
  if (!val) return 'DOLARES'
  const m = String(val).trim().toUpperCase()
  if (m.includes('DOLAR') || m === 'USD') return 'DOLARES'
  if (m.includes('PESO') || m === 'ARS') return 'PESOS'
  if (m.includes('EURO') || m === 'EUR') return 'EUROS'
  if (m.includes('REAL') || m === 'BRL') return 'REALES'
  return m
}

async function getGoogleToken(): Promise<string> {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signingInput = `${header}.${body}`
  const privateKeyPem = creds.private_key
  const pemContents = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  )
  const sig = Buffer.from(signature).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${signingInput}.${sig}`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error('Token error: ' + JSON.stringify(tokenData))
  return tokenData.access_token
}

async function readSheetBoth(token: string): Promise<{ fmt: any[][], raw: any[][] }> {
  const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Error descargando archivo: ${res.status} ${res.statusText} - ${errBody}`)
  }
  const buffer = await res.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Pestaña "${SHEET_NAME}" no encontrada. Pestañas disponibles: ${workbook.SheetNames.join(', ')}`)
  // fmt: strings formateados (para texto/fechas) - raw: valores binarios (para numeros)
  const fmt: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, cellDates: true, dateNF: 'DD/MM/YYYY' })
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true,  cellDates: true })
  return { fmt, raw }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  try {
    const token = await getGoogleToken()
    const { fmt: rows, raw: rawRows } = await readSheetBoth(token)
    if (rows.length < 2) throw new Error('El sheet está vacío')

    let headerIdx = -1
    let headers: string[] = []
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      if (rows[i] && rows[i].some((c: any) => String(c || '').toUpperCase().includes('FECHA'))) {
        headerIdx = i
        headers = rows[i].map((c: any) => String(c || '').trim().toUpperCase())
        break
      }
    }
    if (headerIdx < 0) throw new Error('No se encontraron encabezados')

    const col = (name: string) => headers.findIndex(h => h.includes(name))
    const iDate    = col('FECHA')
    const iCliente = col('CLIENTE')
    const iCtaCte  = col('CAJA')
    const iOpTipo  = col('OPERACI')
    const iPropio  = col('PROPIO')
    const iExterno = col('EXTERNO')
    const iMonto   = col('MONTO')
    const iNotas   = col('NOTAS')
    const iCCPesos  = headers.findIndex(h => h === 'PESOS')
    const iCCDolar  = headers.findIndex(h => h === 'DOLARES')
    const iCCEuro   = headers.findIndex(h => h === 'EUROS')
    const iCCReal   = headers.findIndex(h => h === 'REALES')

    const debugSample: any[] = []

    const movimientos = []

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      const rawRow = rawRows[i] || []
      if (!row || !row[iCliente]) continue
      const cliente = String(row[iCliente] || '').trim().toUpperCase()
      if (cliente !== 'CTA CTE') continue
      const fecha = parseFecha(row[iDate])
      if (!fecha) continue
      const ctaCte = String(row[iCtaCte] || '').trim()
      if (!ctaCte) continue

      const monto = parseMonto(rawRow[iMonto], row[iMonto])
      const ccDol = iCCDolar >= 0 ? parseMonto(rawRow[iCCDolar], row[iCCDolar]) : 0
      const ccPes = iCCPesos >= 0 ? parseMonto(rawRow[iCCPesos], row[iCCPesos]) : 0
      const ccEur = iCCEuro  >= 0 ? parseMonto(rawRow[iCCEuro],  row[iCCEuro])  : 0
      const ccRea = iCCReal  >= 0 ? parseMonto(rawRow[iCCReal],  row[iCCReal])  : 0

      if (debugSample.length < 30 && ctaCte.toUpperCase() === 'EDY' && fecha === '2023-12-14') {
        debugSample.push({
          fecha,
          monto_raw: JSON.stringify(rawRow[iMonto]) + ' | ' + JSON.stringify(row[iMonto]),
          monto_parsed: monto,
          dolar_raw: JSON.stringify(rawRow[iCCDolar]) + ' | ' + JSON.stringify(row[iCCDolar]),
          dolar_parsed: ccDol,
        })
      }

      movimientos.push({
        fecha,
        tipo: 'CTA CTE',
        cuenta_cte: ctaCte,
        operacion: String(row[iOpTipo] || '').trim().toUpperCase(),
        concepto: row[iPropio] ? `${String(row[iPropio]).trim()} → ${String(row[iExterno] || '').trim()}` : null,
        evento: row[iNotas] ? String(row[iNotas]).trim() : null,
        moneda: mapMoneda(row[iPropio]),
        monto,
        cc_pesos:   ccPes,
        cc_dolares: ccDol,
        cc_euros:   ccEur,
        cc_reales:  ccRea,
        anulado: false,
      })
    }

    if (movimientos.length === 0) {
      const clientesEncontrados = Array.from(new Set(
        rows.slice(headerIdx + 1, headerIdx + 50)
          .map(r => r[iCliente] ? String(r[iCliente]).trim() : '(vacío)')
      ))
      throw new Error(`Sin movimientos CTA CTE. Valores en col CLIENTE: ${clientesEncontrados.join(', ')}`)
    }

    await supabase.from('diario').delete().eq('tipo', 'CTA CTE').eq('anulado', false)

    for (let i = 0; i < movimientos.length; i += 500) {
      const { error } = await supabase.from('diario').insert(movimientos.slice(i, i + 500))
      if (error) throw new Error('Error insertando: ' + error.message)
    }

    const cuentasSet = new Set(movimientos.map(m => m.cuenta_cte))
    for (const nombre of Array.from(cuentasSet)) {
      await supabase.from('cuentas_corrientes')
        .upsert({ nombre, activo: true }, { onConflict: 'nombre', ignoreDuplicates: true })
    }

    return NextResponse.json({
      success: true,
      movimientos: movimientos.length,
      cuentas: cuentasSet.size,
      ultimaSync: new Date().toISOString(),
      debug_sample: debugSample,
      debug_indices: { iMonto, iCCDolar, iCCPesos, iCCEuro, iCCReal },
    })

  } catch (err: any) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
