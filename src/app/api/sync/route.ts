import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SHEET_ID = '1Sm4Y5zSu29_wtIz9MsBQxPlnTBebuyAgQP3rg9nfvG4'
const SHEET_NAME = 'DIARIO'

function toNum(val: any): number {
  if (!val) return 0
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function parseFecha(val: any): string | null {
  if (!val) return null
  const s = String(val).trim()
  // DD/MM/YYYY
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  // YYYY-MM-DD
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
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  // Crear JWT manualmente
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  
  const signingInput = `${header}.${body}`
  
  // Importar clave privada
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
  
  // Obtener access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error('Token error: ' + JSON.stringify(tokenData))
  console.log('Token OK, scope:', tokenData.scope)
  return tokenData.access_token
}

async function readSheet(token: string): Promise<any[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) { const errBody = await res.text(); throw new Error(`Error leyendo sheet: ${res.status} ${res.statusText} - ${errBody}`) }
  const data = await res.json()
  return data.values ?? []
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  try {
    // 1. Obtener token de Google
    const token = await getGoogleToken()

    // 2. Leer el sheet
    const rows = await readSheet(token)
    if (rows.length < 2) throw new Error('El sheet está vacío')

    // 3. Encontrar encabezados
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

    // 4. Mapear columnas
    const col = (name: string) => headers.findIndex(h => h.includes(name))
    const iDate    = col('FECHA')
    const iTipo    = col('TIPO')
    const iCtaCte  = col('CTA CTE')
    const iOp      = col('OPERACI')
    const iConc    = col('CONCEPTO')
    const iEvento  = col('EVENTO')
    const iMoneda  = col('PROPIO')
    const iMonto   = col('MONTO')
    const iCCPesos  = headers.findIndex(h => h === 'CC PESOS')
    const iCCDolar  = headers.findIndex(h => h === 'CC DOLARES')
    const iCCEuro   = headers.findIndex(h => h === 'CC EUROS')
    const iCCReal   = headers.findIndex(h => h === 'CC REALES')

    // 5. Filtrar CTA CTE
    const movimientos = []
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[iTipo]) continue
      const tipo = String(row[iTipo] || '').trim().toUpperCase()
      if (tipo !== 'CTA CTE') continue
      const fecha = parseFecha(row[iDate])
      if (!fecha) continue
      const ctaCte = String(row[iCtaCte] || '').trim()
      if (!ctaCte) continue

      movimientos.push({
        fecha,
        tipo: 'CTA CTE',
        cuenta_cte: ctaCte,
        operacion: String(row[iOp] || '').trim().toUpperCase(),
        concepto: row[iConc] ? String(row[iConc]).trim() : null,
        evento: row[iEvento] ? String(row[iEvento]).trim() : null,
        moneda: mapMoneda(row[iMoneda]),
        monto: toNum(row[iMonto]),
        cc_pesos:   iCCPesos  >= 0 ? toNum(row[iCCPesos])  : 0,
        cc_dolares: iCCDolar  >= 0 ? toNum(row[iCCDolar])  : 0,
        cc_euros:   iCCEuro   >= 0 ? toNum(row[iCCEuro])   : 0,
        cc_reales:  iCCReal   >= 0 ? toNum(row[iCCReal])   : 0,
        anulado: false,
      })
    }

    if (movimientos.length === 0) throw new Error('Sin movimientos CTA CTE')

    // 6. Sincronizar Supabase
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
