// Sync CAJA — planilla Excel (Drive) → base de datos. Ver docs/SINCRONIZACION.md.
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

// Función BACKGROUND (hasta 15 min). Hace el sync real en dos modos:
//   - full:        recarga completa (borra todo CTA CTE y reinserta todo)
//   - incremental: solo la ventana de los últimos WINDOW_DAYS días
// Se invoca desde las funciones programadas (cron-sync-*.mts), nunca por cron directo,
// porque las scheduled tienen un límite de 30s y esto puede tardar más.
const FILE_ID     = '1tuURACcfs09rRkynmVLqLD90Je5r-u58'
const SHEET_NAME  = 'CAJA'
const WINDOW_DAYS = 30
const BATCH       = 1000
const CONCURRENCY = 8

function parseMonto(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number' && isFinite(val)) return Math.round(val * 100) / 100
  let s = String(val).trim()
  if (!s || s === '-') return 0
  s = s.replace(/\s/g, '').replace(/[%$€£]/g, '')
  const neg = s.startsWith('(') && s.endsWith(')')
  if (neg) s = s.slice(1, -1)
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (s.includes('.') && !s.includes(',')) {
    const parts = s.replace(/^-/, '').split('.')
    if (parts.length > 1 && parts.slice(1).every((p: string) => p.length === 3)) s = s.replace(/\./g, '')
  } else if (s.includes(',') && !s.includes('.')) {
    const parts = s.replace(/^-/, '').split(',')
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = s.replace(/,/g, '')
    else s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return neg ? -n : n
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
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{2}$/)) {
    const [m, d, y] = s.split('/')
    return `${parseInt(y) + 2000}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
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
  const pemContents = (creds.private_key as string)
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput)
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

// Metadata barata: fecha de última modificación del archivo (para saltar trabajo si no cambió).
async function getFileModifiedTime(token: string): Promise<string | null> {
  const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=modifiedTime`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const data = await res.json()
  return data.modifiedTime ?? null
}

async function readSheetRows(token: string): Promise<any[][]> {
  const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Error descargando archivo: ${res.status} ${res.statusText}`)
  const buffer = await res.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Pestaña "${SHEET_NAME}" no encontrada`)
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, cellDates: true })
}

function parseMovimientos(rows: any[][]): any[] {
  let headerIdx = -1
  let headers: string[] = []
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i]?.some((c: any) => String(c || '').toUpperCase().includes('FECHA'))) {
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
  const iCCPesos = headers.findIndex(h => h === 'PESOS')
  const iCCDolar = headers.findIndex(h => h === 'DOLARES')
  const iCCEuro  = headers.findIndex(h => h === 'EUROS')
  const iCCReal  = headers.findIndex(h => h === 'REALES')

  const movimientos: any[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[iCliente]) continue
    if (String(row[iCliente]).trim().toUpperCase() !== 'CTA CTE') continue
    const fecha = parseFecha(row[iDate])
    if (!fecha) continue
    const ctaCte = String(row[iCtaCte] || '').trim()
    if (!ctaCte) continue

    movimientos.push({
      fecha,
      tipo: 'CTA CTE',
      cuenta_cte: ctaCte,
      operacion: String(row[iOpTipo] || '').trim().toUpperCase(),
      concepto: row[iPropio] ? `${String(row[iPropio]).trim()} → ${String(row[iExterno] || '').trim()}` : null,
      evento: row[iNotas] ? String(row[iNotas]).trim() : null,
      moneda: mapMoneda(row[iPropio]),
      monto: parseMonto(row[iMonto]),
      cc_pesos:   iCCPesos >= 0 ? parseMonto(row[iCCPesos]) : 0,
      cc_dolares: iCCDolar >= 0 ? parseMonto(row[iCCDolar]) : 0,
      cc_euros:   iCCEuro  >= 0 ? parseMonto(row[iCCEuro])  : 0,
      cc_reales:  iCCReal  >= 0 ? parseMonto(row[iCCReal])  : 0,
      anulado: false,
    })
  }
  return movimientos
}

async function insertEnParalelo(supabase: any, movimientos: any[]) {
  const batches: any[][] = []
  for (let i = 0; i < movimientos.length; i += BATCH) batches.push(movimientos.slice(i, i + BATCH))
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const results = await Promise.all(
      batches.slice(i, i + CONCURRENCY).map(b => supabase.from('diario').insert(b))
    )
    const failed = results.find((r: any) => r.error)
    if (failed?.error) throw new Error('Error insertando: ' + failed.error.message)
  }
}

async function upsertCuentas(supabase: any, movimientos: any[]) {
  const cuentas = Array.from(new Set(movimientos.map(m => m.cuenta_cte)))
  if (!cuentas.length) return 0
  const { error } = await supabase.from('cuentas_corrientes')
    .upsert(cuentas.map(nombre => ({ nombre, activo: true })), { onConflict: 'nombre', ignoreDuplicates: true })
  if (error) throw new Error('Error actualizando cuentas: ' + error.message)
  return cuentas.length
}

// Lectura/escritura tolerante del estado de sync. Si la tabla sync_state no existe
// todavía, simplemente no se aplica la optimización de modifiedTime (no rompe nada).
async function getSyncState(supabase: any, key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('sync_state').select('value').eq('key', key).maybeSingle()
    if (error) return null
    return data?.value ?? null
  } catch { return null }
}
async function setSyncState(supabase: any, key: string, value: string) {
  try {
    await supabase.from('sync_state').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch { /* tabla ausente: ignorar */ }
}

export default async function handler(req: Request) {
  // Seguridad: solo se ejecuta con el secreto compartido (lo pasan los cron triggers).
  const url = new URL(req.url)
  const mode: 'full' | 'incremental' = url.searchParams.get('mode') === 'full' ? 'full' : 'incremental'
  const force = url.searchParams.get('force') === '1'  // ignora el chequeo de modifiedTime (botón manual)
  const secret = req.headers.get('x-sync-secret') || url.searchParams.get('secret')
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const startedAt = new Date().toISOString()
  // Registra el fin de CADA corrida (ok, skip o error). El botón de la app hace polling
  // de esta marca para confirmar que terminó —y para mostrar el error si falló—.
  const recordRun = (payload: any) => {
    const at = new Date().toISOString()
    const duration_s = Math.round((Date.parse(at) - Date.parse(startedAt)) / 1000)
    return setSyncState(supabase, 'last_run', JSON.stringify({ started_at: startedAt, at, duration_s, ...payload })).catch(() => {})
  }

  try {
    const token = await getGoogleToken()

    // En modo incremental, si el archivo no cambió desde la última corrida, no hacemos nada.
    const modifiedTime = await getFileModifiedTime(token)
    if (mode === 'incremental' && modifiedTime && !force) {
      const last = await getSyncState(supabase, 'caja_modified_time')
      if (last === modifiedTime) {
        console.log('⏭️  Incremental: planilla sin cambios, se omite.')
        await recordRun({ ok: true, mode, skipped: true })
        return new Response('skipped', { status: 200 })
      }
    }

    const rows = await readSheetRows(token)
    if (rows.length < 2) throw new Error('El sheet está vacío')
    const todos = parseMovimientos(rows)

    if (mode === 'full') {
      if (!todos.length) throw new Error('Sin movimientos CTA CTE')
      const { error: delError } = await supabase.from('diario').delete().eq('tipo', 'CTA CTE')
      if (delError) throw new Error('Error borrando datos previos: ' + delError.message)
      await insertEnParalelo(supabase, todos)
      const nCuentas = await upsertCuentas(supabase, todos)
      if (modifiedTime) await setSyncState(supabase, 'caja_modified_time', modifiedTime)
      console.log(`✅ Full OK: ${todos.length} movimientos, ${nCuentas} cuentas`)
      await recordRun({ ok: true, mode, procesados: todos.length })
      return new Response('ok-full', { status: 200 })
    }

    // Incremental: solo la ventana de los últimos WINDOW_DAYS días.
    const desde = new Date()
    desde.setDate(desde.getDate() - WINDOW_DAYS)
    const windowStart = desde.toISOString().slice(0, 10)

    const ventana = todos.filter(m => m.fecha >= windowStart)
    const { error: delError } = await supabase
      .from('diario').delete().eq('tipo', 'CTA CTE').gte('fecha', windowStart)
    if (delError) throw new Error('Error borrando ventana: ' + delError.message)
    await insertEnParalelo(supabase, ventana)
    const nCuentas = await upsertCuentas(supabase, ventana)
    if (modifiedTime) await setSyncState(supabase, 'caja_modified_time', modifiedTime)
    console.log(`✅ Incremental OK (desde ${windowStart}): ${ventana.length} movimientos, ${nCuentas} cuentas`)
    await recordRun({ ok: true, mode, procesados: ventana.length })
    return new Response('ok-incremental', { status: 200 })

  } catch (err: any) {
    console.error('❌ Sync error:', err.message)
    await recordRun({ ok: false, mode, error: err.message })
    return new Response('error: ' + err.message, { status: 500 })
  }
}
