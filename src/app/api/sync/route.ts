import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleToken } from '@/lib/google'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx')

export const maxDuration = 60

const FILE_ID    = '1tuURACcfs09rRkynmVLqLD90Je5r-u58'
const SHEET_NAME = 'CAJA'

function parseMonto(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number' && isFinite(val)) {
    return Math.round(val * 100) / 100
  }
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
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{2}$/)) {
    const [m, d, y] = s.split('/')
    return `${parseInt(y) + 2000}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
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


async function readSheet(token: string): Promise<any[][]> {
  const url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Error descargando archivo: ${res.status} ${res.statusText} - ${await res.text()}`)
  const buffer = await res.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Pestaña "${SHEET_NAME}" no encontrada. Disponibles: ${workbook.SheetNames.join(', ')}`)
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, cellDates: true })
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

    const movimientos = []
    const monedasIncompletas: { fecha: string; cuenta: string; operacion: string; falta: string }[] = []

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[iCliente]) continue
      const cliente = String(row[iCliente] || '').trim().toUpperCase()
      if (cliente !== 'CTA CTE') continue
      const fecha = parseFecha(row[iDate])
      if (!fecha) continue
      const ctaCte = String(row[iCtaCte] || '').trim()
      if (!ctaCte) continue

      // Para que la planilla calcule bien el saldo en cuenta corriente, PROPIO y EXTERNO
      // deben estar completos. Si falta alguno, el Excel ignora la fila al totalizar.
      const propioVacio  = !String(row[iPropio]  || '').trim()
      const externoVacio = !String(row[iExterno] || '').trim()
      if (propioVacio || externoVacio) {
        monedasIncompletas.push({
          fecha,
          cuenta: ctaCte,
          operacion: String(row[iOpTipo] || '').trim().toUpperCase(),
          falta: propioVacio && externoVacio ? 'PROPIO y EXTERNO' : propioVacio ? 'PROPIO' : 'EXTERNO',
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
        monto:      parseMonto(row[iMonto]),
        cc_pesos:   iCCPesos >= 0 ? parseMonto(row[iCCPesos]) : 0,
        cc_dolares: iCCDolar >= 0 ? parseMonto(row[iCCDolar]) : 0,
        cc_euros:   iCCEuro  >= 0 ? parseMonto(row[iCCEuro])  : 0,
        cc_reales:  iCCReal  >= 0 ? parseMonto(row[iCCReal])  : 0,
        anulado: false,
      })
    }

    if (movimientos.length === 0) {
      const clientes = Array.from(new Set(
        rows.slice(headerIdx + 1, headerIdx + 50).map(r => r[iCliente] ? String(r[iCliente]).trim() : '(vacío)')
      ))
      throw new Error(`Sin movimientos CTA CTE. Valores en col CLIENTE: ${clientes.join(', ')}`)
    }

    const { error: delError } = await supabase
      .from('diario')
      .delete()
      .eq('tipo', 'CTA CTE')
    if (delError) throw new Error('Error borrando datos previos: ' + delError.message)

    // Insertar en lotes grandes y en paralelo (con límite de concurrencia)
    // para reducir las idas y vueltas a la base.
    const BATCH = 1000
    const CONCURRENCY = 8
    const batches: any[][] = []
    for (let i = 0; i < movimientos.length; i += BATCH) batches.push(movimientos.slice(i, i + BATCH))
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const results = await Promise.all(
        batches.slice(i, i + CONCURRENCY).map(b => supabase.from('diario').insert(b))
      )
      const failed = results.find(r => r.error)
      if (failed?.error) throw new Error('Error insertando: ' + failed.error.message)
    }

    // Upsert masivo de cuentas en una sola llamada (antes era una por cuenta).
    const cuentasSet = new Set(movimientos.map(m => m.cuenta_cte))
    const cuentasRows = Array.from(cuentasSet).map(nombre => ({ nombre, activo: true }))
    if (cuentasRows.length) {
      const { error: ccError } = await supabase
        .from('cuentas_corrientes')
        .upsert(cuentasRows, { onConflict: 'nombre', ignoreDuplicates: true })
      if (ccError) throw new Error('Error actualizando cuentas: ' + ccError.message)
    }

    return NextResponse.json({
      success: true,
      movimientos: movimientos.length,
      cuentas: cuentasSet.size,
      ultimaSync: new Date().toISOString(),
      monedasIncompletas,
    })

  } catch (err: any) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
