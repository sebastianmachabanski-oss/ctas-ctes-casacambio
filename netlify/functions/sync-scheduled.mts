import type { Config } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

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
  if (m.includes('DOLAR')) return 'DOLARES'
  if (m.includes('PESO')) return 'PESOS'
  if (m.includes('EURO')) return 'EUROS'
  if (m.includes('REAL')) return 'REALES'
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
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signingInput = `${header}.${body}`
  const pemContents = creds.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  const binaryDer = Uint8Array.from(atob(pemContents), (c: string) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  )
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${signingInput}.${sig}`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error('No se pudo obtener token')
  return tokenData.access_token
}

export default async function handler() {
  console.log('🔄 Sync automático iniciado...')
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const token = await getGoogleToken()
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Error leyendo sheet: ${res.status}`)
    const data = await res.json()
    const rows: any[][] = data.values ?? []

    let headerIdx = -1
    let headers: string[] = []
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      if (rows[i]?.some((c: any) => String(c || '').toUpperCase().includes('FECHA'))) {
        headerIdx = i
        headers = rows[i].map((c: any) => String(c || '').trim().toUpperCase())
        break
      }
    }
    if (headerIdx < 0) throw new Error('Sin encabezados')

    const col = (name: string) => headers.findIndex(h => h.includes(name))
    const iDate   = col('FECHA')
    const iTipo   = col('TIPO')
    const iCtaCte = col('CTA CTE')
    const iOp     = col('OPERACI')
    const iConc   = col('CONCEPTO')
    const iEvento = col('EVENTO')
    const iMoneda = col('PROPIO')
    const iMonto  = col('MONTO')
    const iCCPesos  = headers.findIndex(h => h === 'CC PESOS')
    const iCCDolar  = headers.findIndex(h => h === 'CC DOLARES')
    const iCCEuro   = headers.findIndex(h => h === 'CC EUROS')
    const iCCReal   = headers.findIndex(h => h === 'CC REALES')

    const movimientos = []
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row?.[iTipo]) continue
      if (String(row[iTipo]).trim().toUpperCase() !== 'CTA CTE') continue
      const fecha = parseFecha(row[iDate])
      if (!fecha) continue
      const ctaCte = String(row[iCtaCte] || '').trim()
      if (!ctaCte) continue
      movimientos.push({
        fecha, tipo: 'CTA CTE', cuenta_cte: ctaCte,
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

    if (!movimientos.length) throw new Error('Sin movimientos')

    await supabase.from('diario').delete().eq('tipo', 'CTA CTE').eq('anulado', false)
    for (let i = 0; i < movimientos.length; i += 500) {
      const { error } = await supabase.from('diario').insert(movimientos.slice(i, i + 500))
      if (error) throw new Error(error.message)
    }

    const cuentas = Array.from(new Set(movimientos.map(m => m.cuenta_cte)))
    for (const nombre of cuentas) {
      await supabase.from('cuentas_corrientes')
        .upsert({ nombre, activo: true }, { onConflict: 'nombre', ignoreDuplicates: true })
    }

    console.log(`✅ Sync OK: ${movimientos.length} movimientos`)
  } catch (err: any) {
    console.error('❌ Sync error:', err.message)
  }
}

export const config: Config = {
  schedule: "*/15 * * * *"
}
