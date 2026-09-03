'use client'
import { useEffect, useMemo, useState } from 'react'
import SelectorPeriodo from '@/components/SelectorPeriodo'

// "COMPRA" -> "Compra" en los chips de operación.
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Cálculo de la ganancia del período:
//   ganancia = calzado × (tasa venta − tasa compra) + valuación del stock + gastos
// El servidor manda los días agregados; acá se aplica la configuración en vivo.
//
// La ganancia es de PERÍODO, no de transacción: nace del calce entre lo comprado y lo
// vendido, así que una compra no genera ganancia hasta que se vende. Ver docs/GANANCIAS.md.

export type ParAgg = { vC: number; aC: number; vV: number; aV: number; vCcc: number; aCcc: number; vVcc: number; aVcc: number }
/** Neto de las transferencias (op = 'T') del día, por moneda: lo que entra menos lo que sale. */
export type TTAgg = { usd: number; eur: number; brl: number; usdt: number; chq: number; pesos: number }
export type DiaAgg = { f: string; usd: ParAgg; eur: ParAgg; brl: ParAgg; usdt: ParAgg; chq: ParAgg; g: number; gcc: number; tt: TTAgg }

type Cfg = {
  ops: Set<string>; par: 'usd' | 'eur' | 'brl' | 'usdt' | 'chq'; cc: boolean
  resid: 'fijo' | 'costo' | 'mtm'; margen: number; cierre: number; gastos: boolean
  /** Sumar el resultado de las transferencias (op = 'T'). */
  transferencias: boolean
}

const fmt0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const fmt3 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const ars = (n: number) => `$ ${n < 0 ? '(' + fmt0.format(-n) + ')' : fmt0.format(n)}`
const usd = (n: number) => `US$ ${n < 0 ? '(' + fmt0.format(-n) + ')' : fmt0.format(n)}`
const SYM: Record<string, string> = { usd: 'US$', eur: '€', brl: 'R$', usdt: 'USDT', chq: 'CH$', pesos: '$' }
const NOMBRE_PAR: Record<string, string> = { usd: 'Dólares', eur: 'Euros', brl: 'Reales', usdt: 'USDT', chq: 'Cheques' }

/** Las monedas de un neto de transferencias que efectivamente tienen algo, para listarlas. */
const monedasConSaldo = (t: TTAgg) =>
  (['usd', 'eur', 'brl', 'usdt', 'chq', 'pesos'] as const)
    .map(k => [k, t[k]] as const)
    .filter(([, v]) => Math.round(v) !== 0)

// Supuestos de valuación del stock, por par. En divisas el estándar del negocio es el
// margen fijo. CHEQUES es distinto: la ganancia del descuento de documentos se reconoce
// EN EL MOMENTO DEL DESCUENTO (criterio del cliente, 11/8/2026), no cuando el cheque se
// cobra. Eso se obtiene valuando la cartera a VALOR NOMINAL —"cotización de cierre" = 1
// peso por peso de cheque—: la diferencia entre el nominal y lo pagado cae como ganancia
// en el período en que se tomó el documento, y el período del cobro queda en cero, sin
// duplicar. Heredar el default de divisas sería desastroso: con cierre 1.500, un millón
// de cheques en cartera mostraría más de 1.499 millones de ganancia inexistente.
const SUPUESTOS_PAR: Record<Cfg['par'], Pick<Cfg, 'resid' | 'margen' | 'cierre'>> = {
  usd:  { resid: 'fijo', margen: 0.05, cierre: 1500 },
  eur:  { resid: 'fijo', margen: 0.05, cierre: 1500 },
  brl:  { resid: 'fijo', margen: 0.05, cierre: 1500 },
  usdt: { resid: 'fijo', margen: 0.05, cierre: 1500 },
  chq:  { resid: 'mtm',  margen: 0.05, cierre: 1 },
}


// Totales del período según la configuración (misma cuenta que el mockup validado).
//
// `cotPar` es la cotización implícita del par en el período; se necesita para expresar en
// pesos el resultado de las transferencias, que nace en la moneda de la operación.
function calc(dias: DiaAgg[], cfg: Cfg, cotPar: number | null) {
  let vC = 0, aC = 0, vV = 0, aV = 0, g = 0
  for (const d of dias) {
    const p = d[cfg.par]
    if (cfg.ops.has('COMPRA')) { vC += p.vC + (cfg.cc ? p.vCcc : 0); aC += p.aC + (cfg.cc ? p.aCcc : 0) }
    if (cfg.ops.has('VENTA')) { vV += p.vV + (cfg.cc ? p.vVcc : 0); aV += p.aV + (cfg.cc ? p.aVcc : 0) }
    if (cfg.ops.has('GASTOS') && cfg.gastos) g += d.g + (cfg.cc ? d.gcc : 0)
  }
  // TRANSFERENCIAS (op = 'T'): la ganancia es lo que entra menos lo que sale, sin calce
  // ni spread — no tienen pata en pesos de la que sacar una tasa. El neto nace en la
  // moneda de la operación, así que para sumarlo al total en pesos hay que convertirlo
  // con la cotización del período. Las transferencias que YA son en pesos entran directo.
  let ttMoneda = 0, ttEnPesosDirecto = 0
  for (const d of dias) { ttMoneda += d.tt[cfg.par]; ttEnPesosDirecto += d.tt.pesos }
  const ttConvertible = cotPar != null
  const ttEnPesos = cfg.transferencias
    ? (ttConvertible ? ttMoneda * cotPar! : 0) + ttEnPesosDirecto
    : 0

  const t1 = vC ? aC / vC : 0, t2 = vV ? aV / vV : 0
  const spread = (vC && vV) ? t2 - t1 : 0
  const calzado = Math.min(vC, vV), stock = Math.abs(vC - vV)
  let gResid = 0
  if (cfg.resid === 'fijo') gResid = stock * cfg.margen
  else if (cfg.resid === 'mtm') gResid = vC >= vV ? stock * (cfg.cierre - t1) : stock * (t2 - cfg.cierre)
  const neto = calzado * spread + gResid + g + ttEnPesos
  return {
    vC, aC, vV, aV, t1, t2, spread, calzado, stock, gResid, g, neto,
    ttMoneda, ttEnPesos,
    // Hubo transferencias pero no se pudieron pasar a pesos: sin operaciones del par en
    // el período no hay cotización de la cual tomarla. Se avisa en vez de sumar cero
    // como si no hubiera pasado nada.
    ttSinCotizacion: cfg.transferencias && ttMoneda !== 0 && !ttConvertible,
  }
}

/**
 * Cotización con la que se expresa el resultado en dólares: promedio de TODAS las
 * operaciones en dólares del período, ponderado por volumen (compras + ventas, caja y
 * cuenta corriente). Sale de las operaciones reales, no de una cotización externa ni
 * de la del día de hoy.
 *
 * Se toma SIEMPRE del par dólares, sin importar el par elegido en la configuración:
 * si se usara la del par, con euros seleccionado el panel mostraría euros rotulados
 * como dólares.
 *
 * Devuelve null si en el período no hubo operaciones en dólares de las que derivarla.
 */
function cotizacionPar(dias: DiaAgg[], par: Cfg['par']): number | null {
  let vol = 0, ars = 0
  for (const d of dias) {
    const p = d[par]
    vol += p.vC + p.vCcc + p.vV + p.vVcc
    ars += p.aC + p.aCcc + p.aV + p.aVcc
  }
  return vol > 0 ? ars / vol : null
}
const cotizacionUsd = (dias: DiaAgg[]) => cotizacionPar(dias, 'usd')


export default function GananciasView({ dias, abiertas, gruposAbiertos, periodo, fecha, rDesde, rHasta, hoy }: {
  dias: DiaAgg[]
  /** Posición de las transferencias con una sola punta cargada (acumulada, no del período). */
  abiertas: TTAgg
  /** Cuántos grupos de transferencia están sin cerrar. */
  gruposAbiertos: number
  periodo: string; fecha: string; rDesde: string; rHasta: string; hoy: string
}) {
  const esRango = !!(rDesde && rHasta)

  const [cfg, setCfg] = useState<Cfg>({
    ops: new Set(['COMPRA', 'VENTA', 'GASTOS']), par: 'usd', cc: true,
    resid: 'fijo', margen: 0.05, cierre: 1500, gastos: true, transferencias: true,
  })
  const setC = (patch: Partial<Cfg>) => setCfg(c => ({ ...c, ...patch }))
  const toggleOp = (op: string) => setCfg(c => {
    const ops = new Set(c.ops); ops.has(op) ? ops.delete(op) : ops.add(op)
    return { ...c, ops }
  })
  const esDefault = cfg.ops.size === 3 && cfg.par === 'usd' && cfg.cc && cfg.resid === 'fijo'
    && Math.abs(cfg.margen - 0.05) < 1e-9 && cfg.gastos && cfg.transferencias

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') document.body.classList.remove('cfg-open') }
    window.addEventListener('keydown', onEsc)
    return () => { window.removeEventListener('keydown', onEsc); document.body.classList.remove('cfg-open') }
  }, [])

  const cotPar = useMemo(() => cotizacionPar(dias, cfg.par), [dias, cfg.par])
  const r = useMemo(() => calc(dias, cfg, cotPar), [dias, cfg, cotPar])
  // Equivalente en dólares del mismo resultado. Por construcción se cumple exacto que
  // netoUsd × cotUsd = neto en pesos, así que los dos paneles nunca se contradicen.
  const cotUsd = useMemo(() => cotizacionUsd(dias), [dias])
  const netoUsd = cotUsd ? r.neto / cotUsd : null


  const LEAD: Record<string, string> = { dia: 'Este día ganaste', semana: 'Esta semana ganaste', mes: 'Este mes ganaste', anio: 'Este año ganaste' }
  const lead = esRango ? 'En el período ganaste' : (LEAD[periodo] ?? 'Ganaste')
  const sinDatos = r.vC === 0 && r.vV === 0 && r.g === 0 && r.ttMoneda === 0
  const sym = SYM[cfg.par]
  // Los cheques se valúan contra su valor nominal (1), no contra una cotización de
  // mercado: el rótulo y el paso del campo cambian para que se lea como lo que es.
  const esChq = cfg.par === 'chq'

  return (
    <div className="p-4 md:p-6" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, maxWidth: 760 }}>
      {/* Filtros de período + configuración */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <SelectorPeriodo
          ruta="/dashboard/ganancias"
          periodo={periodo} fecha={fecha} rDesde={rDesde} rHasta={rHasta} hoy={hoy}
        />
        <button className="chip" onClick={() => document.body.classList.add('cfg-open')}>⚙ Configuración</button>
      </div>

      {/* Resultado: el mismo número en las dos monedas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>{sinDatos ? 'Sin operaciones del par en el período' : lead}</div>
          <div className={`hero-num num ${r.neto >= 0 ? 'pos' : 'neg'}`}>{ars(Math.round(r.neto))}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>en pesos</div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>El mismo resultado, en dólares</div>
          {netoUsd === null ? (
            <>
              <div className="hero-num num" style={{ color: 'var(--muted)' }}>—</div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                {sinDatos
                  ? 'sin operaciones en el período'
                  : 'no hubo operaciones en dólares en el período de las que tomar la cotización'}
              </div>
            </>
          ) : (
            <>
              <div className={`hero-num num ${netoUsd >= 0 ? 'pos' : 'neg'}`}>{usd(Math.round(netoUsd))}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                convertido a <b>$ {fmt3.format(cotUsd!)}</b> — cotización promedio de las
                operaciones en dólares del período
              </div>
            </>
          )}
        </div>
      </div>

      {r.ttSinCotizacion && (
        <div className="card" style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.5, borderLeft: '3px solid var(--warn-ink)' }}>
          ⚠️ En el período hay <b>{sym} {fmt0.format(Math.round(r.ttMoneda))}</b> de resultado por
          transferencias, pero <b>no se pudieron sumar al total</b>: no hubo compras ni ventas de
          {' '}{NOMBRE_PAR[cfg.par].toLowerCase()} de las que tomar una cotización para pasarlos a pesos.
        </div>
      )}

      {/* Transferencias en curso: NO son ganancia todavía. Mostrarlas como resultado sería
          contar como ganado algo que puede no volver nunca; esconderlas sería peor, porque
          es plata real inmovilizada. Van acá, rotuladas como posición. */}
      {gruposAbiertos > 0 && (
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13.5 }}>Transferencias en curso</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {gruposAbiertos} grupo{gruposAbiertos !== 1 ? 's' : ''} con una sola punta cargada
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '10px 0 8px' }}>
            {monedasConSaldo(abiertas).map(([k, v]) => (
              <span key={k} className={`num ${v >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 17, fontWeight: 700 }}>
                {SYM[k]} {v < 0 ? `(${fmt0.format(-Math.round(v))})` : fmt0.format(Math.round(v))}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            No suman al resultado: son transferencias donde se cargó el ingreso y falta el egreso
            (o al revés), así que todavía no hay ganancia que medir. Es una <b>posición</b> acumulada
            al cierre del período, no un resultado del período. Entran al cálculo apenas se carga
            la punta que falta.
          </div>
        </div>
      )}

      {!esDefault && (
        <div style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 600, background: 'var(--warn-bg)', color: 'var(--warn-ink)', padding: '5px 11px', borderRadius: 8 }}>
          Cálculo con configuración modificada
        </div>
      )}
      {esDefault && !sinDatos && (
        <div style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 600, background: 'var(--pos-bg)', color: 'var(--pos-ink)', padding: '5px 11px', borderRadius: 8 }}>
          ✓ Cálculo con los supuestos estándar
        </div>
      )}

      {/* Datos del período */}
      {!sinDatos && (
        <div className="kpis-caja" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[
            ['Compraste', `${sym} ${fmt0.format(r.vC)}`, r.vC ? `a $ ${fmt0.format(r.t1)} promedio` : 'sin compras'],
            ['Vendiste', `${sym} ${fmt0.format(r.vV)}`, r.vV ? `a $ ${fmt0.format(r.t2)} promedio` : 'sin ventas'],
            ['Te quedaron en stock', `${sym} ${fmt0.format(r.stock)}`, 'comprados sin vender'],
            ['Gastos', ars(Math.round(r.g)), cfg.gastos && cfg.ops.has('GASTOS') ? 'descontados del total' : 'no descontados'],
            ['Transferencias cerradas', `${sym} ${fmt0.format(Math.round(r.ttMoneda))}`,
              !cfg.transferencias ? 'no sumadas'
                : r.ttMoneda === 0 ? 'sin transferencias del par'
                : r.ttSinCotizacion ? '⚠️ sin cotización para pasarlas a pesos'
                : `${ars(Math.round(r.ttEnPesos))} sumados al total`],
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
          {/* Explicación del método, para que el número no sea una caja negra. */}
          <div style={{ padding: '12px 0 6px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            <p style={{ margin: '0 0 8px' }}>
              <b>En pesos.</b> La ganancia surge del <b>calce</b> entre lo que compraste y lo que
              vendiste en el período, no de cada transacción por separado: una compra no genera
              ganancia hasta que se vende. Se promedian las tasas de compra y de venta —ponderadas
              por volumen—, la diferencia se multiplica por el volumen que se compró <i>y</i> se
              vendió, y a eso se le suma la valuación de lo que quedó en stock y se le restan los
              gastos.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <b>Transferencias.</b> Las operaciones marcadas con <b>Op = T</b> no pasan por ese
              calce: no tienen pata en pesos, así que no hay tasa de compra ni de venta de la que
              sacar un spread. Su ganancia es lo que <b>entra menos lo que sale</b> de cada par de
              movimientos, en la moneda de la operación, y se suma al total convertida con la misma
              cotización del período. Se puede desactivar en ⚙ Configuración.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <b>Solo cuentan las transferencias cerradas.</b> Una transferencia recién tiene
              resultado cuando están cargadas <b>sus dos puntas</b>: el ingreso y el egreso. Si
              falta una, lo cargado no es ganancia sino plata en tránsito, y se muestra aparte
              como <b>transferencias en curso</b>. Cuando se carga la punta que falta, el grupo
              pasa a contar — cada movimiento en la fecha en que ocurrió, no en la del cierre.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <b>En dólares.</b> Es el mismo resultado, convertido con la cotización promedio
              ponderada de las operaciones <b>en dólares</b> del propio período. No se usa una
              cotización externa ni la del día de hoy: sale de las operaciones reales. Se toma
              siempre del par dólares aunque estés mirando euros o reales — si no, el panel
              mostraría euros rotulados como dólares. No es otro cálculo: es el mismo importe
              en otra moneda, el resultado en pesos dividido por esa cotización. Los dos
              paneles se muestran redondeados, así que rehacer la multiplicación a mano puede
              dar una diferencia de unos pesos.
            </p>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
              Al ser un cálculo de período, el mismo conjunto de operaciones da un número distinto
              según mires el día, la semana o el mes: las tasas promedio se recalculan sobre el
              conjunto elegido. Por eso la suma de los días no da el total del mes.
            </p>
          </div>
          {sinDatos ? (
            <div style={{ padding: '9px 0', fontSize: 13.5, color: 'var(--muted)' }}>Sin datos para este par en el período.</div>
          ) : ([
            [`Vendiste a <b>$ ${fmt3.format(r.t2)}</b> promedio y compraste a <b>$ ${fmt3.format(r.t1)}</b> → diferencia`, `$ ${fmt3.format(r.spread)}`, r.spread >= 0 ? 'pos' : 'neg'],
            [`<b>${sym} ${fmt0.format(r.calzado)}</b> comprados y vendidos × esa diferencia`, ars(Math.round(r.calzado * r.spread)), r.calzado * r.spread >= 0 ? 'pos' : 'neg'],
            [`<b>${sym} ${fmt0.format(r.stock)}</b> en ${esChq ? 'cartera' : 'stock'}, ${cfg.resid === 'fijo' ? `a margen fijo $ ${fmt3.format(cfg.margen)}` : cfg.resid === 'costo' ? 'valuados al costo' : esChq ? `valuados a nominal $ ${fmt3.format(cfg.cierre)}` : `valuados a cierre $ ${fmt0.format(cfg.cierre)}`}`, ars(Math.round(r.gResid)), r.gResid > 0 ? 'pos' : ''],
            ['Gastos del período', ars(Math.round(r.g)), r.g < 0 ? 'neg' : ''],
            ['<b>Ganancia neta</b>', ars(Math.round(r.neto)), r.neto >= 0 ? 'pos' : 'neg'],
            ...(cotUsd !== null
              ? [[`La misma ganancia ÷ <b>$ ${fmt3.format(cotUsd)}</b> (cotización promedio de las operaciones en dólares del período)`,
                   usd(Math.round(netoUsd!)), netoUsd! >= 0 ? 'pos' : 'neg'] as [string, string, string]]
              : []),
          ] as [string, string, string][]).map(([d, a, c], i, arr) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--grid)' : 'none', fontSize: 13.5 }}>
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
            <div className="param-what">Qué modifica: <b>qué movimientos entran al cálculo</b>.</div>
          </div>
          <div className="card param">
            <p className="param-name">Par de monedas</p>
            <select className="input" style={{ maxWidth: '100%' }} value={cfg.par}
              onChange={e => {
                // Al cambiar de par se reponen sus supuestos de valuación: cada moneda
                // tiene el suyo y arrastrar el de la anterior daría un número sin sentido.
                const par = e.target.value as Cfg['par']
                setC({ par, ...SUPUESTOS_PAR[par] })
              }}>
              <option value="usd">Dólares ↔ Pesos</option>
              <option value="eur">Euros ↔ Pesos</option>
              <option value="brl">Reales ↔ Pesos</option>
              <option value="usdt">USDT ↔ Pesos</option>
              <option value="chq">Cheques ↔ Pesos</option>
            </select>
            <div className="param-what">Qué modifica: <b>sobre qué monedas se mide la ganancia</b>. Cada par tiene su resultado propio, sin mezclarse con los demás.</div>
          </div>
          <div className="card param">
            <p className="param-name">Cuentas corrientes</p>
            <label className="switch">
              <input type="checkbox" checked={cfg.cc} onChange={e => setC({ cc: e.target.checked })} />
              <span className="track" />Incluir operaciones por cta cte
            </label>
            <div className="param-what">Qué modifica: <b>si lo comprado/vendido por cuenta corriente suma al volumen</b>. Por defecto se incluye.</div>
          </div>
          <div className="card param">
            <p className="param-name">{NOMBRE_PAR[cfg.par]} que quedan en stock</p>
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
                {esChq ? 'A valor nominal' : 'A cotización de cierre'}
                <input className="inline-num num" type="number" value={cfg.cierre} step={esChq ? 0.01 : 1} min={0}
                  onChange={e => setC({ cierre: Number(e.target.value) || 0 })} />
              </label>
            </div>
            <div className="param-what">Qué modifica: <b>cuánta ganancia se le asigna a lo comprado que todavía no se vendió</b>. {esChq
              ? 'En cheques el criterio es valuar la cartera a valor nominal (1,00): así la diferencia contra lo pagado se reconoce como ganancia en el momento del descuento.'
              : 'El criterio estándar es el margen fijo de 0,050.'}</div>
          </div>
          <div className="card param">
            <p className="param-name">Gastos</p>
            <label className="switch">
              <input type="checkbox" checked={cfg.gastos} onChange={e => setC({ gastos: e.target.checked })} />
              <span className="track" />Descontar gastos del período
            </label>
            <div className="param-what">Qué modifica: <b>si el número grande resta los gastos</b>. Apagado muestra la ganancia bruta.</div>
          </div>
          <div className="card param">
            <p className="param-name">Transferencias</p>
            <label className="switch">
              <input type="checkbox" checked={cfg.transferencias} onChange={e => setC({ transferencias: e.target.checked })} />
              <span className="track" />Sumar el resultado de las transferencias
            </label>
            <div className="param-what">
              Qué modifica: <b>si el número grande incluye las transferencias</b> (las operaciones
              marcadas con Op = T). Su ganancia es lo que ENTRA menos lo que SALE de cada par, sin
              calce ni spread: no tienen pata en pesos y por eso no entran en el cálculo de
              compras y ventas. El neto se convierte a pesos con la cotización del período.
              Solo cuentan las que tienen <b>sus dos puntas cargadas</b>; las que están a medio
              cargar se muestran aparte como transferencias en curso y este interruptor no las toca.
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
