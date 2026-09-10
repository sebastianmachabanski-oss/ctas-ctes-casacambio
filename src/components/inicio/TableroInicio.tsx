'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type KPI = { cur: string; col: string; caja: number; calle: number | null; enCaja: number | null; cc: number | null }

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const money = (n: number) => n < 0 ? `(${fmt.format(-Math.round(n))})` : fmt.format(Math.round(n))

// Filtros de período. Navegan por URL: el servidor re-consulta los totales de caja con
// ese rango. Los reportes que también respondían a este filtro (saldos por cliente y
// gráficos de dólares) se mudaron a Ganancias el 10/9/2026; el listado de transacciones
// que ocupó su lugar tiene su propio filtro de fechas y NO depende de estos chips.
const PERIODOS: [string, string][] = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['', 'Todo']]

export default function TableroInicio({ kpis, periodo, rDesde, rHasta }: {
  kpis: KPI[]; periodo: string; rDesde: string; rHasta: string
}) {
  const router = useRouter()
  const esRango = !!(rDesde || rHasta)
  const [rangoOpen, setRangoOpen] = useState(esRango)
  const [r1, setR1] = useState(rDesde)
  const [r2, setR2] = useState(rHasta)

  const esTodo = !periodo && !esRango

  function elegirPeriodo(id: string) {
    setRangoOpen(false)
    router.replace('/dashboard/inicio' + (id ? `?p=${id}` : ''))
  }
  function aplicarRango(a: string, b: string) {
    setR1(a); setR2(b)
    if (a && b) router.replace(`/dashboard/inicio?desde=${a}&hasta=${b}`)
  }

  // Auto-ajuste del tamaño de letra de los KPIs de caja: si un número no entra en una
  // línea (ej. negativos de 9+ dígitos), baja la fuente hasta que quepa (mín. 14px).
  useEffect(() => {
    const fit = () => {
      document.querySelectorAll<HTMLElement>('.kpis-caja .val').forEach(el => {
        el.style.fontSize = ''
        let size = parseFloat(getComputedStyle(el).fontSize) || 20
        let guard = 0
        while (el.scrollWidth > el.clientWidth + 1 && size > 14 && guard++ < 12) {
          size -= 1
          el.style.fontSize = size + 'px'
        }
      })
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [kpis])

  return (
    <div className="p-4 md:p-6" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="sec-lbl" style={{ margin: 0 }}>
          {esTodo ? 'Situación de caja — ahora' : 'Caja — movimiento del período'}{' '}
          <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--muted)' }}>
            {esTodo ? '· incluye todos los movimientos registrados' : '· los importes de esta sección responden al período elegido'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {PERIODOS.map(([id, lbl]) => (
            <button key={lbl} className={`chip ${!esRango && !rangoOpen && periodo === id ? 'on' : ''}`} onClick={() => elegirPeriodo(id)}>{lbl}</button>
          ))}
          <button className={`chip ${esRango || rangoOpen ? 'on' : ''}`} onClick={() => setRangoOpen(true)}>Rango…</button>
          {rangoOpen && (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input className="srch" type="date" value={r1} onChange={e => aplicarRango(e.target.value, r2)} style={{ width: 140, minWidth: 0 }} />
              <span style={{ color: 'var(--muted)' }}>→</span>
              <input className="srch" type="date" value={r2} onChange={e => aplicarRango(r1, e.target.value)} style={{ width: 140, minWidth: 0 }} />
            </span>
          )}
        </div>
      </div>

      {/* KPIs por moneda */}
      <div className="kpis-caja">
        {kpis.map(k => (
          <div className="kpi" key={k.cur}>
            <div className="top"><span className="dot" style={{ background: k.col }} /><span className="cur">{k.cur}</span></div>
            {/* El número grande es el SALDO EN CAJA: el arqueo físico, que es el dato con
                el que se hace la caja todos los días. Antes arriba iba el total de la
                moneda y el arqueo quedaba abajo en letra chica; se invirtieron el
                26/8/2026. Banco no tiene arqueo (no hay efectivo que contar), así que
                ahí sigue mandando su propio total. */}
            <div className="val num">{money(k.enCaja ?? k.caja)}</div>
            <div className="val-lbl">{k.enCaja !== null ? 'saldo en caja' : 'saldo'}</div>
            <div className="sub">
              {k.calle === null && k.cc === null ? (
                <div className="kr"><span>Cta bancaria</span><b>—</b></div>
              ) : (
                <>
                  {k.enCaja !== null && (
                    <div className="kr"><span>Total {k.cur.toLowerCase()}</span><b className={k.caja < 0 ? 'neg' : ''}>{money(k.caja)}</b></div>
                  )}
                  {k.calle !== null && <div className="kr"><span>Calle</span><b className={k.calle < 0 ? 'neg' : ''}>{money(k.calle)}</b></div>}
                  {k.cc !== null && <div className="kr"><span>Cta cte</span><b className={k.cc < 0 ? 'neg' : ''}>{money(k.cc)}</b></div>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Banda de mercado (fuente externa online) */}
      <BandaMercado />

    </div>
  )
}

/* ── Banda de mercado: cotizaciones online con fallback si no hay red ── */
function BandaMercado() {
  const FB: [string, number, number][] = [['Dólar Blue', 1490, 1510], ['Dólar Oficial', 1435, 1475], ['USDT', 1500, 1525], ['Euro', 1610, 1660], ['Real', 255, 265]]
  const [items, setItems] = useState<[string, number, number][]>(FB)
  const [src, setSrc] = useState('cargando…')
  const [live, setLive] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const signal = AbortSignal.timeout(5000)
        const [ds, cs] = await Promise.all([
          fetch('https://dolarapi.com/v1/dolares', { signal }).then(r => r.json()),
          fetch('https://dolarapi.com/v1/cotizaciones', { signal }).then(r => r.json()),
        ])
        const g = (a: any[], p: (x: any) => boolean, n: string): [string, number, number] | null => {
          const x = Array.isArray(a) ? a.find(p) : null
          return x ? [n, Math.round(+x.compra), Math.round(+x.venta)] : null
        }
        const its = [
          g(ds, d => d.casa === 'blue', 'Dólar Blue'),
          g(ds, d => d.casa === 'oficial', 'Dólar Oficial'),
          // dolarapi expone el dólar cripto (casa: 'cripto'), que es la cotización de USDT.
          g(ds, d => d.casa === 'cripto', 'USDT'),
          g(cs, c => c.moneda === 'EUR', 'Euro'),
          g(cs, c => c.moneda === 'BRL', 'Real'),
        ].filter(Boolean) as [string, number, number][]
        if (!its.length) throw new Error('sin datos')
        if (cancel) return
        const h = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        setItems(its); setSrc(`en vivo · ${h}`); setLive(true)
      } catch {
        if (cancel) return
        setItems(FB); setSrc('valores de ejemplo (sin conexión)'); setLive(false)
      }
    })()
    return () => { cancel = true }
  }, [])

  return (
    <div className="mkt">
      <div className="mkt-head">
        <div className="mkt-titlerow">
          <span className="mkt-title">📡 Mercado · fuente externa</span>
          <span className="mkt-note">Cotización de referencia online — no proviene de los datos del sistema.</span>
          <span className={`mkt-src${live ? ' live' : ''}`}>{src}</span>
        </div>
        <div className="mkt-row">
          {items.map(i => (
            <span className="it" key={i[0]}>
              <span className="n">{i[0]}</span>
              <span className="v num">$ {fmt.format(i[1])}</span><span style={{ color: 'var(--muted)' }}>/</span>
              <span className="v num">$ {fmt.format(i[2])}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
