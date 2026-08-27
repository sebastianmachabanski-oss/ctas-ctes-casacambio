'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PERIODOS, labelPeriodo, labelRango, navegarPeriodo } from '@/lib/periodos'

/**
 * Selector de período de los reportes: Día / Semana / Mes / Año / Rango, con las flechas
 * para moverse de a un período y el atajo "Hoy".
 *
 * El estado vive en la URL (`?p=mes&fecha=2026-08-01` o `?desde=…&hasta=…`), así que la
 * pantalla se puede compartir y el botón "atrás" del navegador funciona.
 *
 * Nació en Ganancias; se generalizó el 26/8/2026 para que Gastos tuviera exactamente el
 * mismo control y no dos maneras distintas de elegir un mes.
 */
export default function SelectorPeriodo({ ruta, periodo, fecha, rDesde, rHasta, hoy, extra }: {
  /** Ruta de la pantalla, ej. '/dashboard/gastos'. */
  ruta: string
  periodo: string
  /** Fecha cursor: el día en el que está parado el período. */
  fecha: string
  rDesde: string
  rHasta: string
  hoy: string
  /** Otros filtros de la pantalla, para no perderlos al cambiar de período. */
  extra?: Record<string, string>
}) {
  const router = useRouter()
  const esRango = !!(rDesde && rHasta)
  const [rangoOpen, setRangoOpen] = useState(esRango)
  const [r1, setR1] = useState(rDesde)
  const [r2, setR2] = useState(rHasta)

  function ir(params: Record<string, string>) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...(extra ?? {}), ...params })) if (v) qs.set(k, v)
    const s = qs.toString()
    router.replace(ruta + (s ? '?' + s : ''))
  }

  function aplicarRango(a: string, b: string) {
    setR1(a); setR2(b)
    if (a && b) ir({ desde: a, hasta: b })
  }

  const label = esRango ? labelRango(rDesde, rHasta) : labelPeriodo(periodo, fecha)

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODOS.map(([id, lbl]) => (
          <button key={id}
            className={`chip ${!esRango && !rangoOpen && periodo === id ? 'on' : ''}`}
            onClick={() => { setRangoOpen(false); ir({ p: id, fecha }) }}>
            {lbl}
          </button>
        ))}
        <button className={`chip ${esRango || rangoOpen ? 'on' : ''}`} onClick={() => setRangoOpen(true)}>Rango…</button>
        {rangoOpen && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input className="srch" type="date" value={r1} aria-label="Desde"
              onChange={e => aplicarRango(e.target.value, r2)} style={{ width: 140, minWidth: 0 }} />
            <span style={{ color: 'var(--muted)' }}>→</span>
            <input className="srch" type="date" value={r2} aria-label="Hasta"
              onChange={e => aplicarRango(r1, e.target.value)} style={{ width: 140, minWidth: 0 }} />
          </span>
        )}
      </div>

      {!esRango ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
          <button className="chip" style={{ width: 30, padding: '5px 0', textAlign: 'center' }}
            aria-label="Período anterior"
            onClick={() => ir({ p: periodo, fecha: navegarPeriodo(periodo, fecha, -1) })}>‹</button>
          <b style={{ color: 'var(--ink)' }}>{label}</b>
          <button className="chip" style={{ width: 30, padding: '5px 0', textAlign: 'center' }}
            aria-label="Período siguiente"
            onClick={() => ir({ p: periodo, fecha: navegarPeriodo(periodo, fecha, 1) })}>›</button>
          {fecha !== hoy && <button className="chip" onClick={() => ir({ p: periodo, fecha: hoy })}>Hoy</button>}
        </div>
      ) : (
        <b style={{ color: 'var(--ink)' }}>{label}</b>
      )}
    </div>
  )
}
