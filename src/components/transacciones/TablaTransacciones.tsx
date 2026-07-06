'use client'
import Link from 'next/link'

type Movimiento = {
  id: string; fila_sheet: number | null; fecha: string; tipo: string
  cliente: string | null; operacion: string; propio: string | null; externo: string | null
  monto: number; cot: number | null; cot_efectiva: number | null; debe: string | null
  notas: string | null; cuenta: string | null
  pesos: number; cheques: number; dolares: number; euros: number; reales: number; banco: number
  cc_pesos: number; cc_dolares: number; cc_euros: number; cc_reales: number
}

// Columnas de impacto en caja, con su símbolo para mostrar.
const IMPACTOS: { key: keyof Movimiento; sym: string }[] = [
  { key: 'pesos',      sym: '$'      },
  { key: 'cheques',    sym: 'CH$'    },
  { key: 'dolares',    sym: 'U$S'    },
  { key: 'euros',      sym: '€'      },
  { key: 'reales',     sym: 'R$'     },
  { key: 'banco',      sym: 'BCO'    },
  { key: 'cc_pesos',   sym: 'CC $'   },
  { key: 'cc_dolares', sym: 'CC U$S' },
  { key: 'cc_euros',   sym: 'CC €'   },
  { key: 'cc_reales',  sym: 'CC R$'  },
]

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

function fmtFecha(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR')
}

function opBadge(op: string) {
  const o = (op || '').toUpperCase()
  if (o === 'COMPRA' || o === 'INGRESAN' || o === 'SOBRANTE' || o === 'GANANCIA')
    return 'bg-green-100 text-green-700'
  if (o === 'VENTA' || o === 'EGRESAN' || o === 'GASTOS' || o === 'FALTANTE')
    return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-700'
}

function Impactos({ m }: { m: Movimiento }) {
  const chips = IMPACTOS
    .map(c => ({ ...c, v: (m[c.key] as number) ?? 0 }))
    .filter(c => c.v !== 0)
  if (!chips.length) return <span className="text-gray-400">—</span>
  return (
    <span className="flex flex-wrap gap-1.5 justify-end">
      {chips.map(c => (
        <span key={c.key as string}
          className={`inline-block text-xs font-medium tabular-nums px-1.5 py-0.5 rounded ${c.v > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {c.sym} {c.v < 0 ? `(${nf.format(-c.v)})` : nf.format(c.v)}
        </span>
      ))}
    </span>
  )
}

function detalleOperacion(m: Movimiento) {
  const monedas = m.externo ? `${m.propio ?? ''} → ${m.externo}` : (m.propio ?? '')
  const cot = m.cot ? ` @ ${nf.format(m.cot)}` : ''
  return `${monedas}${cot}`
}

export default function TablaTransacciones({ movimientos }: { movimientos: Movimiento[] }) {
  if (!movimientos.length) {
    return <div className="card p-8 text-center text-gray-500 text-sm">No hay movimientos para los filtros elegidos.</div>
  }

  return (
    <div className="card overflow-hidden">
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Operación</th>
              <th className="px-4 py-3">Detalle</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-right">Impacto en caja</th>
              <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map(m => (
              <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{fmtFecha(m.fecha)}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  {m.cliente ?? <span className="text-gray-400">—</span>}
                  {m.tipo === 'CTA CTE' && (
                    <span className="ml-1.5 text-[10px] font-semibold uppercase text-blue-600 bg-blue-50 px-1 py-0.5 rounded">cta cte</span>
                  )}
                  {m.debe && (
                    <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-700 bg-amber-50 px-1 py-0.5 rounded" title={`En calle: ${m.debe}`}>🚚 {m.debe}</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${opBadge(m.operacion)}`}>{m.operacion}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{detalleOperacion(m)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 whitespace-nowrap">{nf.format(m.monto)}</td>
                <td className="px-4 py-2.5 text-right">{<Impactos m={m} />}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/dashboard/transacciones/${m.id}/editar`}
                    className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline"
                    title="Editar transacción">✏️ Editar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        {movimientos.map(m => (
          <div key={m.id} className="p-4 border-b border-gray-100 last:border-0">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <p className="font-medium text-gray-900 text-sm">
                  {m.cliente ?? '—'}
                  {m.tipo === 'CTA CTE' && (
                    <span className="ml-1.5 text-[10px] font-semibold uppercase text-blue-600 bg-blue-50 px-1 py-0.5 rounded">cta cte</span>
                  )}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {fmtFecha(m.fecha)} · {detalleOperacion(m)}
                  {m.debe ? ` · 🚚 ${m.debe}` : ''}
                </p>
              </div>
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${opBadge(m.operacion)}`}>{m.operacion}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm tabular-nums text-gray-700">Monto: {nf.format(m.monto)}</span>
              <Impactos m={m} />
            </div>
            <div className="mt-2 text-right">
              <Link href={`/dashboard/transacciones/${m.id}/editar`}
                className="text-xs font-medium text-brand-600 hover:underline">✏️ Editar</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
