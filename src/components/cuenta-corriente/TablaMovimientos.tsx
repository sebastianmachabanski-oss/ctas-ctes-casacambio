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
  return `${sym} ${n}`
}

// Determina si la operación es un ingreso (verde) o egreso (rojo)
function esIngreso(op: string): boolean {
  const o = (op || '').toUpperCase()
  return o.includes('INGRES') || o === 'DONACION'
}

// COMPROMISO → Egreso, DONACION → Ingreso (tags con los colores del mockup)
function opLabel(op: string) {
  const labelIngreso = process.env.NEXT_PUBLIC_LABEL_INGRESO ?? 'Ingreso'
  const labelEgreso  = process.env.NEXT_PUBLIC_LABEL_EGRESO  ?? 'Egreso'
  if (op === 'DONACION')   return { label: labelIngreso, cls: 'tag tag-green' }
  if (op === 'COMPROMISO') return { label: labelEgreso,  cls: 'tag tag-red' }
  if (esIngreso(op))       return { label: op, cls: 'tag tag-green' }
  return { label: op, cls: 'tag tag-gray' }
}

function MovimientoCard({ m }: { m: DiarioRow }) {
  const cols = [
    { key: 'cc_dolares' as const, sym: 'U$S' },
    { key: 'cc_pesos'   as const, sym: '$'   },
    { key: 'cc_euros'   as const, sym: '€'   },
    { key: 'cc_reales'  as const, sym: 'R$'  },
  ]
  const montos = cols.map(c => ({ ...c, text: fmt(m[c.key], c.sym) })).filter(c => c.text)
  const { label, cls } = opLabel(m.operacion)
  const ingreso = esIngreso(m.operacion)

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
        {montos.map(({ key, text }) => text && (
          <span key={key} className={`text-sm font-medium ${ingreso ? 'text-green-600' : 'text-red-600'}`}>
            {ingreso ? '+' : '-'}{text}
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

      {/* Desktop: tabla (estilo mockup) */}
      <div className="hidden md:block tbl-wrap">
        <table className="cc-tbl">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Fecha</th>
              <th style={{ textAlign: 'left' }}>Cuenta</th>
              <th style={{ textAlign: 'left' }}>Operación</th>
              <th style={{ textAlign: 'left' }}>Detalle</th>
              <th style={{ textAlign: 'left' }}>Ref.</th>
              {cols.map(c => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {movimientos.map(m => {
              const { label, cls } = opLabel(m.operacion)
              const ingreso = esIngreso(m.operacion)
              return (
                <tr key={m.id}>
                  <td style={{ color: 'var(--muted)', fontWeight: 400 }}>
                    {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
                  </td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.cuenta_cte}</td>
                  <td style={{ textAlign: 'left' }}><span className={cls}>{label}</span></td>
                  <td style={{ textAlign: 'left', color: 'var(--ink-2)', fontWeight: 400 }}>{m.concepto ?? '—'}</td>
                  <td style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>{m.evento ?? '—'}</td>
                  {cols.map(c => {
                    const v = m[c.key]
                    if (!v || v === 0) return <td key={c.key} className="zero">—</td>
                    const n = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(Math.abs(v))
                    return (
                      <td key={c.key} className={`num ${ingreso ? '' : 'neg'}`}>
                        {ingreso ? `${c.sym} ${n}` : `${c.sym} (${n})`}
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
