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
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Total general en calle (réplica del recuadro rojo de la planilla, estilo mockup) */}
      <div className="card" style={{ padding: '14px 16px', borderColor: 'rgba(220,38,38,.35)' }}>
        <div className="sec-lbl" style={{ color: 'var(--neg-ink)', marginBottom: 8 }}>Total en calle</div>
        {!hayTotales ? (
          <p className="text-sm text-gray-500">No hay dinero en la calle. 🎉</p>
        ) : (
          <div style={{ display: 'flex', gap: '8px 22px', flexWrap: 'wrap', alignItems: 'baseline' }}>
            {Object.entries(totales).map(([col, v]) => (
              <span key={col}><b className="num neg" style={{ fontSize: 16 }}>{SIMBOLOS[col]} {nf.format(v)}</b></span>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Un bloque por repartidor */}
      {grupos.map(([repartidor, movs]) => (
        <div key={repartidor} className="card overflow-hidden">
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--grid)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 650, fontSize: 13 }}>🚚 {repartidor}</span>
            <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{movs.length} mov.</span>
          </div>
          {movs.map(m => (
            <div key={m.id} style={{ padding: '9px 16px', borderBottom: '1px solid var(--grid)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
              <div style={{ minWidth: 0 }}>
                <span>{m.cliente ?? '—'}</span>{' '}
                <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>· {fmtFecha(m.fecha)} · {m.operacion}</span>
                {m.notas && <p style={{ color: 'var(--muted)', fontSize: 11.5, margin: '2px 0 0' }}>{m.notas}</p>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {positivos(m).map(x => (
                  <span key={x.col} className="imp n" style={{ fontSize: 11.5 }}>{SIMBOLOS[x.col]} {nf.format(x.v)}</span>
                ))}
                {positivos(m).length === 0 && <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>sin montos positivos</span>}
                {puedeIngresar && (
                  <button
                    className="btn-primary"
                    style={{ fontSize: 11.5, padding: '5px 10px' }}
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
