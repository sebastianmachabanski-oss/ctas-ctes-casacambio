#!/bin/bash
set -e

echo "🔧 Fechas opcionales y sin navegación hacia atrás..."

# ── FiltrosMovimientos: fechas opcionales + router.replace ────────
cat > src/components/cuenta-corriente/FiltrosMovimientos.tsx << 'EOF'
'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  tiposOperacion: { codigo: string; descripcion: string }[]
  valoresIniciales: { desde: string; hasta: string; operacion: string; cuenta?: string }
  cuentas?: string[]
  esSuperusuarioOOperador?: boolean
}

export default function FiltrosMovimientos({ tiposOperacion, valoresIniciales, cuentas, esSuperusuarioOOperador }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [desde, setDesde] = useState(valoresIniciales.desde)
  const [hasta, setHasta] = useState(valoresIniciales.hasta)
  const [operacion, setOperacion] = useState(valoresIniciales.operacion)
  const [cuenta, setCuenta] = useState(valoresIniciales.cuenta ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (operacion) params.set('operacion', operacion)
    if (cuenta) params.set('cuenta', cuenta)
    // replace en lugar de push para que el back no funcione
    startTransition(() => { router.replace(`${pathname}?${params.toString()}`) })
  }

  function handleLimpiar() {
    setDesde(''); setHasta(''); setOperacion(''); setCuenta('')
    startTransition(() => { router.replace(pathname) })
  }

  return (
    <form onSubmit={handleSubmit}>
      {isPending && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg px-8 py-6 flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <p className="text-sm font-medium text-gray-700">Cargando movimientos...</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Selector de cuenta — solo para admin/operador */}
        {esSuperusuarioOOperador && cuentas && cuentas.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="label">Cuenta corriente</label>
            <select className="input" value={cuenta} onChange={e => setCuenta(e.target.value)}>
              <option value="">Todas las cuentas</option>
              {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="desde">Fecha desde</label>
          <input id="desde" type="date" className="input" value={desde}
            onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Fecha hasta</label>
          <input id="hasta" type="date" className="input" value={hasta}
            onChange={e => setHasta(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="operacion">Tipo de movimiento</label>
          <select id="operacion" className="input" value={operacion}
            onChange={e => setOperacion(e.target.value)}>
            <option value="">Todos</option>
            <option value="DONACION">Ingreso</option>
            <option value="COMPROMISO">Egreso</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div className="flex gap-3 w-full">
            <button type="submit" className="btn-primary flex-1" disabled={isPending}>
              Buscar
            </button>
            <button type="button" className="btn-secondary" disabled={isPending} onClick={handleLimpiar}>
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
EOF

# ── Página cuenta corriente: fechas opcionales con defaults ────────
cat > src/app/dashboard/cuenta-corriente/page.tsx << 'EOF'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FiltrosMovimientos from '@/components/cuenta-corriente/FiltrosMovimientos'
import TablaMovimientos from '@/components/cuenta-corriente/TablaMovimientos'
import TarjetasSaldos from '@/components/cuenta-corriente/TarjetasSaldos'

export default async function CuentaCorrientePage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; operacion?: string; cuenta?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol, cuenta_cte, nombre').eq('id', user.id).single()
  const profile = profileData as { rol: string; cuenta_cte: string | null; nombre: string } | null
  if (!profile) redirect('/login')

  const esStaff = profile.rol === 'superusuario' || profile.rol === 'operador'
  const esCliente = profile.rol === 'cliente'

  const cuentaFiltro = esCliente
    ? profile.cuenta_cte
    : searchParams.cuenta || null

  if (esCliente && !profile.cuenta_cte) {
    return (
      <div className="p-4 md:p-8">
        <div className="card p-6 text-center text-gray-500">
          Tu cuenta no está configurada. Contactá al administrador.
        </div>
      </div>
    )
  }

  // Saldos
  let saldosQuery = supabase.from('saldos_cuenta_corriente').select('*')
  if (cuentaFiltro) saldosQuery = saldosQuery.eq('cuenta_cte', cuentaFiltro)
  const { data: saldosData } = await saldosQuery
  const saldos = (saldosData ?? []) as any[]

  // Lista de cuentas para el selector (solo staff)
  let cuentasList: string[] = []
  if (esStaff) {
    const { data: cuentasData } = await supabase
      .from('cuentas_corrientes').select('nombre').eq('activo', true).order('nombre')
    cuentasList = (cuentasData ?? []).map((c: any) => c.nombre)
  }

  const { operacion } = searchParams

  // Fechas: si no se proveen, usar la más antigua y hoy
  let desde = searchParams.desde || ''
  let hasta = searchParams.hasta || ''

  // Siempre mostrar movimientos (con o sin fechas)
  let desdeQuery = desde || undefined
  let hastaQuery = hasta || new Date().toISOString().slice(0, 10)

  // Si no hay fecha desde, buscar la más antigua
  if (!desdeQuery) {
    let minQuery = supabase.from('diario').select('fecha').eq('tipo', 'CTA CTE').eq('anulado', false).order('fecha', { ascending: true }).limit(1)
    if (cuentaFiltro) minQuery = minQuery.eq('cuenta_cte', cuentaFiltro)
    const { data: minData } = await minQuery
    desdeQuery = minData?.[0]?.fecha || '2000-01-01'
  }

  let query = supabase.from('diario').select('*', { count: 'exact' })
    .eq('tipo', 'CTA CTE').eq('anulado', false)
    .gte('fecha', desdeQuery)
    .lte('fecha', hastaQuery)
    .order('fecha', { ascending: false })

  if (cuentaFiltro) query = query.eq('cuenta_cte', cuentaFiltro)
  if (operacion) query = query.eq('operacion', operacion)

  const { data, count } = await query
  const movimientos = (data ?? []) as any[]
  const totalMovimientos = count ?? 0

  const { data: tiposData } = await supabase
    .from('tipos_operacion').select('codigo, descripcion').eq('activo', true)
  const tiposOp = (tiposData ?? []) as any[]

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Cuenta Corriente</h1>
        {esCliente && profile.cuenta_cte && (
          <p className="text-gray-500 text-sm mt-1">{profile.cuenta_cte}</p>
        )}
        {esStaff && cuentaFiltro && (
          <p className="text-gray-500 text-sm mt-1">{cuentaFiltro}</p>
        )}
        {esStaff && !cuentaFiltro && (
          <p className="text-gray-500 text-sm mt-1">Todas las cuentas</p>
        )}
      </div>

      <TarjetasSaldos saldos={saldos} cuentaCte={cuentaFiltro} />

      <div className="card p-4 md:p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Filtrar movimientos</h2>
        <FiltrosMovimientos
          tiposOperacion={tiposOp}
          valoresIniciales={{
            desde: desde,
            hasta: hasta,
            operacion: operacion ?? '',
            cuenta: searchParams.cuenta ?? '',
          }}
          cuentas={cuentasList}
          esSuperusuarioOOperador={esStaff}
        />
      </div>

      <div className="card">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Movimientos</h2>
          <span className="text-sm text-gray-500">{totalMovimientos} registro{totalMovimientos !== 1 ? 's' : ''}</span>
        </div>
        <TablaMovimientos movimientos={movimientos} />
      </div>
    </div>
  )
}
EOF

echo "✅ Fechas opcionales y sin back aplicados"
echo ""
echo "Ejecutá:"
echo "  git add ."
echo "  git commit -m 'fix: fechas opcionales y sin navegacion atras'"
echo "  git push"
