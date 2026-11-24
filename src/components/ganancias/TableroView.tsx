'use client'
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { SIMBOLO } from '@/lib/ganancias-composicion'
import type { Comparacion, MesSerie } from '@/lib/ganancias-series'

/**
 * Cómo viene el negocio: trece meses y la comparación.
 *
 * La pantalla de Ganancias y la de composición contestan sobre UN período. Esta contesta
 * lo que ninguna de las dos puede: si el mes fue bueno o malo comparado con algo, si la
 * tendencia sube o baja, y de qué está hecho el resultado a lo largo del tiempo.
 *
 * EL GRÁFICO
 * Barras apiladas cuyos cuatro componentes SUMAN el resultado del mes: spread, valuación
 * del stock y transferencias hacia arriba; gastos hacia abajo. La raya horizontal sobre
 * cada columna marca el neto, que es lo que queda. Apilar solo las partes positivas
 * mentiría: la columna se vería más alta que el resultado.
 *
 * Paleta: slots 1 a 4 del orden categórico validado (azul, naranja, aqua, amarillo),
 * verificada con el script de la guía de gráficos sobre superficie clara. Los dos
 * últimos quedan por debajo de 3:1 contra el fondo, y por eso la vista de tabla no es
 * opcional: es el respaldo que exige esa advertencia.
 */

const fmt0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const fmt1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const ars = (n: number) => `$ ${n < 0 ? '(' + fmt0.format(-n) + ')' : fmt0.format(n)}`
const usd = (n: number) => `US$ ${n < 0 ? '(' + fmt0.format(-n) + ')' : fmt0.format(n)}`
/** Millones, para el eje: trece etiquetas de ocho dígitos no se leen. */
const mill = (n: number) => fmt1.format(n / 1_000_000)
const pct = (v: number) => `${v >= 0 ? '▲' : '▼'} ${fmt1.format(Math.abs(v) * 100)} %`

const ALTO = 180

/** Los cuatro componentes del resultado, en orden fijo. El color sigue al componente. */
const COMPONENTES = [
  { id: 'spread', label: 'Ganancia por spread', color: '#2a78d6' },
  { id: 'tenencia', label: 'Valuación del stock', color: '#eb6834' },
  { id: 'tt', label: 'Transferencias', color: '#1baf7a' },
  { id: 'gastos', label: 'Gastos', color: '#eda100' },
] as const

const partesDe = (m: MesSerie) => ({
  spread: m.porSpread,
  tenencia: m.porTenencia,
  tt: m.c.transferencias,
  gastos: m.c.gastos,
})

export default function TableroView({ serie, comparacion, mesCursor, mesAnterior, mesSiguiente, haySiguiente, nav }: {
  serie: MesSerie[]
  /**
   * La comparación, calculada en el servidor. Viene aparte de `serie` porque cuando el
   * mes en curso todavía no cerró se calcula sobre los meses RECORTADOS al mismo tramo,
   * mientras que el gráfico sigue mostrando los meses enteros.
   */
  comparacion: Comparacion | null
  /** La navegación entre las tres vistas, armada en el servidor. */
  nav?: React.ReactNode
  /** 'AAAA-MM' del mes que se está mirando: el último de la serie. */
  mesCursor: string
  /** Fechas listas para los enlaces de navegación. */
  mesAnterior: string
  mesSiguiente: string
  haySiguiente: boolean
}) {
  const [tabla, setTabla] = useState(false)
  // El tooltip se dibuja con `position: fixed` y coordenadas medidas al entrar, NO
  // adentro de la columna: el contenedor del gráfico lleva `overflow-x: auto` para que
  // en pantalla angosta se pueda arrastrar, y eso obliga al navegador a recortar también
  // en vertical. Dentro de la columna, el tooltip existía en el DOM y no se veía.
  const [sobre, setSobre] = useState<{ i: number; x: number; y: number } | null>(null)

  const cmp = comparacion
  // El resultado grande es el del mes ENTERO que corre, no el del tramo recortado: lo que
  // se recorta es la base de la comparación, no lo ganado.
  const actual = serie[serie.length - 1]
  /** Día hasta el que llega el mes en curso, o `null` si el mes ya cerró. */
  const tramo = comparacion?.tramo ?? null

  // Escala común a las trece columnas. Se mide el apilado positivo y el negativo por
  // separado: con los gastos abajo, el cero no está en el piso del gráfico.
  const { maxPos, maxNeg } = useMemo(() => {
    let mp = 0, mn = 0
    for (const m of serie) {
      const p = partesDe(m)
      const pos = Object.values(p).filter(v => v > 0).reduce((a, v) => a + v, 0)
      const neg = Object.values(p).filter(v => v < 0).reduce((a, v) => a - v, 0)
      if (pos > mp) mp = pos
      if (neg > mn) mn = neg
    }
    return { maxPos: mp, maxNeg: mn }
  }, [serie])

  const rango = Math.max(1, maxPos + maxNeg)
  const px = (v: number) => Math.abs(v) / rango * ALTO
  const cero = maxPos / rango * ALTO   // distancia desde arriba hasta la línea de cero

  const nombreMes = (mes: string) => {
    const [a, m] = mes.split('-').map(Number)
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    return `${MESES[m - 1]} de ${a}`
  }

  const sinNada = serie.every(m => !m.conDatos)

  return (
    // `minmax(0, 1fr)` y no `1fr`: sin eso los hijos de una grilla no bajan de su ancho
    // mínimo de contenido, y una sola tarjeta ancha arrastra la página entera a lo ancho
    // en el teléfono. Mismo idioma que GananciasView.
    <div className="px-4 md:px-6 pt-4 pb-6" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>

      {/* Navegación: el mes a la izquierda, las vistas a la derecha. El tablero no usa
          el selector de período de las otras dos: una serie de trece "días" no dice nada. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href={`/dashboard/ganancias/tablero?mes=${mesAnterior}`} className="chip" aria-label="Mes anterior">‹</Link>
          <strong style={{ fontSize: 15 }}>{nombreMes(mesCursor)}</strong>
          {haySiguiente
            ? <Link href={`/dashboard/ganancias/tablero?mes=${mesSiguiente}`} className="chip" aria-label="Mes siguiente">›</Link>
            : <span className="chip" style={{ opacity: 0.4 }} aria-hidden="true">›</span>}
        </div>
        {nav}
      </div>

      {/* Resultado y comparaciones */}
      <div className="gn-res">
        <div className="card gn-card">
          <div className="gn-lbl">
            {sinNada ? 'Sin operaciones en los últimos trece meses' : `Resultado de ${nombreMes(mesCursor).toLowerCase()} · todas las monedas`}
          </div>
          <div className={`gn-num num ${(actual?.neto ?? 0) >= 0 ? 'pos' : 'neg'}`}>
            {ars(Math.round(actual?.neto ?? 0))}
          </div>
          <div className="gn-pie">
            {actual?.c.netoUsd != null
              ? <>{usd(Math.round(actual.c.netoUsd))} a la cotización del período</>
              : 'en pesos'}
            {/* Que el mes esté en curso cambia cómo se lee todo lo de al lado. */}
            {tramo && <> · <b>mes en curso, al día {tramo}</b></>}
          </div>
        </div>

        <TarjetaComparacion
          titulo={tramo ? 'vs. el mismo tramo del mes anterior' : 'vs. mes anterior'}
          variacion={cmp?.vsAnterior ?? null}
          base={cmp?.anterior?.neto ?? null}
          etiquetaBase={cmp?.anterior ? nombreMes(cmp.anterior.mes) : null}
          tramo={tramo}
        />
        <TarjetaComparacion
          titulo={tramo ? 'vs. el mismo tramo del año pasado' : 'vs. mismo mes del año pasado'}
          variacion={cmp?.vsAnioPasado ?? null}
          base={cmp?.anioPasado?.neto ?? null}
          etiquetaBase={cmp?.anioPasado ? nombreMes(cmp.anioPasado.mes) : null}
          tramo={tramo}
        />
      </div>

      {/* Evolución */}
      <div className="card" style={{ padding: '14px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 650 }}>Evolución del resultado</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Trece meses · {nombreMes(mesCursor).toLowerCase()} resaltado · millones de pesos
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {COMPONENTES.map(k => (
              <span key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-2)' }}>
                <i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: k.color, display: 'block' }} />
                {k.label}
              </span>
            ))}
            <button className={`chip ${tabla ? 'on' : ''}`} onClick={() => setTabla(v => !v)} aria-pressed={tabla}>
              Ver como tabla
            </button>
          </div>
        </div>

        {tabla ? (
          <Tabla serie={serie} />
        ) : (
          // El scroll va en el contenedor de AFUERA y el ancho mínimo adentro: con el
          // `overflow` sobre la fila misma, las trece columnas —que no bajan de 42px—
          // se salían igual y arrastraban la página entera a lo ancho en el teléfono.
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 620 }}>
            {/* Eje Y: solo los extremos y el cero. Más marcas serían ruido. */}
            <div className="num" style={{ width: 38, height: ALTO, position: 'relative', fontSize: 10, color: 'var(--muted)', flex: 'none' }}>
              <span style={{ position: 'absolute', right: 0, top: -5 }}>{mill(maxPos)}</span>
              <span style={{ position: 'absolute', right: 0, top: cero - 5 }}>0</span>
              {maxNeg > 0 && <span style={{ position: 'absolute', right: 0, bottom: -5 }}>−{mill(maxNeg)}</span>}
            </div>

            <div style={{ flex: '1 1 auto', position: 'relative', minWidth: 0 }}>
              {/* Grilla recesiva: 1px, sólida. La línea de cero un paso más marcada. */}
              <div aria-hidden="true" style={{ position: 'absolute', inset: `0 0 auto 0`, height: ALTO }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, borderTop: '1px solid var(--grid)' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, top: cero, borderTop: '1px solid var(--ink-2)', opacity: 0.45 }} />
                <div style={{ position: 'absolute', left: 0, right: 0, top: ALTO, borderTop: '1px solid var(--grid)' }} />
              </div>

              <div style={{ display: 'flex' }}>
                {serie.map((m, i) => {
                  const p = partesDe(m)
                  const positivos = COMPONENTES.filter(k => p[k.id] > 0)
                  const negativos = COMPONENTES.filter(k => p[k.id] < 0)
                  const esCursor = m.mes === mesCursor
                  return (
                    <div
                      key={m.mes}
                      onMouseEnter={e => {
                        const r = e.currentTarget.getBoundingClientRect()
                        setSobre({ i, x: r.left + r.width / 2, y: r.top })
                      }}
                      onMouseLeave={() => setSobre(s => (s?.i === i ? null : s))}
                      style={{
                        flex: '1 1 0', minWidth: 42, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', position: 'relative',
                        background: esCursor ? 'var(--hover, #f1f5f9)' : undefined,
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ width: 24, height: ALTO, position: 'relative' }}>
                        {/* Hacia arriba desde el cero */}
                        {positivos.map((k, j) => {
                          const alto = px(p[k.id])
                          const debajo = positivos.slice(j + 1).reduce((a, x) => a + px(p[x.id]), 0)
                          return (
                            <div key={k.id} aria-hidden="true" style={{
                              position: 'absolute', left: 0, right: 0,
                              bottom: ALTO - cero + debajo, height: Math.max(0, alto - 2),
                              background: k.color,
                              borderRadius: j === 0 ? '4px 4px 0 0' : 0,
                            }} />
                          )
                        })}
                        {/* Hacia abajo */}
                        {negativos.map((k, j) => {
                          const alto = px(p[k.id])
                          const arriba = negativos.slice(0, j).reduce((a, x) => a + px(p[x.id]), 0)
                          return (
                            <div key={k.id} aria-hidden="true" style={{
                              position: 'absolute', left: 0, right: 0,
                              top: cero + arriba + 2, height: Math.max(0, alto - 2),
                              background: k.color,
                              borderRadius: j === negativos.length - 1 ? '0 0 4px 4px' : 0,
                            }} />
                          )
                        })}
                        {/* El neto: lo que queda después de sumar y restar todo. */}
                        {m.conDatos && (
                          <div aria-hidden="true" style={{
                            position: 'absolute', left: -3, right: -3,
                            top: cero - (m.neto / rango * ALTO) - 1, height: 2,
                            background: 'var(--ink)', borderRadius: 1,
                          }} />
                        )}
                      </div>
                      <div style={{
                        fontSize: 10, marginTop: 7, color: esCursor ? 'var(--ink)' : 'var(--muted)',
                        fontWeight: esCursor ? 700 : 400, whiteSpace: 'nowrap',
                      }}>{m.etiqueta}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          </div>
        )}

        {sobre && <Tooltip m={serie[sobre.i]} x={sobre.x} y={sobre.y} />}

        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
          Los cuatro colores suman el resultado del mes: los gastos van hacia abajo porque
          restan. La <b style={{ color: 'var(--ink-2)' }}>raya negra</b> marca el neto, que
          es lo que queda.
        </div>
      </div>

      {/* Aporte por moneda del mes elegido */}
      {actual && actual.c.monedas.length > 0 && (
        <div className="card" style={{ padding: '14px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 650 }}>Cuánto aporta cada moneda</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {nombreMes(mesCursor)} · antes de gastos y transferencias
            </span>
          </div>
          <PorMoneda c={actual.c} />
        </div>
      )}
    </div>
  )
}

/**
 * Una comparación.
 *
 * Cuando el mes en curso no cerró, la base es el MISMO TRAMO del mes de referencia —los
 * primeros N días— y el rótulo lo dice. Comparar veinticuatro días contra un mes entero
 * da una caída enorme que no significa nada, y es la primera cosa que alguien mira.
 */
function TarjetaComparacion({ titulo, variacion, base, etiquetaBase, tramo }: {
  titulo: string; variacion: number | null; base: number | null; etiquetaBase: string | null
  tramo: number | null
}) {
  return (
    <div className="card gn-card">
      <div className="gn-lbl">{titulo}</div>
      {variacion === null ? (
        <>
          <div className="gn-num num" style={{ color: 'var(--muted)' }}>—</div>
          <div className="gn-pie">
            {base === null
              ? 'no hay datos de ese período para comparar'
              : 'el período de base no tuvo resultado positivo: la variación en porcentaje no diría nada'}
          </div>
        </>
      ) : (
        <>
          <div className={`gn-num num ${variacion >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 24 }}>
            {pct(variacion)}
          </div>
          <div className="gn-pie num">
            desde {ars(Math.round(base ?? 0))}
            {etiquetaBase && (
              <span style={{ textTransform: 'lowercase' }}>
                {' · '}{etiquetaBase}{tramo ? `, al día ${tramo}` : ''}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * El detalle del mes, al pasar por encima de su columna.
 *
 * `position: fixed` con las coordenadas de la columna: adentro del gráfico lo recortaría
 * el `overflow-x: auto`. Se mantiene a 190px del borde para no salirse en pantalla
 * angosta.
 */
function Tooltip({ m, x, y }: { m: MesSerie; x: number; y: number }) {
  const p = partesDe(m)
  const izq = typeof window !== 'undefined'
    ? Math.min(Math.max(x, 110), window.innerWidth - 110)
    : x
  return (
    <div role="tooltip" style={{
      position: 'fixed', left: izq, top: y - 8, transform: 'translate(-50%, -100%)',
      pointerEvents: 'none',
      zIndex: 50, background: 'var(--card)', border: '1px solid var(--ring)',
      borderRadius: 8, padding: '9px 11px', minWidth: 190, boxShadow: '0 6px 20px rgba(15,23,42,.13)',
      fontSize: 12, lineHeight: 1.5, whiteSpace: 'nowrap',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{m.etiqueta}</div>
      {!m.conDatos ? (
        <div style={{ color: 'var(--muted)' }}>Sin operaciones</div>
      ) : (
        <>
          {COMPONENTES.map(k => (
            <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)' }}>
                <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: k.color, display: 'block' }} />
                {k.label}
              </span>
              <span className="num">{ars(Math.round(p[k.id]))}</span>
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 14,
            borderTop: '1px solid var(--grid)', marginTop: 5, paddingTop: 5, fontWeight: 700,
          }}>
            <span>Neto</span>
            <span className={`num ${m.neto >= 0 ? 'pos' : 'neg'}`}>{ars(Math.round(m.neto))}</span>
          </div>
        </>
      )}
    </div>
  )
}

/** La vista de tabla: el respaldo que exige la advertencia de contraste de la paleta. */
function Tabla({ serie }: { serie: MesSerie[] }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table className="cc-tbl densa">
        <thead>
          <tr>
            <th>Mes</th>
            {COMPONENTES.map(k => <th key={k.id}>{k.label}</th>)}
            <th>Neto</th>
          </tr>
        </thead>
        <tbody>
          {serie.map(m => {
            const p = partesDe(m)
            return (
              <tr key={m.mes}>
                <td>{m.etiqueta}</td>
                {COMPONENTES.map(k => (
                  <td key={k.id} className="num">
                    {m.conDatos ? ars(Math.round(p[k.id])) : <span className="zero">—</span>}
                  </td>
                ))}
                <td className={`num ${m.neto >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                  {m.conDatos ? ars(Math.round(m.neto)) : <span className="zero">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const COLOR_MONEDA: Record<string, string> = {
  usd: '#16a34a', eur: '#7c3aed', brl: '#a16207',
  usdt: '#0891b2', gbp: '#be185d', chq: '#475569',
}

/**
 * UNA sola grilla para todas las filas, no una grilla por fila.
 *
 * Con una grilla por fila, las columnas `auto` se dimensionan con el contenido de ESA
 * fila: los importes quedaban casi alineados por casualidad, y el subtotal —que estaba
 * afuera, pegado al borde— no alineaba con ninguno. Acá las cuatro columnas son las
 * mismas para todas las filas y el subtotal cae justo debajo de los importes.
 *
 * La columna de la barra es `minmax(0, 1fr)`: es la que cede cuando la pantalla angosta.
 */
function PorMoneda({ c }: { c: MesSerie['c'] }) {
  const mayor = Math.max(1, ...c.monedas.map(m => Math.abs(m.aporta)))
  const total = c.monedas.reduce((a, m) => a + m.aporta, 0)
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr) auto auto',
        alignItems: 'center', columnGap: 12, rowGap: 0,
      }}>
        {c.monedas.map(m => (
          <Fragment key={m.par}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, padding: '7px 0' }}>
              <i aria-hidden="true" style={{
                width: 9, height: 9, borderRadius: '50%', flex: 'none',
                background: COLOR_MONEDA[m.par] ?? 'var(--ink-2)',
              }} />
              {m.nombre}
            </span>
            <span aria-hidden="true" style={{
              height: 20, borderRadius: '0 4px 4px 0',
              width: `${Math.max(1, Math.abs(m.aporta) / mayor * 100)}%`,
              background: COLOR_MONEDA[m.par] ?? 'var(--ink-2)',
              opacity: m.aporta >= 0 ? 1 : 0.35,
            }} />
            <span className="num" style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' }}>
              {ars(Math.round(m.aporta))}
            </span>
            <span className="num" style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', textAlign: 'right', minWidth: 46 }}>
              {total > 0 ? `${fmt1.format(m.aporta / total * 100)} %` : ''}
            </span>
          </Fragment>
        ))}

        {/* El subtotal, en las mismas columnas: el importe cae bajo los importes. */}
        <span style={{
          gridColumn: '1 / 3', fontSize: 12.5, color: 'var(--ink-2)',
          borderTop: '1px solid var(--grid)', paddingTop: 9, marginTop: 6,
        }}>
          Subtotal por cambio de monedas
        </span>
        <span className="num" style={{
          fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', textAlign: 'right',
          borderTop: '1px solid var(--grid)', paddingTop: 9, marginTop: 6,
        }}>
          {ars(Math.round(c.subtotalMonedas))}
        </span>
        <span style={{ borderTop: '1px solid var(--grid)', paddingTop: 9, marginTop: 6 }} />
      </div>

      {c.ttSinCotizacion.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
          Transferencias en {c.ttSinCotizacion.map(p => SIMBOLO[p]).join(', ')} sin cotización
          del período: no están sumadas.
        </div>
      )}
    </div>
  )
}
