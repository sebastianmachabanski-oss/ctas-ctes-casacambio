#!/bin/bash
set -e

echo "🔧 Configurando sincronización con OneDrive..."

mkdir -p src/app/api/sync
mkdir -p src/app/dashboard/admin/sync

# ══════════════════════════════════════════════════════════════════
# API Route: leer Excel de OneDrive y sincronizar con Supabase
# ══════════════════════════════════════════════════════════════════
cat > src/app/api/sync/route.ts << 'EOF'
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
    for (const nombre of cuentasSet) {
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
EOF

# ══════════════════════════════════════════════════════════════════
# Página de sincronización para el admin
# ══════════════════════════════════════════════════════════════════
cat > src/app/dashboard/admin/sync/page.tsx << 'EOF'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SyncClient from './SyncClient'

export default async function SyncPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario') redirect('/dashboard')

  // Último estado del diario
  const { count } = await supabase.from('diario')
    .select('*', { count: 'exact', head: true })
    .eq('tipo', 'CTA CTE').eq('anulado', false)

  const { data: ultimoMov } = await supabase.from('diario')
    .select('created_at').eq('tipo', 'CTA CTE')
    .order('created_at', { ascending: false }).limit(1)

  return (
    <SyncClient
      totalMovimientos={count ?? 0}
      ultimaSync={ultimoMov?.[0]?.created_at ?? null}
    />
  )
}
EOF

cat > src/app/dashboard/admin/sync/SyncClient.tsx << 'EOF'
'use client'
import { useState } from 'react'

interface Props {
  totalMovimientos: number
  ultimaSync: string | null
}

export default function SyncClient({ totalMovimientos, ultimaSync }: Props) {
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    if (!confirm('Esto reemplazará todos los movimientos CTA CTE con los datos actuales del Excel. ¿Continuar?')) return
    setLoading(true)
    setError(null)
    setResultado(null)

    const res = await fetch('/api/sync')
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }
    setResultado(data)
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Sincronización con Excel</h1>
        <p className="text-gray-500 text-sm mt-1">Lee el Excel de OneDrive y actualiza los datos de la app</p>
      </div>

      {/* Estado actual */}
      <div className="card p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Estado actual</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Movimientos en base</p>
            <p className="text-2xl font-bold text-gray-900">{totalMovimientos.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Última sincronización</p>
            <p className="text-sm font-medium text-gray-900">
              {ultimaSync
                ? new Date(ultimaSync).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Nunca'}
            </p>
          </div>
        </div>
      </div>

      {/* Cómo funciona */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Cómo funciona</h2>
        <ol className="space-y-2 text-sm text-gray-600">
          <li className="flex gap-2"><span className="font-bold text-brand-600">1.</span> La app descarga el Excel desde OneDrive</li>
          <li className="flex gap-2"><span className="font-bold text-brand-600">2.</span> Lee todos los movimientos de la solapa DIARIO donde TIPO = CTA CTE</li>
          <li className="flex gap-2"><span className="font-bold text-brand-600">3.</span> Reemplaza los datos existentes con los nuevos</li>
          <li className="flex gap-2"><span className="font-bold text-brand-600">4.</span> Los clientes ven la información actualizada inmediatamente</li>
        </ol>
        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
          ⚠️ La sincronización reemplaza todos los movimientos no anulados. Los movimientos anulados manualmente se conservan.
        </div>
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-700">
          <p className="font-semibold mb-1">✓ Sincronización exitosa</p>
          <p className="text-sm">{resultado.movimientos.toLocaleString('es-AR')} movimientos importados</p>
          <p className="text-sm">{resultado.cuentas} cuentas corrientes actualizadas</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <p className="font-semibold mb-1">Error en la sincronización</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Botón */}
      <button onClick={handleSync} className="btn-primary w-full md:w-auto" disabled={loading}>
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Sincronizando... puede demorar unos segundos
          </span>
        ) : '🔄 Sincronizar ahora'}
      </button>
    </div>
  )
}
EOF

# Actualizar Sidebar para incluir Sincronización
python3 << 'PYEOF'
content = open('src/components/Sidebar.tsx').read()
old = "{ href: '/dashboard/admin/usuarios',   label: 'Usuarios',           icon: '👥' },"
new = "{ href: '/dashboard/admin/usuarios',   label: 'Usuarios',           icon: '👥' },\n    { href: '/dashboard/admin/sync',       label: 'Sincronizar Excel',  icon: '🔄' },"
content = content.replace(old, new)
open('src/components/Sidebar.tsx', 'w').write(content)
print('OK Sidebar')
PYEOF

echo ""
echo "✅ Sincronización con OneDrive configurada"
echo ""
echo "Antes de hacer push, agregar en Netlify la variable de entorno:"
echo "  ONEDRIVE_EXCEL_URL = https://api.onedrive.com/v1.0/shares/u!aHR0cHM6Ly8xZHJ2Lm1zL3gvYy8yYjQzMTRiYmFkNTRhZjA5L0lRRGZsbUxsS0lQV1RJTlNUdURuN2R1bUFSVEV4ZlhtR0N3RlpLNWJNd3RvM1A4P2U9VFZqZHZx/root/content"
echo ""
echo "Luego ejecutá:"
echo "  git add ."
echo "  git commit -m 'feat: sincronizacion Excel OneDrive'"
echo "  git push"
