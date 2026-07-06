'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Movimiento = {
  id: string; fecha: string; tipo: string; cliente: string | null; operacion: string
  propio: string | null; externo: string | null; monto: number; cot: number | null
  debe: string | null; notas: string | null
  pesos: number; cheques: number; dolares: number; euros: number; reales: number; banco: number
  cc_pesos: number; cc_dolares: number; cc_euros: number; cc_reales: number
}

const SIMBOLOS: Record<string, string> = {
  pesos: '$', cheques: 'CH$', dolares: 'U$S', euros: '€', reales: 'R$',
  banco: 'BCO', cc_pesos: 'CC $', cc_dolares: 'CC U$S', cc_euros: 'CC €', cc_reales: 'CC R$',
}
const COLUMNAS = Object.keys(SIMBOLOS)
const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

function fmtFecha(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR')
}

// Lo que el repartidor tiene en su poder: los valores POSITIVOS de la fila.
function positivos(m: Movimiento) {
  return COLUMNAS
    .map(c => ({ col: c, v: (m as any)[c] as number }))
    .filter(x => x.v > 0)
}

export default function ListaCalle({
  movimientos, totales, puedeIngresar,
}: {
  movimientos: Movimiento[]; totales: Record<string, number>; puedeIngresar: boolean
}) {
  const router = useRouter()
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState('')

  const grupos = useMemo(() => {
    const map = new Map<string, Movimiento[]>()
    for (const m of movimientos) {
      const rep = (m.debe ?? '').trim() || '—'
      if (!map.has(rep)) map.set(rep, [])
      map.get(rep)!.push(m)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [movimientos])

  async function ingresar(m: Movimiento) {
    const detalle = positivos(m).map(x => `${SIMBOLOS[x.col]} ${nf.format(x.v)}`).join(' + ') || 'sin montos positivos'
    if (!confirm(`¿Confirmás que ${m.debe} entregó ${detalle} a la caja?`)) return
    setProcesando(m.id); setError('')
    const res = await fetch(`/api/movimientos-caja/${m.id}/ingresar`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? `Error ${res.status}`)
      setProcesando(null)
      return
    }
    router.refresh()
    setProcesando(null)
  }

  const hayTotales = Object.keys(totales).length > 0

  return (
    <div className="space-y-4">
      {/* Total general en calle (réplica del recuadro rojo de la planilla) */}
      <div className="card p-4 md:p-5 border-red-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-2">Total en calle</p>
        {!hayTotales ? (
          <p className="text-sm text-gray-500">No hay dinero en la calle. 🎉</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(totales).map(([col, v]) => (
              <span key={col} className="inline-block text-sm font-semibold tabular-nums px-2.5 py-1 rounded-lg bg-red-50 text-red-700">
                {SIMBOLOS[col]} {nf.format(v)}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Un bloque por repartidor */}
      {grupos.map(([repartidor, movs]) => (
        <div key={repartidor} className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <p className="font-semibold text-gray-900">🚚 {repartidor}</p>
            <span className="text-xs text-gray-500">{movs.length} {movs.length === 1 ? 'movimiento' : 'movimientos'}</span>
          </div>
          {movs.map(m => (
            <div key={m.id} className="px-4 py-3 border-b border-gray-100 last:border-0 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {m.cliente ?? '—'}
                  <span className="ml-2 text-xs font-normal text-gray-500">{fmtFecha(m.fecha)} · {m.operacion}</span>
                </p>
                {m.notas && <p className="text-xs text-gray-400 mt-0.5 truncate">{m.notas}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="flex flex-wrap gap-1.5">
                  {positivos(m).map(x => (
                    <span key={x.col} className="inline-block text-xs font-medium tabular-nums px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                      {SIMBOLOS[x.col]} {nf.format(x.v)}
                    </span>
                  ))}
                  {positivos(m).length === 0 && <span className="text-xs text-gray-400">sin montos positivos</span>}
                </span>
                {puedeIngresar && (
                  <button
                    className="btn-primary text-xs px-3 py-1.5"
                    disabled={procesando === m.id}
                    onClick={() => ingresar(m)}>
                    {procesando === m.id ? 'Registrando…' : '✓ Ingresó a caja'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {grupos.length === 0 && (
        <div className="card p-8 text-center text-gray-500 text-sm">
          No hay movimientos con repartidor asignado.
        </div>
      )}
    </div>
  )
}
