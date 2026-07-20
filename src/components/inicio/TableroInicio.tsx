'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type KPI = { cur: string; col: string; caja: number; calle: number | null; enCaja: number | null; cc: number | null }
type Cliente = { nombre: string; pesos: number; dolares: number; euros: number; reales: number }
type Punto = { fecha: string; saldo: number }

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const money = (n: number) => n < 0 ? `(${fmt.format(-Math.round(n))})` : fmt.format(Math.round(n))
const cell = (n: number) => n === 0
  ? <td className="zero">—</td>
  : <td className={`num ${n < 0 ? 'neg' : ''}`}>{money(n)}</td>

// Filtros de período (como el mockup). Navegan por URL: el servidor re-consulta TODOS
// los reportes (KPIs, clientes) con ese rango; el gráfico ajusta su ventana.
const PERIODOS: [string, string][] = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['', 'Todo']]
const VENTANA: Record<string, number> = { dia: 3, semana: 7, mes: 30, anio: 365, '': 90 }

export default function TableroInicio({ kpis, clientesCaja, clientesCC, serieUSD, periodo, rDesde, rHasta }: {
  kpis: KPI[]; clientesCaja: Cliente[]; clientesCC: Cliente[]; serieUSD: Punto[]
  periodo: string; rDesde: string; rHasta: string
}) {
  const router = useRouter()
  const [vista, setVista] = useState<'caja' | 'cc'>('caja')
  const [busca, setBusca] = useState('')
  const esRango = !!(rDesde || rHasta)
  const [rangoOpen, setRangoOpen] = useState(esRango)
  const [r1, setR1] = useState(rDesde)
  const [r2, setR2] = useState(rHasta)

  const ventana = esRango && rDesde && rHasta
    ? Math.max(2, Math.round((new Date(rHasta).getTime() - new Date(rDesde).getTime()) / 86400000))
    : (VENTANA[periodo] ?? 90)
  const esTodo = !periodo && !esRango

  function elegirPeriodo(id: string) {
    setRangoOpen(false)
    router.replace('/dashboard/inicio' + (id ? `?p=${id}` : ''))
  }
  function aplicarRango(a: string, b: string) {
    setR1(a); setR2(b)
    if (a && b) router.replace(`/dashboard/inicio?desde=${a}&hasta=${b}`)
  }

  // El hero del gráfico muestra siempre el saldo ACTUAL (último punto de la serie);
  // los KPIs de arriba responden al período elegido.
  const saldoUSD = serieUSD.length ? serieUSD[serieUSD.length - 1].saldo : 0

  const fuente = vista === 'caja' ? clientesCaja : clientesCC
  const filtrados = useMemo(() => {
    const q = busca.trim().toUpperCase()
    return fuente.filter(c => (c.nombre || '').toUpperCase().includes(q))
  }, [fuente, busca])

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
    <div className="p-4 md:p-6" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="sec-lbl" style={{ margin: 0 }}>
          {esTodo ? 'Situación de caja — ahora' : 'Caja — movimiento del período'}{' '}
          <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--muted)' }}>
            {esTodo ? '· se actualiza con cada sincronización' : '· los reportes de abajo responden al período elegido'}
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
            <div className="val num">{money(k.caja)}</div>
            <div className="sub">
              {k.calle === null && k.cc === null ? (
                <div className="kr"><span>Cta bancaria</span><b>—</b></div>
              ) : (
                <>
                  {k.calle !== null && <div className="kr"><span>Calle</span><b className={k.calle < 0 ? 'neg' : ''}>{money(k.calle)}</b></div>}
                  {/* Arqueo físico = valor en la moneda (número grande, del período) − calle.
                      Es el dato para hacer la caja; coincide con la planilla filtrada igual. */}
                  {k.enCaja !== null && (
                    <div className="kr kr-encaja">
                      <span className="lbl-encaja">Saldo en caja</span>
                      <b className={k.enCaja < 0 ? 'neg' : 'pos'}>{money(k.enCaja)}</b>
                    </div>
                  )}
                  {k.cc !== null && <div className="kr"><span>Cta cte</span><b className={k.cc < 0 ? 'neg' : ''}>{money(k.cc)}</b></div>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Banda de mercado (fuente externa online) */}
      <BandaMercado />

      <div className="cc-two">
        {/* Clientes */}
        <section className="card">
          <div className="card-h"><h2 className="card-t">Clientes</h2></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 16px', flexWrap: 'wrap' }}>
            <div className="tabs">
              <button className={`tab ${vista === 'caja' ? 'on' : ''}`} onClick={() => setVista('caja')}>Caja</button>
              <button className={`tab ${vista === 'cc' ? 'on' : ''}`} onClick={() => setVista('cc')}>Cta cte</button>
            </div>
            <input className="srch" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente… (ej. MACHA)" style={{ flex: 1, minWidth: 0 }} />
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table className="cc-tbl">
              <thead><tr><th>Cliente</th><th>Pesos</th><th>Dólares</th><th>Euros</th><th>Reales</th></tr></thead>
              <tbody>
                {filtrados.slice(0, 400).map((c, i) => (
                  <tr key={c.nombre + i}>
                    <td>{c.nombre}</td>{cell(c.pesos)}{cell(c.dolares)}{cell(c.euros)}{cell(c.reales)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px 12px', color: 'var(--muted)', fontSize: 12 }}>
            {filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''} · vista {vista === 'caja' ? 'Caja' : 'Cta cte'}
            {filtrados.length > 400 ? ' · mostrando primeros 400 (afiná la búsqueda)' : ''}
          </div>
        </section>

        {/* Gráficos */}
        <div style={{ display: 'grid', gap: 14, minWidth: 0, gridTemplateRows: 'auto 1fr' }}>
          <section className="card">
            <div className="card-h"><h2 className="card-t">Saldo en caja — Dólares</h2>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {esRango ? 'rango elegido' : (PERIODOS.find(([id]) => id === periodo)?.[1] ?? 'Todo')}
              </span>
            </div>
            <div className="hero-line"><span className="big num">USD {money(saldoUSD)}</span></div>
            <div className="chart-pad"><LineaSaldo serie={serieUSD} dias={ventana} /></div>
          </section>
          <section className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-h"><h2 className="card-t">Movimiento neto mensual — Dólares</h2></div>
            <div className="chart-pad" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <BarrasMensuales serie={serieUSD} />
            </div>
          </section>
        </div>
      </div>
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
          <span className="mkt-note">Cotización de referencia online — no proviene de la planilla ni de la base de datos.</span>
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

/* ── Gráfico de línea: saldo USD en la ventana elegida ── */
function LineaSaldo({ serie, dias }: { serie: Punto[]; dias: number }) {
  const data = useMemo(() => {
    if (!serie.length) return []
    const last = new Date(serie[serie.length - 1].fecha + 'T12:00:00')
    const cutoff = new Date(last); cutoff.setDate(cutoff.getDate() - dias)
    const cut = cutoff.toISOString().slice(0, 10)
    const f = serie.filter(p => p.fecha >= cut)
    return f.length >= 2 ? f : serie.slice(-2)
  }, [serie, dias])

  if (data.length < 2) return <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Sin datos suficientes para el gráfico.</div>

  const W = 520, H = 215, pl = 62, PR = 12, PT = 16, PB = 32
  const vs = data.map(p => p.saldo)
  const lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.14 || 1
  const xs = (i: number) => pl + (W - pl - PR) * (i / (data.length - 1))
  const y = (v: number) => PT + (H - PT - PB) * (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad)))
  const path = data.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${y(p.saldo)}`).join('')
  const fmtFecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  const nlab = Math.min(5, data.length - 1), step = Math.max(1, Math.round((data.length - 1) / nlab))
  const k = (v: number) => fmt.format(Math.round(v / 1000)) + 'k'

  const gridVals = [0, 1, 2, 3].map(g => (lo - pad) + ((hi + pad) - (lo - pad)) * (g / 3))
  const ticks: number[] = []
  for (let i = 0; i < data.length; i += step) ticks.push(i)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
      {gridVals.map((val, i) => (
        <g key={i}>
          <line x1={pl} x2={W - PR} y1={y(val)} y2={y(val)} stroke="var(--grid)" strokeWidth={1} />
          <text x={pl - 8} y={y(val) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{k(val)}</text>
        </g>
      ))}
      {ticks.map(i => (
        <text key={i} x={xs(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">{fmtFecha(data[i].fecha)}</text>
      ))}
      <path d={`${path} L${xs(data.length - 1)},${H - PB} L${xs(0)},${H - PB} Z`} fill="#16a34a" opacity={0.08} />
      <path d={path} fill="none" stroke="#16a34a" strokeWidth={2} strokeLinejoin="round" />
      {[[0, 'start'], [data.length - 1, 'end']].map(([i, anc]: any) => (
        <g key={anc}>
          <circle cx={xs(i)} cy={y(data[i].saldo)} r={3.2} fill="#16a34a" stroke="var(--card)" strokeWidth={2} />
          <text x={xs(i) + (anc === 'end' ? -4 : 4)} y={y(data[i].saldo) - 9} textAnchor={anc === 'end' ? 'end' : 'start'} fontSize={12} fontWeight={700} fill="var(--pos-ink)">{k(data[i].saldo)}</text>
        </g>
      ))}
    </svg>
  )
}

/* ── Barras: movimiento neto mensual en USD (delta del saldo de fin de mes) ── */
function BarrasMensuales({ serie }: { serie: Punto[] }) {
  const meses = useMemo(() => {
    const finMes = new Map<string, number>()
    for (const p of serie) finMes.set(p.fecha.slice(0, 7), p.saldo) // orden asc → queda el último del mes
    const claves = Array.from(finMes.keys()).sort()
    const out: { m: string; v: number }[] = []
    for (let i = Math.max(1, claves.length - 6); i < claves.length; i++) {
      const prev = finMes.get(claves[i - 1]) ?? 0
      out.push({ m: claves[i], v: (finMes.get(claves[i]) ?? 0) - prev })
    }
    return out
  }, [serie])

  if (meses.length < 1) return <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Sin datos.</div>

  const W = 520, H = 170, pl = 62, PR = 12, PT = 20, PB = 24
  const vs = meses.map(t => t.v), hi = Math.max(...vs, 0), lo = Math.min(...vs, 0)
  const y = (v: number) => PT + (H - PT - PB) * (1 - (v - lo) / ((hi - lo) || 1))
  const bw = (W - pl - PR) / meses.length
  const k = (v: number) => (v / 1000).toFixed(0) + 'k'
  const mesLbl = (s: string) => new Date(s + '-15T12:00:00').toLocaleDateString('es-AR', { month: 'short' })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
      {[0, 1, 2].map(g => {
        const val = lo + (hi - lo) * g / 2
        return (
          <g key={g}>
            <line x1={pl} x2={W - PR} y1={y(val)} y2={y(val)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pl - 8} y={y(val) + 4} textAnchor="end" fontSize={10.5} fill="var(--muted)">{fmt.format(Math.round(val / 1000))}k</text>
          </g>
        )
      })}
      <line x1={pl} x2={W - PR} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={1} />
      {meses.map((t, i) => {
        const x = pl + i * bw + bw * 0.24, w = bw * 0.52
        const y0 = y(Math.max(0, t.v)), h = Math.abs(y(t.v) - y(0))
        return (
          <g key={t.m}>
            <rect x={x} y={y0} width={w} height={Math.max(h, 1.5)} rx={3} fill={t.v >= 0 ? '#2563eb' : '#dc2626'} />
            <text x={x + w / 2} y={t.v >= 0 ? y0 - 5 : y(0) + h + 12} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={t.v >= 0 ? 'var(--brand-ink)' : 'var(--neg-ink)'}>{k(t.v)}</text>
            <text x={x + w / 2} y={H - 7} textAnchor="middle" fontSize={11} fill="var(--muted)">{mesLbl(t.m)}</text>
          </g>
        )
      })}
    </svg>
  )
}
