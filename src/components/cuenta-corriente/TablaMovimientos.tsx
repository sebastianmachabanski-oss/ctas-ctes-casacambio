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

// Vista mobile: cards en lugar de tabla
function MovimientoCard({ m }: { m: DiarioRow }) {
  const cols = [
    { key: 'cc_dolares' as const, sym: 'U$S' },
    { key: 'cc_pesos' as const, sym: '$' },
    { key: 'cc_euros' as const, sym: '€' },
    { key: 'cc_reales' as const, sym: 'R$' },
  ]
  const montos = cols.map(c => ({ ...c, v: fmt(m[c.key], c.sym) })).filter(c => c.v)

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
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ml-2 ${
          m.operacion === 'DONACION' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
        }`}>{m.operacion}</span>
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
    return <div className="px-5 py-12 text-center text-gray-400 text-sm">No hay movimientos para los filtros seleccionados</div>
  }

  const cols = [
    { key: 'cc_dolares' as const, sym: 'U$S', label: 'Dólares' },
    { key: 'cc_pesos' as const, sym: '$', label: 'Pesos' },
    { key: 'cc_euros' as const, sym: '€', label: 'Euros' },
    { key: 'cc_reales' as const, sym: 'R$', label: 'Reales' },
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Operación</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Concepto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Evento</th>
              {cols.map(c => <th key={c.key} className="text-right px-4 py-3 font-medium text-gray-600">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {movimientos.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate">{m.cuenta_cte}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    m.operacion === 'DONACION' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>{m.operacion}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{m.concepto ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{m.evento ?? '—'}</td>
                {cols.map(c => {
                  const v = fmt(m[c.key], c.sym)
                  return (
                    <td key={c.key} className="px-4 py-3 text-right tabular-nums">
                      {v
                        ? <span className={v.ingreso ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>{v.ingreso ? '+' : '-'}{v.text}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
