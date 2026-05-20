#!/bin/bash
set -e

echo "🔧 Aplicando mejoras: labels y loader..."

# ── FiltrosMovimientos con loader ─────────────────────────────────
cat > src/components/cuenta-corriente/FiltrosMovimientos.tsx << 'EOF'
'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  tiposOperacion: { codigo: string; descripcion: string }[]
  valoresIniciales: { desde: string; hasta: string; concepto: string; operacion: string }
}

export default function FiltrosMovimientos({ tiposOperacion, valoresIniciales }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [desde, setDesde] = useState(valoresIniciales.desde)
  const [hasta, setHasta] = useState(valoresIniciales.hasta)
  const [concepto, setConcepto] = useState(valoresIniciales.concepto)
  const [operacion, setOperacion] = useState(valoresIniciales.operacion)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!desde || !hasta) return
    const params = new URLSearchParams()
    params.set('desde', desde)
    params.set('hasta', hasta)
    if (concepto) params.set('concepto', concepto)
    if (operacion) params.set('operacion', operacion)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function handleLimpiar() {
    setDesde(''); setHasta(''); setConcepto(''); setOperacion('')
    startTransition(() => { router.push(pathname) })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="label" htmlFor="desde">Fecha desde *</label>
          <input id="desde" type="date" className="input" value={desde}
            onChange={e => setDesde(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Fecha hasta *</label>
          <input id="hasta" type="date" className="input" value={hasta}
            onChange={e => setHasta(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="concepto">Concepto</label>
          <input id="concepto" type="text" className="input" placeholder="ej: DOLARES"
            value={concepto} onChange={e => setConcepto(e.target.value)} />
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
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={isPending}>
          {isPending ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Buscando...
            </span>
          ) : 'Buscar'}
        </button>
        <button type="button" className="btn-secondary" disabled={isPending} onClick={handleLimpiar}>
          Limpiar
        </button>
      </div>

      {/* Overlay de carga sobre la página */}
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
    </form>
  )
}
EOF

# ── TablaMovimientos con labels Ingreso/Egreso ────────────────────
cat > src/components/cuenta-corriente/TablaMovimientos.tsx << 'EOF'
'use client'

type DiarioRow = {
  id: string; fecha: string; cuenta_cte: string; operacion: string
  concepto: string | null; evento: string | null
  cc_dolares: number | null; cc_pesos: number | null
  cc_euros: number | null; cc_reales: number | null
}

function fmt(v: number | null, sym: string) {
  if (!v || v === 0) return null
  const n = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(Math.abs(v))
  return { text: `${sym} ${n}`, ingreso: v < 0 }
}

// COMPROMISO → Egreso, DONACION → Ingreso
function opLabel(op: string) {
  if (op === 'DONACION')   return { label: 'Ingreso', cls: 'bg-green-100 text-green-700' }
  if (op === 'COMPROMISO') return { label: 'Egreso',  cls: 'bg-orange-100 text-orange-700' }
  return { label: op, cls: 'bg-gray-100 text-gray-700' }
}

function MovimientoCard({ m }: { m: DiarioRow }) {
  const cols = [
    { key: 'cc_dolares' as const, sym: 'U$S' },
    { key: 'cc_pesos'   as const, sym: '$'   },
    { key: 'cc_euros'   as const, sym: '€'   },
    { key: 'cc_reales'  as const, sym: 'R$'  },
  ]
  const montos = cols.map(c => ({ ...c, v: fmt(m[c.key], c.sym) })).filter(c => c.v)
  const { label, cls } = opLabel(m.operacion)

  return (
    <div className="p-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-gray-900 text-sm">{m.cuenta_cte}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
            {m.evento ? ` · ${m.evento}` : ''}
          </p>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ml-2 ${cls}`}>
          {label}
        </span>
      </div>
      {m.concepto && <p className="text-gray-500 text-xs mb-2">{m.concepto}</p>}
      <div className="flex flex-wrap gap-2">
        {montos.map(({ key, v }) => v && (
          <span key={key} className={`text-sm font-medium ${v.ingreso ? 'text-green-600' : 'text-orange-600'}`}>
            {v.ingreso ? '+' : '-'}{v.text}
          </span>
        ))}
        {montos.length === 0 && <span className="text-gray-400 text-xs">Sin impacto monetario</span>}
      </div>
    </div>
  )
}

export default function TablaMovimientos({ movimientos }: { movimientos: DiarioRow[] }) {
  if (!movimientos.length) {
    return (
      <div className="px-5 py-12 text-center text-gray-400 text-sm">
        No hay movimientos para los filtros seleccionados
      </div>
    )
  }

  const cols = [
    { key: 'cc_dolares' as const, sym: 'U$S', label: 'Dólares' },
    { key: 'cc_pesos'   as const, sym: '$',   label: 'Pesos'   },
    { key: 'cc_euros'   as const, sym: '€',   label: 'Euros'   },
    { key: 'cc_reales'  as const, sym: 'R$',  label: 'Reales'  },
  ]

  return (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden">
        {movimientos.map(m => <MovimientoCard key={m.id} m={m} />)}
      </div>

      {/* Desktop: tabla */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cuenta</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Concepto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Ref.</th>
              {cols.map(c => (
                <th key={c.key} className="text-right px-4 py-3 font-medium text-gray-600">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {movimientos.map(m => {
              const { label, cls } = opLabel(m.operacion)
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate">
                    {m.cuenta_cte}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
                      {label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.concepto ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{m.evento ?? '—'}</td>
                  {cols.map(c => {
                    const v = fmt(m[c.key], c.sym)
                    return (
                      <td key={c.key} className="px-4 py-3 text-right tabular-nums">
                        {v
                          ? <span className={v.ingreso ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                              {v.ingreso ? '+' : '-'}{v.text}
                            </span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
EOF

echo ""
echo "✅ Labels y loader aplicados"
echo ""
echo "Ejecutá:"
echo "  git add ."
echo "  git commit -m 'ingreso/egreso labels + loader busqueda'"
echo "  git push"
