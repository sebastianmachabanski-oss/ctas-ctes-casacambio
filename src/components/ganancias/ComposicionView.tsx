'use client'
import { useMemo, useState } from 'react'
import SelectorPeriodo from '@/components/SelectorPeriodo'
import { componer, SIMBOLO, type DiaAgg } from '@/lib/ganancias-composicion'

/**
 * De dónde sale la ganancia del período.
 *
 * QUÉ RESUELVE
 * La pantalla de Ganancias contesta "cuánto gané" para UNA moneda por vez, y su número
 * incluye los gastos y las transferencias enteros. Entonces los números de cada moneda no
 * se pueden sumar: hacerlo cuenta los gastos tantas veces como monedas haya. Acá el
 * número grande es el del negocio entero, y debajo se ve qué aportó cada moneda.
 *
 * El cálculo NO está acá: vive en `src/lib/ganancias-composicion.ts`, validado por
 * `scripts/validar-ganancias-composicion.mts`.
 */

const fmt0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const fmt2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt3 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const ars = (n: number) => `$ ${n < 0 ? '(' + fmt0.format(-n) + ')' : fmt0.format(n)}`
const usd = (n: number) => `US$ ${n < 0 ? '(' + fmt0.format(-n) + ')' : fmt0.format(n)}`

/** Un color por moneda, estable. No codifica estado: solo identifica la serie. */
const COLOR: Record<string, string> = {
  usd: '#16a34a', eur: '#7c3aed', brl: '#a16207',
  usdt: '#0891b2', gbp: '#be185d', chq: '#475569',
}

export default function ComposicionView({
  dias, periodo, fecha, rDesde, rHasta, hoy, nav,
}: {
  dias: DiaAgg[]
  periodo: string; fecha: string; rDesde: string; rHasta: string; hoy: string
  /** La navegación entre las tres vistas, armada en el servidor. */
  nav?: React.ReactNode
}) {
  const esRango = !!(rDesde && rHasta)
  const [cc, setCc] = useState(true)
  const [gastos, setGastos] = useState(true)
  const [transferencias, setTransferencias] = useState(true)

  const c = useMemo(
    () => componer(dias, { cc, gastos, transferencias }),
    [dias, cc, gastos, transferencias],
  )

  const LEAD: Record<string, string> = {
    dia: 'Resultado del día', semana: 'Resultado de la semana',
    mes: 'Resultado del mes', anio: 'Resultado del año',
  }
  const lead = esRango ? 'Resultado del período' : (LEAD[periodo] ?? 'Resultado del período')
  const sinDatos = c.monedas.length === 0 && c.gastos === 0 && c.transferencias === 0

  // La barra de cada moneda se mide contra el mayor aporte positivo, no contra el
  // subtotal: con una moneda dominante el resto quedaría en un pelo invisible.
  const mayor = Math.max(1, ...c.monedas.map(m => Math.abs(m.aporta)))

  return (
    // `minmax(0, 1fr)` y no `1fr`: sin eso los hijos de una grilla no bajan de su ancho
    // mínimo de contenido y la tabla arrastra la página a lo ancho en el teléfono.
    <div className="px-4 md:px-6 pt-4 pb-6" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <SelectorPeriodo
          ruta="/dashboard/ganancias/composicion"
          periodo={periodo} fecha={fecha} rDesde={rDesde} rHasta={rHasta} hoy={hoy}
        />
        {nav}
      </div>

      {/* El resultado, en las dos monedas */}
      <div className="gn-res">
        <div className="card gn-card">
          <div className="gn-lbl">
            {sinDatos ? 'Sin operaciones en el período' : `${lead} · todas las monedas`}
          </div>
          <div className={`gn-num num ${c.neto >= 0 ? 'pos' : 'neg'}`}>{ars(Math.round(c.neto))}</div>
          <div className="gn-pie">en pesos</div>
        </div>

        <div className="card gn-card">
          <div className="gn-lbl">El mismo resultado, en dólares</div>
          {c.netoUsd === null ? (
            <>
              <div className="gn-num num" style={{ color: 'var(--muted)' }}>—</div>
              <div className="gn-pie">
                no hubo operaciones en dólares en el período de las que tomar la cotización
              </div>
            </>
          ) : (
            <>
              <div className={`gn-num num ${c.netoUsd >= 0 ? 'pos' : 'neg'}`}>{usd(Math.round(c.netoUsd))}</div>
              <div className="gn-pie">
                convertido a <b>$ {fmt3.format(c.cotUsd!)}</b> — cotización promedio de las
                operaciones en dólares del período
              </div>
            </>
          )}
        </div>
      </div>

      {/* De dónde sale */}
      <div className="card">
        <div className="card-h">
          <span className="card-t">De dónde sale</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Cada moneda aporta su parte; los gastos y las transferencias se cuentan una sola vez
          </span>
        </div>

        {c.monedas.length === 0 ? (
          <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--muted)' }}>
            No hubo operaciones de cambio en el período.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cc-tbl densa">
              <thead>
                <tr>
                  <th>Moneda</th>
                  <th>Volumen operado</th>
                  <th>Volumen calzado</th>
                  <th>Spread por unidad</th>
                  <th>Valuación del stock</th>
                  <th>Aporta</th>
                  <th style={{ width: 140 }}>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {c.monedas.map(m => (
                  <tr key={m.par}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span aria-hidden="true" style={{
                          width: 9, height: 9, borderRadius: '50%', flex: 'none',
                          background: COLOR[m.par] ?? 'var(--ink-2)',
                        }} />
                        {m.nombre}
                      </span>
                    </td>
                    {/* Con el símbolo delante, porque la columna mezcla unidades: los
                        cheques se miden en pesos y las divisas en unidades de moneda.
                        Sin él, 11.807.755 de cheques al lado de 589.063 de dólares se
                        lee como si fueran veinte veces más. */}
                    <td className="num" style={{ color: 'var(--muted)' }}>
                      {SIMBOLO[m.par]} {fmt0.format(Math.round(m.operado))}
                    </td>
                    <td className="num">{SIMBOLO[m.par]} {fmt0.format(Math.round(m.calzado))}</td>
                    <td className="num">
                      {m.spread === 0
                        ? <span className="zero">—</span>
                        : `$ ${fmt2.format(m.spread)}`}
                    </td>
                    <td className="num" style={{ color: 'var(--muted)' }}>
                      {m.valuacionStock === 0
                        ? <span className="zero">—</span>
                        : ars(Math.round(m.valuacionStock))}
                    </td>
                    <td className={`num ${m.aporta >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                      {ars(Math.round(m.aporta))}
                    </td>
                    <td>
                      {/* La barra es lectura de magnitud, no decoración: el número ya está
                          a la izquierda, esto dice de un vistazo cuál mueve la aguja. */}
                      <span aria-hidden="true" style={{
                        display: 'block', height: 8, borderRadius: 3,
                        width: `${Math.max(2, Math.abs(m.aporta) / mayor * 100)}%`,
                        background: COLOR[m.par] ?? 'var(--ink-2)',
                        opacity: m.aporta >= 0 ? 1 : 0.35,
                      }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '8px 16px 11px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', borderTop: '1px solid var(--grid)' }}>
          <b style={{ color: 'var(--ink-2)' }}>Operado</b> es todo lo que pasó por la ventanilla,
          compras más ventas. <b style={{ color: 'var(--ink-2)' }}>Calzado</b> es la parte que se
          compró <i>y</i> se vendió: la única que generó spread. La diferencia quedó en stock, y
          el stock se valúa con el supuesto de cada moneda.
        </div>

        {/* Lo que se cuenta UNA sola vez */}
        <div style={{ borderTop: '2px solid var(--grid)' }}>
          <Linea texto="Subtotal por cambio de monedas" valor={c.subtotalMonedas} />
          <Linea
            texto="Transferencias"
            nota={transferencias ? 'una sola vez' : 'sin contar'}
            valor={c.transferencias}
            apagado={!transferencias}
          />
          <Linea
            texto="Gastos"
            nota={gastos ? 'una sola vez' : 'sin contar'}
            valor={c.gastos}
            apagado={!gastos}
          />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderTop: '2px solid var(--grid)',
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{lead}</span>
            <span className={`num ${c.neto >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 17, fontWeight: 800 }}>
              {ars(Math.round(c.neto))}
            </span>
          </div>
        </div>
      </div>

      {/* Qué entra en la cuenta */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="sec-lbl" style={{ marginRight: 2 }}>Qué entra</span>
        <button className={`chip ${cc ? 'on' : ''}`} onClick={() => setCc(v => !v)} aria-pressed={cc}>
          Cuenta corriente
        </button>
        <button className={`chip ${gastos ? 'on' : ''}`} onClick={() => setGastos(v => !v)} aria-pressed={gastos}>
          Gastos
        </button>
        <button className={`chip ${transferencias ? 'on' : ''}`} onClick={() => setTransferencias(v => !v)} aria-pressed={transferencias}>
          Transferencias
        </button>
      </div>

      {/* Avisos: una moneda con transferencias que no se pudo convertir queda fuera del
          total, y callarlo haría que el número grande esté mal sin ninguna señal. */}
      {c.ttSinCotizacion.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.5, borderLeft: '3px solid var(--warn-ink)' }}>
          ⚠️ Hay transferencias en{' '}
          <b>{c.ttSinCotizacion.map(p => SIMBOLO[p]).join(', ')}</b>{' '}
          que no se pudieron pasar a pesos: en el período no hubo compras ni ventas de esas
          monedas de las que tomar una cotización. <b>No están sumadas</b> en el resultado.
        </div>
      )}

      {c.sinMovimiento.length > 0 && c.monedas.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          Sin operaciones en el período: {c.sinMovimiento.map(p => SIMBOLO[p]).join(' · ')}
        </div>
      )}
    </div>
  )
}

/** Una línea del cierre: concepto a la izquierda, importe a la derecha. */
function Linea({ texto, nota, valor, apagado = false }: {
  texto: string; nota?: string; valor: number; apagado?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 16px', borderTop: '1px solid var(--grid)',
      opacity: apagado ? 0.5 : 1,
    }}>
      <span style={{ fontSize: 13 }}>
        {texto}
        {nota && <span style={{ color: 'var(--muted)' }}> · {nota}</span>}
      </span>
      <span className={`num ${valor < 0 ? 'neg' : ''}`} style={{ fontSize: 13, fontWeight: 650 }}>
        {ars(Math.round(valor))}
      </span>
    </div>
  )
}
