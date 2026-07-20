'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// Réplica de la solapa COLO (validada al peso contra la planilla en el mockup):
//   ganancia = calzado × (tasa venta − tasa compra) + valuación del stock + gastos
// El servidor manda los días agregados; acá se aplica la configuración en vivo.

export type ParAgg = { vC: number; aC: number; vV: number; aV: number; vCcc: number; aCcc: number; vVcc: number; aVcc: number }
export type DiaAgg = { f: string; usd: ParAgg; eur: ParAgg; brl: ParAgg; usdt: ParAgg; g: number; gcc: number }

type Cfg = {
  ops: Set<string>; par: 'usd' | 'eur' | 'brl' | 'usdt'; cc: boolean
  resid: 'fijo' | 'costo' | 'mtm'; margen: number; cierre: number; gastos: boolean
}

const fmt0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const fmt3 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const ars = (n: number) => `$ ${n < 0 ? '(' + fmt0.format(-n) + ')' : fmt0.format(n)}`
const SYM: Record<string, string> = { usd: 'US$', eur: '€', brl: 'R$', usdt: 'USDT' }

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function addMonths(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
function labelPeriodo(p: string, fecha: string): string {
  const d = new Date(fecha + 'T12:00:00Z')
  if (p === 'dia') return cap(d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  if (p === 'semana') {
    const dow = (d.getUTCDay() + 6) % 7
    const ini = addDays(fecha, -dow), fin = addDays(ini, 6)
    const di = new Date(ini + 'T12:00:00Z'), df = new Date(fin + 'T12:00:00Z')
    return `Semana del ${di.getUTCDate()}/${di.getUTCMonth() + 1} al ${df.getUTCDate()}/${df.getUTCMonth() + 1}/${df.getUTCFullYear()}`
  }
  if (p === 'mes') return cap(d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }))
  return `Año ${fecha.slice(0, 4)}`
}

// Totales del período según la configuración (misma cuenta que el mockup validado).
function calc(dias: DiaAgg[], cfg: Cfg) {
  let vC = 0, aC = 0, vV = 0, aV = 0, g = 0
  for (const d of dias) {
    const p = d[cfg.par]
    if (cfg.ops.has('COMPRA')) { vC += p.vC + (cfg.cc ? p.vCcc : 0); aC += p.aC + (cfg.cc ? p.aCcc : 0) }
    if (cfg.ops.has('VENTA')) { vV += p.vV + (cfg.cc ? p.vVcc : 0); aV += p.aV + (cfg.cc ? p.aVcc : 0) }
    if (cfg.ops.has('GASTOS') && cfg.gastos) g += d.g + (cfg.cc ? d.gcc : 0)
  }
  const t1 = vC ? aC / vC : 0, t2 = vV ? aV / vV : 0
  const spread = (vC && vV) ? t2 - t1 : 0
  const calzado = Math.min(vC, vV), stock = Math.abs(vC - vV)
  let gResid = 0
  if (cfg.resid === 'fijo') gResid = stock * cfg.margen
  else if (cfg.resid === 'mtm') gResid = vC >= vV ? stock * (cfg.cierre - t1) : stock * (t2 - cfg.cierre)
  const neto = calzado * spread + gResid + g
  return { vC, aC, vV, aV, t1, t2, spread, calzado, stock, gResid, g, neto }
}

const PERIODOS: [string, string][] = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']]

export default function GananciasView({ dias, periodo, fecha, rDesde, rHasta, hoy }: {
  dias: DiaAgg[]; periodo: string; fecha: string; rDesde: string; rHasta: string; hoy: string
}) {
  const router = useRouter()
  const esRango = !!(rDesde && rHasta)
  const [rangoOpen, setRangoOpen] = useState(esRango)
  const [r1, setR1] = useState(rDesde)
  const [r2, setR2] = useState(rHasta)

  const [cfg, setCfg] = useState<Cfg>({
    ops: new Set(['COMPRA', 'VENTA', 'GASTOS']), par: 'usd', cc: true,
    resid: 'fijo', margen: 0.05, cierre: 1500, gastos: true,
  })
  const setC = (patch: Partial<Cfg>) => setCfg(c => ({ ...c, ...patch }))
  const toggleOp = (op: string) => setCfg(c => {
    const ops = new Set(c.ops); ops.has(op) ? ops.delete(op) : ops.add(op)
    return { ...c, ops }
  })
  const esDefault = cfg.ops.size === 3 && cfg.par === 'usd' && cfg.cc && cfg.resid === 'fijo'
    && Math.abs(cfg.margen - 0.05) < 1e-9 && cfg.gastos

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') document.body.classList.remove('cfg-open') }
    window.addEventListener('keydown', onEsc)
    return () => { window.removeEventListener('keydown', onEsc); document.body.classList.remove('cfg-open') }
  }, [])

  const r = useMemo(() => calc(dias, cfg), [dias, cfg])

  function irPeriodo(p: string) {
    setRangoOpen(false)
    router.replace(`/dashboard/ganancias?p=${p}&fecha=${fecha}`)
  }
  function navegar(dir: 1 | -1) {
    let f = fecha
    if (periodo === 'dia') f = addDays(fecha, dir)
    else if (periodo === 'semana') f = addDays(fecha, 7 * dir)
    else if (periodo === 'mes') f = addMonths(fecha, dir)
    else f = addMonths(fecha, 12 * dir)
    router.replace(`/dashboard/ganancias?p=${periodo}&fecha=${f}`)
  }
  function aplicarRango(a: string, b: string) {
    setR1(a); setR2(b)
    if (a && b) router.replace(`/dashboard/ganancias?desde=${a}&hasta=${b}`)
  }

  const LEAD: Record<string, string> = { dia: 'Este día ganaste', semana: 'Esta semana ganaste', mes: 'Este mes ganaste', anio: 'Este año ganaste' }
  const lead = esRango ? 'En el período ganaste' : (LEAD[periodo] ?? 'Ganaste')
  const label = esRango
    ? `Del ${rDesde.split('-').reverse().join('/')} al ${rHasta.split('-').reverse().join('/')}`
    : labelPeriodo(periodo, fecha)
  const sinDatos = r.vC === 0 && r.vV === 0 && r.g === 0
  const sym = SYM[cfg.par]

  return (
    <div className="p-4 md:p-6" style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
      {/* Filtros de período + configuración */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {PERIODOS.map(([id, lbl]) => (
            <button key={id} className={`chip ${!esRango && !rangoOpen && periodo === id ? 'on' : ''}`} onClick={() => irPeriodo(id)}>{lbl}</button>
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
        <button className="chip" onClick={() => document.body.classList.add('cfg-open')}>⚙ Configuración</button>
      </div>

      {/* Navegación de fecha */}
      {!esRango && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)' }}>
          <button className="chip" style={{ width: 30, padding: '5px 0', textAlign: 'center' }} onClick={() => navegar(-1)}>‹</button>
          <b style={{ color: 'var(--ink)' }}>{label}</b>
          <button className="chip" style={{ width: 30, padding: '5px 0', textAlign: 'center' }} onClick={() => navegar(1)}>›</button>
          {fecha !== hoy && <button className="chip" onClick={() => router.replace(`/dashboard/ganancias?p=${periodo}&fecha=${hoy}`)}>Hoy</button>}
        </div>
      )}
      {esRango && <b style={{ color: 'var(--ink)' }}>{label}</b>}

      {/* Hero */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>{sinDatos ? 'Sin operaciones del par en el período' : lead}</div>
        <div className={`hero-num num ${r.neto >= 0 ? 'pos' : 'neg'}`}>{ars(Math.round(r.neto))}</div>
        {!esDefault && (
          <div style={{ marginTop: 10, display: 'inline-block', fontSize: 12.5, fontWeight: 600, background: 'var(--warn-bg)', color: 'var(--warn-ink)', padding: '5px 11px', borderRadius: 8 }}>
            Cálculo con configuración modificada
          </div>
        )}
        {esDefault && !sinDatos && (
          <div style={{ marginTop: 10, display: 'inline-block', fontSize: 12.5, fontWeight: 600, background: 'var(--pos-bg)', color: 'var(--pos-ink)', padding: '5px 11px', borderRadius: 8 }}>
            ✓ Misma cuenta que la solapa COLO de la planilla
          </div>
        )}
      </div>

      {/* Datos del período */}
      {!sinDatos && (
        <div className="kpis-caja" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[
            ['Compraste', `${sym} ${fmt0.format(r.vC)}`, r.vC ? `a $ ${fmt0.format(r.t1)} promedio` : 'sin compras'],
            ['Vendiste', `${sym} ${fmt0.format(r.vV)}`, r.vV ? `a $ ${fmt0.format(r.t2)} promedio` : 'sin ventas'],
            ['Te quedaron en stock', `${sym} ${fmt0.format(r.stock)}`, 'comprados sin vender'],
            ['Gastos', ars(Math.round(r.g)), cfg.gastos && cfg.ops.has('GASTOS') ? 'descontados del total' : 'no descontados'],
          ].map(([k, v, s]) => (
            <div className="kpi" key={k as string}>
              <span className="cur">{k}</span>
              <div className="val num" style={{ fontSize: 18 }}>{v}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s}</div>
            </div>
          ))}
        </div>
      )}

      {/* Desglose */}
      <details className="card" style={{ padding: 0 }}>
        <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '14px 18px', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}>
          ¿Cómo se calcula este número? ›
        </summary>
        <div style={{ borderTop: '1px solid var(--grid)', padding: '6px 18px 14px' }}>
          {sinDatos ? (
            <div style={{ padding: '9px 0', fontSize: 13.5, color: 'var(--muted)' }}>Sin datos para este par en el período.</div>
          ) : ([
            [`Vendiste a <b>$ ${fmt3.format(r.t2)}</b> promedio y compraste a <b>$ ${fmt3.format(r.t1)}</b> → diferencia`, `$ ${fmt3.format(r.spread)}`, r.spread >= 0 ? 'pos' : 'neg'],
            [`<b>${sym} ${fmt0.format(r.calzado)}</b> comprados y vendidos × esa diferencia`, ars(Math.round(r.calzado * r.spread)), r.calzado * r.spread >= 0 ? 'pos' : 'neg'],
            [`<b>${sym} ${fmt0.format(r.stock)}</b> en stock, ${cfg.resid === 'fijo' ? `a margen fijo $ ${fmt3.format(cfg.margen)}` : cfg.resid === 'costo' ? 'valuados al costo' : `valuados a cierre $ ${fmt0.format(cfg.cierre)}`}`, ars(Math.round(r.gResid)), r.gResid > 0 ? 'pos' : ''],
            ['Gastos del período', ars(Math.round(r.g)), r.g < 0 ? 'neg' : ''],
            ['<b>Ganancia neta</b>', ars(Math.round(r.neto)), r.neto >= 0 ? 'pos' : 'neg'],
          ] as [string, string, string][]).map(([d, a, c], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: i < 4 ? '1px solid var(--grid)' : 'none', fontSize: 13.5 }}>
              <span dangerouslySetInnerHTML={{ __html: d }} />
              <b className={`num ${c}`} style={{ whiteSpace: 'nowrap' }}>{a}</b>
            </div>
          ))}
        </div>
      </details>

      <div className="banner banner-info">
        🔒 Módulo con permiso individual — solo lo ven los usuarios con acceso a Ganancias.
        Los supuestos del cálculo (margen del stock, gastos, par de monedas) se ajustan en ⚙ Configuración.
      </div>

      {/* Drawer de configuración */}
      <div className="cfg-scrim" onClick={() => document.body.classList.remove('cfg-open')} />
      <aside className="cfg-drawer" role="dialog" aria-modal="true" aria-label="Configuración del cálculo">
        <div className="cfg-head">
          <b>Configuración del cálculo</b>
          <button className="xbtn" onClick={() => document.body.classList.remove('cfg-open')} aria-label="Cerrar">✕</button>
        </div>
        <div className="cfg-scroll">
          <div className="card param">
            <p className="param-name">Operaciones incluidas</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['COMPRA', 'VENTA', 'GASTOS'].map(op => (
                <button key={op} className={`chip ${cfg.ops.has(op) ? 'on' : ''}`} onClick={() => toggleOp(op)}>{cap(op.toLowerCase())}</button>
              ))}
            </div>
            <div className="param-what">Qué modifica: <b>qué movimientos entran al cálculo</b> (el filtro OPERACIÓN de la planilla actual).</div>
          </div>
          <div className="card param">
            <p className="param-name">Par de monedas</p>
            <select className="input" style={{ maxWidth: '100%' }} value={cfg.par} onChange={e => setC({ par: e.target.value as Cfg['par'] })}>
              <option value="usd">Dólares ↔ Pesos</option>
              <option value="eur">Euros ↔ Pesos</option>
              <option value="brl">Reales ↔ Pesos</option>
              <option value="usdt">USDT ↔ Pesos</option>
            </select>
            <div className="param-what">Qué modifica: <b>sobre qué monedas se mide la ganancia</b>. Cada par tiene su resultado propio, sin mezclarse con los demás.</div>
          </div>
          <div className="card param">
            <p className="param-name">Cuentas corrientes</p>
            <label className="switch">
              <input type="checkbox" checked={cfg.cc} onChange={e => setC({ cc: e.target.checked })} />
              <span className="track" />Incluir operaciones por cta cte
            </label>
            <div className="param-what">Qué modifica: <b>si lo comprado/vendido por cuenta corriente suma al volumen</b>. La planilla lo incluye.</div>
          </div>
          <div className="card param">
            <p className="param-name">{cfg.par === 'usd' ? 'Dólares' : cfg.par === 'eur' ? 'Euros' : cfg.par === 'brl' ? 'Reales' : 'USDT'} que quedan en stock</p>
            <div className="radio-row">
              <label>
                <input type="radio" name="gn-resid" checked={cfg.resid === 'fijo'} onChange={() => setC({ resid: 'fijo' })} />
                Margen fijo por {sym}
                <input className="inline-num num" type="number" value={cfg.margen} step={0.005} min={0}
                  onChange={e => setC({ margen: Number(e.target.value) || 0 })} />
              </label>
              <label>
                <input type="radio" name="gn-resid" checked={cfg.resid === 'costo'} onChange={() => setC({ resid: 'costo' })} />
                Al costo (sin ganancia)
              </label>
              <label>
                <input type="radio" name="gn-resid" checked={cfg.resid === 'mtm'} onChange={() => setC({ resid: 'mtm' })} />
                A cotización de cierre
                <input className="inline-num num" type="number" value={cfg.cierre} step={1} min={0}
                  onChange={e => setC({ cierre: Number(e.target.value) || 0 })} />
              </label>
            </div>
            <div className="param-what">Qué modifica: <b>cuánta ganancia se le asigna a lo comprado que todavía no se vendió</b>. La planilla usa el margen fijo 0,050 (celda T4).</div>
          </div>
          <div className="card param">
            <p className="param-name">Gastos</p>
            <label className="switch">
              <input type="checkbox" checked={cfg.gastos} onChange={e => setC({ gastos: e.target.checked })} />
              <span className="track" />Descontar gastos del período
            </label>
            <div className="param-what">Qué modifica: <b>si el número grande resta los gastos</b>. Apagado muestra la ganancia bruta.</div>
          </div>
        </div>
      </aside>
    </div>
  )
}
