'use client'
import { Fragment, useMemo, useState } from 'react'

/**
 * Reportes de caja: saldos por cliente y evolución del saldo en dólares.
 *
 * Vivían en Inicio hasta el 10/9/2026. Se mudaron a Ganancias, que pasó a ser la pantalla
 * de análisis, mientras Inicio quedó como la pantalla operativa (saldos, cotizaciones y
 * el listado de transacciones).
 *
 * OJO CON EL ALCANCE: Ganancias es exclusivo de superadmin (`veGanancias`). Al mudarse,
 * estos reportes dejaron de estar al alcance de operadores y administradores. Fue una
 * decisión explícita del 10/9/2026, no un efecto colateral.
 *
 * El período lo manda la pantalla que los contiene: los saldos por cliente se consultan
 * con ese rango y el gráfico ajusta su ventana.
 */

export type Cliente = { nombre: string; pesos: number; dolares: number; euros: number; reales: number; ultimo: string | null }
export type Punto = { fecha: string; saldo: number }

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const money = (n: number) => n < 0 ? `(${fmt.format(-Math.round(n))})` : fmt.format(Math.round(n))
const fecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const cell = (n: number) => n === 0
  ? <td className="zero">—</td>
  : <td className={`num ${n < 0 ? 'neg' : ''}`}>{money(n)}</td>

/** Cuántos días de historia muestra el gráfico según el período elegido. */
const VENTANA: Record<string, number> = { dia: 3, semana: 7, mes: 30, anio: 365, '': 90 }

// Un cliente es "activo" si operó en los últimos 60 días. Los inactivos no se listan
// —son cientos y entierran a los que sí operan—, pero siguen estando: aparecen apenas
// se los busca por nombre, o con el botón "Ver todos".
const DIAS_ACTIVO = 60

export default function ReportesCaja({ clientesCaja, clientesCC, serieUSD, hoy, periodo, rDesde, rHasta }: {
  clientesCaja: Cliente[]; clientesCC: Cliente[]; serieUSD: Punto[]
  hoy: string
  /** dia | semana | mes | anio, o '' cuando manda un rango explícito. */
  periodo: string
  rDesde: string; rHasta: string
}) {
  const [vista, setVista] = useState<'caja' | 'cc'>('caja')
  const [busca, setBusca] = useState('')
  const [verTodos, setVerTodos] = useState(false)
  const esRango = !!(rDesde || rHasta)

  const ventana = esRango && rDesde && rHasta
    ? Math.max(2, Math.round((new Date(rHasta).getTime() - new Date(rDesde).getTime()) / 86400000))
    : (VENTANA[periodo] ?? 90)
  const esTodo = !periodo && !esRango

  // El hero del gráfico muestra siempre el saldo ACTUAL (último punto de la serie).
  const saldoUSD = serieUSD.length ? serieUSD[serieUSD.length - 1].saldo : 0

  // Fecha de corte de la actividad, calculada sobre el "hoy" de Argentina que manda el
  // servidor (no sobre el reloj del navegador, que puede estar en otro huso).
  const corte = useMemo(() => {
    const d = new Date(hoy + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - DIAS_ACTIVO)
    return d.toISOString().slice(0, 10)
  }, [hoy])

  const fuente = vista === 'caja' ? clientesCaja : clientesCC
  // Orden ALFABÉTICO (3/9/2026). Antes mandaba la fecha del último movimiento, de la más
  // reciente a la más vieja, y el nombre solo desempataba. En pantalla eso se leía como la
  // lista repitiéndose: cada fecha distinta arrancaba de nuevo por la A, así que un listado
  // de dos meses eran veinte bloques alfabéticos encadenados y encontrar una cuenta a ojo
  // significaba recorrerlos todos. La fecha sigue en su columna, que es donde sirve.
  const ordenados = useMemo(() => (
    [...fuente].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
  ), [fuente])

  // Caja responde al período elegido: con Día/Semana/Mes la consulta ya trae solo a los
  // que operaron en esa ventana, y con Año o un rango pasado esconder por antigüedad
  // vaciaría la tabla justo cuando el usuario pidió mirar atrás. Así que ahí no se
  // esconde nada. Cta cte, en cambio, es siempre el histórico completo: el corte aplica
  // siempre.
  const cortaPorActividad = vista === 'cc' || esTodo

  const { filtrados, ocultos, desdeInactivos } = useMemo(() => {
    const q = busca.trim().toUpperCase()
    const coinciden = q
      ? ordenados.filter(c => (c.nombre || '').toUpperCase().includes(q))
      : ordenados
    // Buscando se ve TODO: si el usuario escribe un nombre, quiere ese cliente aunque
    // no opere hace un año. El corte solo aplica a la lista sin buscar.
    // Si ninguna fila trae fecha, la migración todavía no corrió: se muestra todo antes
    // que dejar la tabla vacía.
    if (q || !cortaPorActividad || !coinciden.some(c => c.ultimo)) {
      return { filtrados: coinciden, ocultos: 0, desdeInactivos: null }
    }
    const activos: Cliente[] = [], inactivos: Cliente[] = []
    for (const c of coinciden) ((c.ultimo ?? '') >= corte ? activos : inactivos).push(c)
    if (!verTodos) return { filtrados: activos, ocultos: inactivos.length, desdeInactivos: null }
    // Con "Ver todos" los inactivos van DETRÁS, en su propio bloque alfabético y separados
    // por un renglón que lo dice. Intercalarlos por nombre volvería a enterrar a los que
    // operan, que es justo lo que el corte de 60 días viene a evitar.
    return {
      filtrados: [...activos, ...inactivos],
      ocultos: 0,
      desdeInactivos: inactivos.length ? activos.length : null,
    }
  }, [ordenados, busca, corte, verTodos, cortaPorActividad])

  return (
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
            <thead><tr><th>Cliente</th><th>Pesos</th><th>Dólares</th><th>Euros</th><th>Reales</th><th>Último mov.</th></tr></thead>
            <tbody>
              {filtrados.slice(0, 400).map((c, i) => (
                <Fragment key={c.nombre + i}>
                  {/* Sin este renglón, el segundo bloque vuelve a empezar por la A y se
                      lee como si la lista se repitiera. */}
                  {i === desdeInactivos && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--soft, #f1f5f9)', color: 'var(--muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
                        Sin movimientos en {DIAS_ACTIVO} días
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>{c.nombre}</td>{cell(c.pesos)}{cell(c.dolares)}{cell(c.euros)}{cell(c.reales)}
                    <td className={cortaPorActividad && c.ultimo && c.ultimo < corte ? 'zero' : ''} style={{ whiteSpace: 'nowrap' }}>
                      {c.ultimo ? fecha(c.ultimo) : '—'}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px 12px', color: 'var(--muted)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            {filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''} · vista {vista === 'caja' ? 'Caja' : 'Cta cte'}
            {filtrados.length > 400 ? ' · mostrando primeros 400 (afiná la búsqueda)' : ''}
          </span>
          {ocultos > 0 && (
            <>
              <span>· {ocultos} sin movimientos en {DIAS_ACTIVO} días</span>
              <button className="chip" onClick={() => setVerTodos(true)}>Ver todos</button>
            </>
          )}
          {verTodos && cortaPorActividad && !busca.trim() && (
            <button className="chip" onClick={() => setVerTodos(false)}>Ver solo activos</button>
          )}
        </div>
      </section>

      {/* Gráficos */}
      <div style={{ display: 'grid', gap: 14, minWidth: 0, gridTemplateRows: 'auto 1fr' }}>
        <section className="card">
          <div className="card-h"><h2 className="card-t">Saldo en caja — Dólares</h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {esRango ? 'rango elegido' : (periodo || 'Todo')}
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
