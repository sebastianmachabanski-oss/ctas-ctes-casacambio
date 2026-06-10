import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx')

const FILE_ID    = '12F-FTw8ueaKdRgb6wr_r3y6PqJjjA_06'
const SHEET_NAME = 'CAJA'

function normalize(val: any): string {
  return String(val ?? '').replace(/[   ​﻿]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
}

function toNum(val: any): number {
  if (!val) return 0
  let s = String(val).trim()
  if (!s || s === '-' || s.replace(/\s/g,'') === '-' || s.replace(/\s/g,'') === '') return 0
  s = s.replace(/\s/g, '')
  const isNegative = s.startsWith('(') && s.endsWith(')')
  if (isNegative) s = s.slice(1, -1)
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes('.') && !s.includes(',')) {
    const parts = s.replace(/^-/, '').split('.')
    const allThreeDigits = parts.length > 1 && parts.slice(1).every((p: string) => p.length === 3)
    if (allThreeDigits) s = s.replace(/\./g, '')
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return isNegative ? -n : n
}

function parseFecha(val: any): string | null {
  if (!val) return null
  const s = String(val).trim()
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
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
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
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

async function readSheet(token: string): Promise<any[][]> {
  const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Error descargando archivo: ${res.status} ${res.statusText} - ${errBody}`)
  }
  const buffer = await res.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Pestaña "${SHEET_NAME}" no encontrada. Disponibles: ${workbook.SheetNames.join(', ')}`)
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'DD/MM/YYYY' })
  return rows
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
    const rows = await readSheet(token)
    if (rows.length < 2) throw new Error('El sheet está vacío')

    // Buscar fila de encabezados: debe tener FECHA + CLIENTE + CAJA exactos
    let headerIdx = -1
    let headers: string[] = []
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      if (!rows[i]) continue
      const cells = rows[i].map((c: any) => normalize(c))
      if (cells.some(c => c === 'FECHA') && cells.some(c => c === 'CLIENTE') && cells.some(c => c === 'CAJA')) {
        headerIdx = i
        headers = cells
        break
      }
    }
    if (headerIdx < 0) throw new Error('No se encontraron encabezados. Primeras 5 filas: ' + JSON.stringify(rows.slice(0,5)))
    console.log('DEBUG headers:', JSON.stringify(headers))

    // Mapear columnas por nombre
    const col = (name: string) => headers.findIndex(h => h.includes(name))
    const iDate    = col('FECHA')
    const iCliente = col('CLIENTE')   // columna de tipo: filtrar por 'CTA CTE'
    const iCtaCte  = col('CAJA')      // nombre de la cuenta corriente
    const iOpTipo  = col('OPERACI')   // EGRESAN / INGRESAN
    const iPropio  = col('PROPIO')    // moneda casa de cambio
    const iExterno = col('EXTERNO')   // moneda cliente
    const iMonto   = col('MONTO')
    const iNotas   = col('NOTAS')
    const iCCPesos  = headers.findIndex(h => h === 'PESOS')
    const iCCDolar  = headers.findIndex(h => h === 'DOLARES')
    const iCCEuro   = headers.findIndex(h => h === 'EUROS')
    const iCCReal   = headers.findIndex(h => h === 'REALES')

    console.log('DEBUG col indices:', { iDate, iCliente, iCtaCte, iOpTipo, iPropio, iMonto })

    // Filtrar filas donde CLIENTE === 'CTA CTE'
    const movimientos = []
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row[iCliente] == null) continue
      const cliente = normalize(row[iCliente])
      if (cliente !== 'CTA CTE') continue
      const fecha = parseFecha(row[iDate])
      if (!fecha) continue
      const ctaCte = String(row[iCtaCte] ?? '').trim()
      if (!ctaCte) continue

      movimientos.push({
        fecha,
        tipo: 'CTA CTE',
        cuenta_cte: ctaCte,
        operacion: normalize(row[iOpTipo]),
        concepto: row[iPropio] ? `${String(row[iPropio]).trim()} → ${String(row[iExterno] ?? '').trim()}` : null,
        evento: row[iNotas] ? String(row[iNotas]).trim() : null,
        moneda: mapMoneda(row[iPropio]),
        monto: toNum(row[iMonto]),
        cc_pesos:   iCCPesos >= 0 ? toNum(row[iCCPesos])  : 0,
        cc_dolares: iCCDolar >= 0 ? toNum(row[iCCDolar])  : 0,
        cc_euros:   iCCEuro  >= 0 ? toNum(row[iCCEuro])   : 0,
        cc_reales:  iCCReal  >= 0 ? toNum(row[iCCReal])   : 0,
        anulado: false,
      })
    }

    if (movimientos.length === 0) {
      const clientesDebug = Array.from(new Set(
        rows.slice(headerIdx + 1, headerIdx + 50)
          .filter(r => r && r[iCliente] != null)
          .map(r => {
            const raw = String(r[iCliente])
            const codes = Array.from(raw).map(c => c.charCodeAt(0).toString(16)).join(' ')
            return `"${raw}" [${codes}]`
          })
      )).slice(0, 10)
      throw new Error(`Sin movimientos CTA CTE. Col CLIENTE (con códigos): ${clientesDebug.join(' | ')}`)
    }

    // Sincronizar Supabase
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
    })

  } catch (err: any) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
