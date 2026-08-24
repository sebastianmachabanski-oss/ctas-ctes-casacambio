// Sync CAJA — planilla (Drive/Sheets) → base de datos. Ver docs/SINCRONIZACION.md.
import { createClient } from "@supabase/supabase-js"
import { calcularMovimiento, COLUMNAS_SALIDA } from "../../src/lib/motor-calculo/index"
import { calcularHuella, AUTOR_PLANILLA } from "../../src/lib/auditoria"

// Función BACKGROUND (hasta 15 min). Hace el sync real en dos modos:
//   - full:        recarga completa (borra todo CTA CTE y reinserta todo)
//   - incremental: solo la ventana de los últimos WINDOW_DAYS días
// Se invoca desde las funciones programadas (cron-sync-*.mts), nunca por cron directo,
// porque las scheduled tienen un límite de 30s y esto puede tardar más.
//
// El Google Sheet es el ÚNICO origen (regla del dominio, 11/8/2026). El camino al .xlsx
// viejo de Drive existió hasta hoy conmutable por la env var SYNC_SOURCE, con 'excel' por
// DEFECTO: si la variable faltaba, el sync recargaba la base entera desde el archivo
// equivocado sin ningún aviso.
const SHEET_ID   = '1BxW5TGUbi12LHATOIjnkBc71GY9JZARsy5_LP5Sl1CE'
const SHEET_NAME = 'CAJA'
const ACTIVE_FILE_ID = SHEET_ID
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

// Como parseMonto pero SIN redondear a 2 decimales: para cotizaciones y porcentajes,
// donde los decimales finos importan (ej. cruce EUR/USD 1,23495 — redondeado daría 1,23
// y el cálculo dejaría de coincidir con la planilla).
function parseNumeroPreciso(val: any): number | null {
  if (val === null || val === undefined || String(val).trim() === '') return null
  if (typeof val === 'number' && isFinite(val)) return val
  const redondeado = parseMonto(val)
  return redondeado === 0 && String(val).trim() !== '0' ? null : redondeado
}

// Descarta una fecha que no exista de verdad. Sin esto, una sola celda mal escrita
// hacía fallar el insert COMPLETO de `diario` (16.500 filas) con un error de Postgres;
// mejor saltear la fila y cargar el resto.
function fechaValida(iso: string | null): string | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [y, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const d = new Date(Date.UTC(y, mes - 1, dia))
  if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) return null
  return iso
}

function parseFecha(val: any): string | null {
  return fechaValida(parseFechaCruda(val))
}

function parseFechaCruda(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val).trim()
  // Número de serie de fecha (Excel/Sheets): días desde 1899-12-30. Defensa por si alguna
  // celda viene sin formato de fecha.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000)
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
  }
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Año de dos dígitos. Formato argentino DÍA/MES/AÑO, igual que la rama de arriba:
  // hasta el 13/8/2026 esta rama leía mes/día e inventaba fechas como "2024-29-11",
  // que hacían fallar la carga entera de `diario` con "date/time field value out of range".
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{2}$/)) {
    const [d, m, y] = s.split('/')
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
    // Drive (metadata/descarga del .xlsx) + Sheets (lectura del Sheet nativo).
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
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
// Funciona igual para el .xlsx y para el Google Sheet (ambos son archivos de Drive).
async function getFileModifiedTime(token: string): Promise<string | null> {
  const url = `https://www.googleapis.com/drive/v3/files/${ACTIVE_FILE_ID}?fields=modifiedTime`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const data = await res.json()
  return data.modifiedTime ?? null
}

// NO existe una lectura FORMATEADA a propósito: la fecha "01/09/2026" no se puede
// desambiguar entre 1 de septiembre y 9 de enero, y eso dejó `diario` con el día y el mes
// cambiados. Todo se lee sin formato, donde la fecha llega como número de serie.
async function readFromSheetsUnformatted(token: string): Promise<any[][]> {
  const range = encodeURIComponent(SHEET_NAME)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}` +
              `?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Error leyendo Google Sheet (raw): ${res.status} ${await res.text()}`)
  const data = await res.json()
  return (data.values ?? []) as any[][]
}

function findHeaderRow(rows: any[][]): { headerIdx: number; headers: string[] } {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i]?.some((c: any) => String(c || '').toUpperCase().includes('FECHA'))) {
      return { headerIdx: i, headers: rows[i].map((c: any) => String(c || '').trim().toUpperCase()) }
    }
  }
  throw new Error('No se encontraron encabezados')
}

// Valores que aparecen en CLIENTE/CAJA pero NO son nombres de cliente reales: son los
// marcadores de tipo de la otra columna, o la fila libre sin completar.
const NO_ES_CLIENTE = new Set(['CTA CTE', 'CAJA', 'OPERACION?', ''])

// Unión de los nombres reales de cliente, vengan de la columna CLIENTE (cuando el
// movimiento es de CAJA, ahí queda el nombre real) o de la columna CAJA (cuando el
// movimiento es de CTA CTE, ahí queda el nombre real) — sin importar el tipo de
// movimiento, a diferencia de parseMovimientos que solo mira filas CTA CTE.
function parseClientes(rows: any[][]): string[] {
  const { headerIdx, headers } = findHeaderRow(rows)
  const col = (name: string) => headers.findIndex(h => h.includes(name))
  const iCliente = col('CLIENTE')
  const iCaja    = col('CAJA')

  const nombres = new Set<string>()
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    for (const idx of [iCliente, iCaja]) {
      if (idx < 0) continue
      const val = String(row[idx] ?? '').trim()
      if (val && !NO_ES_CLIENTE.has(val.toUpperCase())) nombres.add(val)
    }
  }
  return Array.from(nombres)
}

function parseMovimientos(rows: any[][]): any[] {
  const { headerIdx, headers } = findHeaderRow(rows)
  const col = (name: string) => headers.findIndex(h => h.includes(name))
  const iDate    = col('FECHA')
  const iCliente = col('CLIENTE')
  const iCtaCte  = col('CAJA')
  const iOpTipo  = col('OPERACI')
  const iPropio  = col('PROPIO')
  const iExterno = col('EXTERNO')
  const iMonto   = col('MONTO')
  const iNotas   = col('NOTAS')
  // Columnas de CUENTA CORRIENTE, no las de caja.
  //
  // Hasta el 14/8/2026 esto leía 'PESOS'/'DOLARES'/'EUROS'/'REALES', que son las columnas
  // de CAJA. Dos consecuencias:
  //   - Los signos salían todos invertidos, porque la planilla llena la columna de caja y
  //     la de cuenta corriente con signos opuestos. Parecía una convención deliberada.
  //   - Cuando las dos patas están en monedas distintas, el importe caía en la moneda
  //     equivocada. Ejemplo real (fila 12514): EGRESAN DOLARES → PESOS por 13.000; la
  //     planilla lo pone en CC PESOS y la app lo ponía en dólares.
  //
  // La moneda de la cuenta corriente la define la columna EXTERNO, no PROPIO, y la
  // planilla ya la resolvió al calcular estas columnas: alcanza con leerlas.
  const iCCPesos = headers.findIndex(h => h === 'CC PESOS')
  const iCCDolar = headers.findIndex(h => h === 'CC DOLARES')
  const iCCEuro  = headers.findIndex(h => h === 'CC EUROS')
  const iCCReal  = headers.findIndex(h => h === 'CC REALES')

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

async function insertEnParalelo(supabase: any, movimientos: any[], tabla = 'diario') {
  const batches: any[][] = []
  for (let i = 0; i < movimientos.length; i += BATCH) batches.push(movimientos.slice(i, i + BATCH))
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const results = await Promise.all(
      batches.slice(i, i + CONCURRENCY).map(b => supabase.from(tabla).insert(b))
    )
    const failed = results.find((r: any) => r.error)
    if (failed?.error) throw new Error(`Error insertando en ${tabla}: ` + failed.error.message)
  }
}

// TODAS las filas de CAJA (compras, ventas, gastos, cta cte, saldos iniciales, etc.),
// con los campos crudos y las 10 columnas que calcula la planilla — espejo completo para
// la tabla `movimientos_caja`, sobre la que se construyen los reportes de la app.
// Exportada para poder validarla con scripts/validar-sync-caja.mts sobre datos reales.
export function parseMovimientosCaja(rows: any[][]): any[] {
  const { headerIdx, headers } = findHeaderRow(rows)
  const col = (name: string) => headers.findIndex(h => h.includes(name))
  const colExacta = (name: string) => headers.findIndex(h => h === name)
  const iDate    = col('FECHA')
  const iCliente = col('CLIENTE')
  const iCaja    = col('CAJA')
  const iOp      = col('OPERACI')   // 'OPERACIÓN' (la primera; no confunde con OPERACION PROPIA/EXTERNA)
  const iPropio  = col('PROPIO')
  const iExterno = col('EXTERNO')
  const iMonto   = col('MONTO')
  const iCot     = colExacta('COT')
  const iCotExt  = colExacta('COTEXT')  // cotización EFECTIVA (la que usa la fórmula; ver migración cot_efectiva)
  const iCosto   = col('COSTO')
  const iDebe    = colExacta('DEBE')
  const iNotas   = col('NOTAS')
  const iCuenta  = colExacta('CUENTA')
  const iCalc: Record<string, number> = {
    pesos: colExacta('PESOS'), cheques: colExacta('CHEQUES'), dolares: colExacta('DOLARES'),
    euros: colExacta('EUROS'), reales: colExacta('REALES'), banco: colExacta('BANCO'),
    cc_pesos: colExacta('CC PESOS'), cc_dolares: colExacta('CC DOLARES'),
    cc_euros: colExacta('CC EUROS'), cc_reales: colExacta('CC REALES'),
  }

  const movimientos: any[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const fecha = parseFecha(row[iDate])
    if (!fecha) continue
    const operacion = String(row[iOp] ?? '').trim().toUpperCase()
    if (!operacion) continue
    // Filas pre-armadas para la carga desde la app (fecha pre-completada, sin datos):
    // no son movimientos reales. Es el mismo marcador que usa excel-write.
    if (operacion === 'OPERACION?') continue

    const clienteRaw = String(row[iCliente] ?? '').trim()
    const esCtaCte = clienteRaw.toUpperCase() === 'CTA CTE'
    // En filas CAJA el nombre está en la columna CLIENTE (texto libre, clientes eventuales,
    // NO normalizado — decisión de negocio); en filas CTA CTE está en la columna CAJA.
    const cliente = esCtaCte ? String(row[iCaja] ?? '').trim() : clienteRaw

    const mov: any = {
      fila_sheet: i + 1,
      fecha,
      tipo: esCtaCte ? 'CTA CTE' : 'CAJA',
      cliente: cliente || null,
      operacion,
      propio:  iPropio  >= 0 && row[iPropio]  ? String(row[iPropio]).trim().toUpperCase()  : null,
      externo: iExterno >= 0 && row[iExterno] ? String(row[iExterno]).trim().toUpperCase() : null,
      monto: parseMonto(row[iMonto]),
      cot:          iCot    >= 0 ? parseNumeroPreciso(row[iCot])    : null,
      cot_efectiva: iCotExt >= 0 ? parseNumeroPreciso(row[iCotExt]) : null,
      costo_pct:    iCosto  >= 0 ? parseNumeroPreciso(row[iCosto])  : null,
      debe:  iDebe  >= 0 && String(row[iDebe] ?? '').trim()  ? String(row[iDebe]).trim()  : null,
      notas: iNotas >= 0 && String(row[iNotas] ?? '').trim() ? String(row[iNotas]).trim() : null,
      cuenta: iCuenta >= 0 && String(row[iCuenta] ?? '').trim() ? String(row[iCuenta]).trim().toUpperCase() : null,
      // Procedencia: la planilla no tiene USDT; todo lo que viene del Sheet es 'sheet'
      // (usdt = 0). Las filas 'app' (USDT) las inserta la app y el sync no las toca.
      origen: 'sheet',
      usdt: 0,
      // Estas filas NO las cargó nadie en la app: vienen de la planilla. Se marcan con
      // una leyenda de sistema, nunca con el nombre de una persona — atribuirle a
      // alguien 33.000 filas que no cargó invalidaría la auditoría entera.
      // Si la fila la había cargado un usuario desde la app, más abajo se le restituye
      // el autor real (restituirAutores).
      creado_por: AUTOR_PLANILLA,
    }
    for (const [campo, idx] of Object.entries(iCalc)) {
      mov[campo] = idx >= 0 ? parseMonto(row[idx]) : 0
    }
    movimientos.push(mov)
  }
  return movimientos
}

// Validación EN PARALELO del motor de cálculo: recalcula cada fila con el motor de la
// app y la compara contra las 10 columnas que calculó la planilla. No afecta lo que se
// guarda — es el período de prueba definido en docs/MOTOR-CALCULO.md antes de que el
// motor reemplace a las fórmulas. El resumen queda en sync_state.last_run (campo motor).
const CAMPO_MOTOR: Record<string, string> = {
  'PESOS': 'pesos', 'CHEQUES': 'cheques', 'DOLARES': 'dolares', 'EUROS': 'euros',
  'REALES': 'reales', 'USDT': 'usdt', 'BANCO': 'banco', 'CC PESOS': 'cc_pesos', 'CC DOLARES': 'cc_dolares',
  'CC EUROS': 'cc_euros', 'CC REALES': 'cc_reales',
}
function validarMotor(movimientos: any[]): any {
  let ok = 0, dif = 0, error = 0
  const ejemplos: string[] = []
  for (const m of movimientos) {
    try {
      const r = calcularMovimiento({
        tipo: m.tipo, operacion: m.operacion, propio: m.propio ?? '', externo: m.externo ?? '',
        // La planilla calcula con COTEXT (cot_efectiva); COT es lo que tipeó el operador.
        monto: m.monto, cotizacion: m.cot_efectiva ?? m.cot, costoPorcentaje: m.costo_pct,
      })
      const difs = COLUMNAS_SALIDA.filter(c => Math.abs(r.valores[c] - (m[CAMPO_MOTOR[c]] ?? 0)) > 0.011)
      if (difs.length) {
        dif++
        if (ejemplos.length < 5) ejemplos.push(`fila ${m.fila_sheet} ${m.fecha} ${m.operacion}: ${difs.join(',')}`)
      } else ok++
    } catch { error++ }
  }
  const total = movimientos.length || 1
  return { ok, dif, error, coincidencia: Math.round((ok / total) * 10000) / 100 + '%', ejemplos }
}

// Sincroniza `movimientos_caja`. Tolerante: si la tabla todavía no existe (falta correr
// la migración), avisa y sigue — el resto del sync no se ve afectado.
// Devuelve un resumen para registrar en sync_state, incluida la validación automática:
// tras insertar compara conteo y sumas por columna (vía caja_totales) contra lo parseado.
// Restituye el autor real de las filas que se habían cargado DESDE LA APP.
//
// Problema que resuelve: el sync borra y reinserta las filas de la planilla, así que una
// transacción cargada por un usuario vuelve marcada como carga inicial y el autor se
// pierde. La auditoría (que el sync no toca) sí lo conserva: se busca por `huella` —
// identificación por contenido, estable aunque el uuid se regenere — y se reescribe.
//
// Best effort: si la fila volvió distinta de la planilla, la huella no coincide y queda
// la leyenda de carga inicial. Nunca inventa un autor.
async function restituirAutores(supabase: any, lote: any[]): Promise<number> {
  const altas = await supabase
    .from('auditoria')
    .select('huella, usuario_nombre, ts')
    .eq('accion', 'alta')
    .eq('actor', 'usuario')
    .not('huella', 'is', null)
  // Si la tabla no existe todavía (migración sin correr), el sync sigue igual.
  if (altas.error) {
    console.warn('⚠️  auditoría no disponible, no se restituyen autores:', altas.error.message)
    return 0
  }
  if (!altas.data?.length) return 0

  // huella → autor. Si hubiera más de un alta con la misma huella, gana la más reciente.
  const porHuella = new Map<string, { nombre: string; ts: string }>()
  for (const a of altas.data as any[]) {
    const prev = porHuella.get(a.huella)
    if (!prev || a.ts > prev.ts) porHuella.set(a.huella, { nombre: a.usuario_nombre, ts: a.ts })
  }

  let restituidas = 0
  for (const mov of lote) {
    const hit = porHuella.get(calcularHuella(mov))
    if (hit) {
      mov.creado_por = hit.nombre
      mov.creado_at = hit.ts
      restituidas++
    }
  }
  return restituidas
}

async function syncCaja(
  supabase: any, todos: any[], mode: 'full' | 'incremental', windowStart: string
): Promise<any> {
  const probe = await supabase.from('movimientos_caja').select('id', { head: true, count: 'exact' }).limit(1)
  if (probe.error) {
    console.warn('⚠️  movimientos_caja no disponible (¿falta la migración?):', probe.error.message)
    return { skipped: true, motivo: probe.error.message }
  }

  const lote = mode === 'full' ? todos : todos.filter(m => m.fecha >= windowStart)
  // El sync SOLO gestiona las filas de la planilla (origen='sheet'). Las cargadas en la
  // app (origen='app', ej. USDT) nunca se borran: no existen en el Sheet y se perderían.
  if (mode === 'full') {
    const del = await supabase.from('movimientos_caja').delete().neq('origen', 'app')
    if (del.error) throw new Error('Error vaciando movimientos_caja: ' + del.error.message)
  } else {
    const del = await supabase.from('movimientos_caja').delete().neq('origen', 'app').gte('fecha', windowStart)
    if (del.error) throw new Error('Error borrando ventana de movimientos_caja: ' + del.error.message)
  }
  // Antes de insertar: devolverle el autor a las filas que se cargaron desde la app.
  const autoresRestituidos = await restituirAutores(supabase, lote)

  await insertEnParalelo(supabase, lote, 'movimientos_caja')

  // Validación automática de la corrida: lo que quedó en la base debe coincidir EXACTO
  // con lo parseado de la planilla (conteo + suma de cada columna de moneda).
  const desde = mode === 'full' ? null : windowStart
  const { data: tot, error: totError } = await supabase.rpc('caja_totales', { p_desde: desde, p_hasta: null })
  if (totError || !tot) {
    console.warn('⚠️  No se pudo validar (caja_totales):', totError?.message)
    return { procesados: lote.length, validado: null, autores_restituidos: autoresRestituidos }
  }
  const columnas = ['pesos','cheques','dolares','euros','reales','banco','cc_pesos','cc_dolares','cc_euros','cc_reales']
  const esperado: Record<string, number> = { filas: lote.length }
  for (const c of columnas) esperado[c] = Math.round(lote.reduce((s, m) => s + (m[c] || 0), 0) * 100) / 100
  const difs = Object.entries(esperado)
    .filter(([k, v]) => Math.abs(Number(tot[k] ?? 0) - v) > 0.01)
    .map(([k, v]) => `${k}: db=${tot[k]} esperado=${v}`)
  const motor = validarMotor(lote)
  console.log(`🔬 Motor vs planilla: ${motor.coincidencia} (${motor.dif} difs, ${motor.error} errores)`)
  if (difs.length) {
    console.error('❌ Validación movimientos_caja con diferencias:', difs.join(' | '))
    return { procesados: lote.length, validado: false, diferencias: difs, motor, autores_restituidos: autoresRestituidos }
  }
  console.log(`✅ movimientos_caja OK: ${lote.length} filas, sumas validadas contra la planilla`)
  return { procesados: lote.length, validado: true, motor, autores_restituidos: autoresRestituidos }
}

async function upsertCuentas(supabase: any, movimientos: any[]) {
  const cuentas = Array.from(new Set(movimientos.map(m => m.cuenta_cte)))
  if (!cuentas.length) return 0
  const { error } = await supabase.from('cuentas_corrientes')
    .upsert(cuentas.map(nombre => ({ nombre, activo: true })), { onConflict: 'nombre', ignoreDuplicates: true })
  if (error) throw new Error('Error actualizando cuentas: ' + error.message)
  return cuentas.length
}

// Tolerante: si la tabla `clientes` todavía no existe (falta correr la migración), no
// rompe el sync — solo se pierde la actualización del selector de Nueva Transacción.
async function upsertClientes(supabase: any, nombres: string[]): Promise<number> {
  if (!nombres.length) return 0
  try {
    const { error } = await supabase.from('clientes')
      .upsert(nombres.map(nombre => ({ nombre, activo: true })), { onConflict: 'nombre', ignoreDuplicates: true })
    if (error) { console.error('⚠️  No se pudo actualizar clientes:', error.message); return 0 }
    return nombres.length
  } catch { return 0 }
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
    return setSyncState(supabase, 'last_run', JSON.stringify({ started_at: startedAt, at, duration_s, source: 'sheets', ...payload })).catch(() => {})
  }

  try {
    console.log(`🔎 Fuente de datos: Google Sheet (${ACTIVE_FILE_ID})`)
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

    // Se lee SIN formato (UNFORMATTED) y esa lectura alimenta TODO.
    //
    // Antes `diario` se armaba con la lectura FORMATEADA, o sea con la fecha tal como se
    // ve en pantalla, y había que adivinar si "01/09/2026" era 1 de septiembre o 9 de
    // enero. La planilla la muestra como MES/DÍA y el parser asumía DÍA/MES, así que
    // todas las fechas con día ≤ 12 quedaban con el día y el mes cambiados. Solo se
    // notaban las que caían en el futuro (742 filas el 13/8/2026); el resto estaba mal
    // igual, en silencio.
    //
    // Sin formato, la celda llega como número de serie: no hay ambigüedad posible.
    // Es la misma regla que ya seguía `movimientos_caja` y la que manda el dominio.
    const rows = await readFromSheetsUnformatted(token)
    if (rows.length < 2) throw new Error('El sheet está vacío')
    const todos = parseMovimientos(rows)
    // Lista de clientes para el selector de Nueva Transacción: se recalcula siempre sobre
    // el sheet completo (no depende de la ventana del incremental ni del filtro CTA CTE).
    const nClientes = await upsertClientes(supabase, parseClientes(rows))

    // Espejo completo de CAJA → movimientos_caja (todas las operaciones, no solo CTA CTE).
    // Corre en el mismo modo (full/incremental) y valida sus propias sumas al terminar.
    const rowsCaja = rows
    const desdeCaja = new Date()
    desdeCaja.setDate(desdeCaja.getDate() - WINDOW_DAYS)
    const caja = await syncCaja(supabase, parseMovimientosCaja(rowsCaja), mode, desdeCaja.toISOString().slice(0, 10))

    if (mode === 'full') {
      if (!todos.length) throw new Error('Sin movimientos CTA CTE')
      // `neq('origen','app')`: no tocar lo que cargó la app y NO existe en el Sheet
      // (USDT, y cualquier alta cuya replicación a la planilla haya fallado). Si se
      // borrara, no habría de dónde recuperarlo. Mismo criterio que movimientos_caja.
      const { error: delError } = await supabase.from('diario').delete()
        .eq('tipo', 'CTA CTE').neq('origen', 'app')
      if (delError) throw new Error('Error borrando datos previos: ' + delError.message)
      await insertEnParalelo(supabase, todos)
      const nCuentas = await upsertCuentas(supabase, todos)
      if (modifiedTime) await setSyncState(supabase, 'caja_modified_time', modifiedTime)
      console.log(`✅ Full OK: ${todos.length} movimientos, ${nCuentas} cuentas, ${nClientes} clientes`)
      await recordRun({ ok: true, mode, procesados: todos.length, caja })
      return new Response('ok-full', { status: 200 })
    }

    // Incremental: solo la ventana de los últimos WINDOW_DAYS días.
    const desde = new Date()
    desde.setDate(desde.getDate() - WINDOW_DAYS)
    const windowStart = desde.toISOString().slice(0, 10)

    const ventana = todos.filter(m => m.fecha >= windowStart)
    const { error: delError } = await supabase
      .from('diario').delete().eq('tipo', 'CTA CTE').neq('origen', 'app').gte('fecha', windowStart)
    if (delError) throw new Error('Error borrando ventana: ' + delError.message)
    await insertEnParalelo(supabase, ventana)
    const nCuentas = await upsertCuentas(supabase, ventana)
    if (modifiedTime) await setSyncState(supabase, 'caja_modified_time', modifiedTime)
    console.log(`✅ Incremental OK (desde ${windowStart}): ${ventana.length} movimientos, ${nCuentas} cuentas, ${nClientes} clientes`)
    await recordRun({ ok: true, mode, procesados: ventana.length, caja })
    return new Response('ok-incremental', { status: 200 })

  } catch (err: any) {
    console.error('❌ Sync error:', err.message)
    await recordRun({ ok: false, mode, error: err.message })
    return new Response('error: ' + err.message, { status: 500 })
  }
}
