import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

const ONEDRIVE_URL = process.env.ONEDRIVE_EXCEL_URL!

// Mapeo de nombres de moneda del Excel a código
function mapMoneda(moneda: string | null): string {
  if (!moneda) return 'DOLARES'
  const m = String(moneda).trim().toUpperCase()
  if (m.includes('DOLAR') || m === 'USD') return 'DOLARES'
  if (m.includes('PESO') || m === 'ARS') return 'PESOS'
  if (m.includes('EURO') || m === 'EUR') return 'EUROS'
  if (m.includes('REAL') || m === 'BRL') return 'REALES'
  return m
}

// Parsear fecha de Excel (número serial o string)
function parseFechaExcel(val: any): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    // Fecha serial de Excel
    const date = XLSX.SSF.parse_date_code(val)
    if (!date) return null
    const y = date.y
    const m = String(date.m).padStart(2, '0')
    const d = String(date.d).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  const s = String(val).trim()
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10)
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  return null
}

function toNum(val: any): number {
  if (!val) return 0
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

export async function GET(request: Request) {
  // Verificar que sea superusuario
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  try {
    // 1. Descargar Excel desde OneDrive
    const res = await fetch(ONEDRIVE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`Error descargando Excel: ${res.status} ${res.statusText}`)

    const buffer = await res.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false })

    // 2. Leer solapa DIARIO
    const sheetName = wb.SheetNames.find(n => n.toUpperCase() === 'DIARIO')
    if (!sheetName) throw new Error('No se encontró la solapa DIARIO')

    const ws = wb.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    // 3. Encontrar la fila de encabezados
    let headerRow = -1
    let headers: string[] = []
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i]
      if (row && row.some(c => String(c || '').toUpperCase().includes('FECHA'))) {
        headerRow = i
        headers = row.map(c => String(c || '').trim().toUpperCase())
        break
      }
    }
    if (headerRow < 0) throw new Error('No se encontró la fila de encabezados en DIARIO')

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

    // 5. Filtrar filas CTA CTE
    const movimientos = []
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[iTipo]) continue
      const tipo = String(row[iTipo] || '').trim().toUpperCase()
      if (tipo !== 'CTA CTE') continue

      const fecha = parseFechaExcel(row[iDate])
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

    if (movimientos.length === 0)
      throw new Error('No se encontraron movimientos CTA CTE en el DIARIO')

    // 6. Sincronizar: borrar los no anulados y reinsertar
    const { error: delError } = await supabase
      .from('diario')
      .delete()
      .eq('tipo', 'CTA CTE')
      .eq('anulado', false)

    if (delError) throw new Error('Error limpiando datos: ' + delError.message)

    // Insertar en lotes de 500
    let insertados = 0
    for (let i = 0; i < movimientos.length; i += 500) {
      const lote = movimientos.slice(i, i + 500)
      const { error: insError } = await supabase.from('diario').insert(lote)
      if (insError) throw new Error('Error insertando datos: ' + insError.message)
      insertados += lote.length
    }

    // 7. También sincronizar cuentas corrientes
    const cuentasSet = new Set(movimientos.map(m => m.cuenta_cte))
    for (const nombre of Array.from(cuentasSet)) {
      await supabase.from('cuentas_corrientes')
        .upsert({ nombre, activo: true }, { onConflict: 'nombre', ignoreDuplicates: true })
    }

    return NextResponse.json({
      success: true,
      movimientos: insertados,
      cuentas: cuentasSet.size,
      ultimaSync: new Date().toISOString(),
    })

  } catch (err: any) {
    console.error('Sync error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
