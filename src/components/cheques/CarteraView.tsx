'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ESTADO_LABEL, puedeIr, textoVencimiento, vencidoSinDepositar,
  pesos, porcentaje, fechaCorta,
  type Cheque, type Concentracion, type Resumen,
} from '@/lib/cheques'
import { tasaTexto, type TasaCartera } from '@/lib/cheques-tasa'

// Cartera de cheques. El cálculo vive en `src/lib/cheques.ts` para poder validarlo sin
// navegador; acá solo se dibuja y se maneja la selección.

const SOLAPAS: [string, string][] = [
  ['cartera', 'En cartera'],
  ['depositados', 'Depositados'],
  ['rechazados', 'Rechazados'],
  ['todos', 'Todos'],
]

/** El color del estado nunca va solo: siempre con su etiqueta. */
function Estado({ c, hoy }: { c: Cheque; hoy: string }) {
  if (vencidoSinDepositar(c, hoy)) return <span className="tag tag-red">Vencido</span>
  if (c.estado === 'rechazado') return <span className="tag tag-red">Rechazado</span>
  if (c.estado === 'incobrable') return <span className="tag tag-red">Incobrable</span>
  if (c.estado === 'depositado') return <span className="tag tag-blue">Depositado</span>
  if (c.estado === 'acreditado') return <span className="tag tag-green">Acreditado</span>
  return <span className="tag tag-gray">{ESTADO_LABEL[c.estado]}</span>
}

function Tarjeta({ rotulo, importe, cuenta, alerta }: {
  rotulo: string; importe: number; cuenta: number; alerta?: boolean
}) {
  const color = alerta ? '#dc2626' : '#8a94a6'
  return (
    <div className="saldo-card" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="dot" style={{ background: color }} />
        <span className="cur">{rotulo}</span>
      </div>
      <div className="val num" style={alerta ? { color: '#b91c1c' } : undefined}>{pesos(importe)}</div>
      <div className="nota">{cuenta === 1 ? '1 cheque' : `${cuenta.toLocaleString('es-AR')} cheques`}</div>
    </div>
  )
}

/**
 * A qué tasa está colocada la cartera.
 *
 * Va aparte de las cinco tarjetas de importes porque no es un importe: es la respuesta a
 * la pregunta con la que una oficina que descuenta documentos decide todo el día. Las dos
 * tasas se muestran juntas —la directa es la que se habla con el cliente, la TNA la que se
 * compara contra otra colocación— y el cálculo está en `cheques-tasa.ts`.
 */
function BandaTasa({ t }: { t: TasaCartera }) {
  return (
    <div className="card" style={{ padding: '13px 16px', display: 'grid', gap: 12,
      gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', alignItems: 'end' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em',
          textTransform: 'uppercase', color: 'var(--muted)',
        }}>Colocada al</div>
        <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 1 }}>
          {tasaTexto(t.mensual)}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>mensual, sobre el nominal</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em',
          textTransform: 'uppercase', color: 'var(--muted)',
        }}>TNA</div>
        <div className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>
          {tasaTexto(t.tna)}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>sobre la plata puesta</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em',
          textTransform: 'uppercase', color: 'var(--muted)',
        }}>Plazo promedio</div>
        <div className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>
          {Math.round(t.dias).toLocaleString('es-AR')} días
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>ponderado por importe</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em',
          textTransform: 'uppercase', color: 'var(--muted)',
        }}>Se pagó</div>
        <div className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>
          {pesos(t.pagado)}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
          por {pesos(t.nominal)} de nominal
        </div>
      </div>
      {t.sinCosto > 0 && (
        <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--muted)' }}>
          {t.sinCosto === 1
            ? 'Un cheque quedó afuera del cálculo: no se encontró la operación que lo trajo.'
            : `${t.sinCosto.toLocaleString('es-AR')} cheques quedaron afuera del cálculo: no se encontró la operación que los trajo.`}
        </div>
      )}
    </div>
  )
}

export default function CarteraView({
  cheques, total, resumen, concentracion, tasa, hoy, filtro, sinTabla, error,
}: {
  cheques: Cheque[]
  total: number
  resumen: Resumen | null
  concentracion: Concentracion[]
  /** A qué tasa está colocada la cartera activa. `null` si no hay de dónde sacarla. */
  tasa: TasaCartera | null
  hoy: string
  filtro: string
  sinTabla?: boolean
  error?: string
}) {
  const router = useRouter()
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  // Depositable es lo que la MÁQUINA DE ESTADOS permite, no una lista aparte: si mañana
  // cambia la tabla de transiciones, las casillas cambian solas.
  // Se puede elegir lo que admita ALGUNA de las dos acciones de tanda. Antes solo las
  // depositables, y por eso un cheque ya depositado no se podía ni marcar: acreditar de a
  // uno desde la ficha era el único camino, con veinte cheques que el banco pagó el mismo
  // día. (27/11/2026)
  //
  // Los ya acreditados quedan afuera aunque la máquina los deje volver: eso es DESHACER
  // un cobro, no una acción de tanda, y se hace desde la ficha. Acá el botón diría
  // "Depositar" y estaría borrando plata.
  const depositables = useMemo(
    () => cheques.filter(c => c.estado !== 'acreditado'
      && (puedeIr(c.estado, 'depositado') || puedeIr(c.estado, 'acreditado'))),
    [cheques])

  const seleccionados = cheques.filter(c => elegidos.has(c.id))
  const sumaElegida = seleccionados.reduce((a, c) => a + c.importe, 0)
  const todosMarcados = depositables.length > 0 && depositables.every(c => elegidos.has(c.id))

  // Cada acción se ofrece solo si TODOS los elegidos la admiten. Con una selección mixta
  // —algunos en cartera y otros depositados— ninguna de las dos está bien para todos, y
  // aplicar media tanda es peor que no aplicar ninguna.
  const puedenDepositarse = seleccionados.length > 0
    && seleccionados.every(c => puedeIr(c.estado, 'depositado'))
  const puedenAcreditarse = seleccionados.length > 0
    && seleccionados.every(c => puedeIr(c.estado, 'acreditado'))

  /** Fecha en que el banco pagó. No es necesariamente hoy. */
  const [fechaMov, setFechaMov] = useState(hoy)
  /** La acreditación mueve plata, así que se confirma. */
  const [confirmando, setConfirmando] = useState(false)

  function alternar(id: string) {
    setElegidos(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }
  const marcarTodos = () =>
    setElegidos(todosMarcados ? new Set() : new Set(depositables.map(c => c.id)))

  async function mover(estado: 'depositado' | 'acreditado') {
    if (!seleccionados.length || enviando) return
    setEnviando(true); setAviso(null); setConfirmando(false)
    try {
      const r = await fetch('/api/cheques/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: seleccionados.map(c => c.id), estado, fecha: fechaMov }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setAviso(j.error || `No se pudo registrar ${estado === 'depositado' ? 'el depósito' : 'la acreditación'}`)
        return
      }
      if (Array.isArray(j.avisos) && j.avisos.length) setAviso(j.avisos.join(' '))
      setElegidos(new Set())
      router.refresh()
    } catch {
      setAviso('No se pudo conectar. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  if (sinTabla) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <div className="card p-8 text-center space-y-3">
          <p className="font-semibold text-gray-900">La cartera de cheques todavía no está instalada</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Falta correr <code>migrations/2026-11-22_cheques.sql</code> en esta base.
            Hasta entonces la pantalla no tiene de dónde leer.
          </p>
          {error && <p className="text-xs text-gray-400">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Solapas. Cambian el listado, nunca las cifras de arriba. */}
      <div className="card p-4 md:p-5" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SOLAPAS.map(([clave, rotulo]) => (
          <Link key={clave} href={`/dashboard/cheques?filtro=${clave}`}
            className="chip" aria-current={filtro === clave ? 'page' : undefined}
            style={filtro === clave
              ? { background: 'var(--ink-1, #0f172a)', color: '#fff', borderColor: 'transparent' }
              : undefined}>
            {rotulo}
          </Link>
        ))}
      </div>

      {/* Las cifras son SIEMPRE de la cartera entera: cambiar de solapa no puede cambiar
          cuánto hay en cartera. Por eso el total va acá arriba y no al pie de la tabla,
          donde se leía como el total de las filas visibles. */}
      {resumen && (
        // Son CINCO tarjetas y `.saldos` acomoda de a cuatro con su mínimo de 240px: la
        // quinta caía sola a un segundo renglón y quedaba huérfana. Con 190px entran las
        // cinco en pantalla ancha y siguen apilándose solas en el teléfono.
        <div className="saldos" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <Tarjeta rotulo="Total en cartera" importe={resumen.enCartera.importe} cuenta={resumen.enCartera.cheques} />
          <Tarjeta rotulo="Vencen hoy" importe={resumen.vencenHoy.importe} cuenta={resumen.vencenHoy.cheques} />
          <Tarjeta rotulo="Esta semana" importe={resumen.vencenSemana.importe} cuenta={resumen.vencenSemana.cheques} />
          <Tarjeta rotulo="Vencidos sin depositar" importe={resumen.vencidosSinDepositar.importe}
            cuenta={resumen.vencidosSinDepositar.cheques} alerta={resumen.vencidosSinDepositar.cheques > 0} />
          <Tarjeta rotulo="Rechazados" importe={resumen.rechazados.importe}
            cuenta={resumen.rechazados.cheques} alerta={resumen.rechazados.cheques > 0} />
        </div>
      )}

      {tasa && <BandaTasa t={tasa} />}

      <div className="card">
        <div className="card-h" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="card-t">Próximos vencimientos</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {total > cheques.length
                ? `Los ${cheques.length} más cercanos de ${total.toLocaleString('es-AR')} · ordenados por fecha de pago`
                : 'Ordenados por fecha de pago'}
            </div>
          </div>
          {/* ACREDITAR MUEVE PLATA, así que pide confirmación y fecha; depositar no, y
              por eso sigue siendo un solo clic. La confirmación dice el importe y a
              nombre de quién entra, que es lo que hay que leer antes de apretar. */}
          {confirmando ? (
            <div style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>
                Entran <b>{pesos(sumaElegida)}</b> a la caja, a nombre del banco de cada cheque.
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                Fecha
                <input type="date" className="input" style={{ width: 150 }}
                  max={hoy} value={fechaMov} onChange={e => setFechaMov(e.target.value)} />
              </label>
              <button className="btn-primary" disabled={enviando} onClick={() => mover('acreditado')}>
                {enviando ? 'Registrando…' : 'Confirmar'}
              </button>
              <button className="chip" disabled={enviando} onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {puedenAcreditarse && (
                <button className="chip" disabled={enviando} onClick={() => setConfirmando(true)}>
                  Acreditar {seleccionados.length} · {pesos(sumaElegida)}
                </button>
              )}
              {/* Selección mixta: ninguna de las dos acciones vale para todos. Se dice
                  por qué, en vez de dejar un botón apagado sin explicación. */}
              {seleccionados.length > 0 && !puedenDepositarse && !puedenAcreditarse && (
                <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
                  Hay cheques en cartera y depositados juntos: elegí de a un estado por vez.
                </span>
              )}
              <button className="btn-primary"
                disabled={!puedenDepositarse || enviando} onClick={() => mover('depositado')}>
                {enviando ? 'Registrando…'
                  : puedenDepositarse ? `Depositar ${seleccionados.length} seleccionados`
                  : 'Depositar seleccionados'}
              </button>
            </div>
          )}
        </div>

        {aviso && <div className="banner banner-warn" style={{ margin: '0 16px 12px' }}>{aviso}</div>}

        {cheques.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            No hay cheques en esta solapa
          </div>
        ) : (
          <div className="tbl-scroll">
            <table className="cc-tbl densa">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input type="checkbox" checked={todosMarcados} onChange={marcarTodos}
                      disabled={!depositables.length}
                      aria-label="Seleccionar todos los cheques que se pueden depositar" />
                  </th>
                  <th style={{ textAlign: 'left' }}>Vence</th>
                  <th style={{ textAlign: 'left' }}>Librador</th>
                  <th style={{ textAlign: 'left' }}>Banco</th>
                  <th style={{ textAlign: 'left' }}>Número</th>
                  <th>Importe</th>
                  <th style={{ textAlign: 'left' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cheques.map(c => {
                  // Seleccionable es lo que admite ALGUNA acción de tanda, no solo el
                  // depósito: un cheque ya depositado se puede acreditar, y antes no se
                  // podía ni marcar.
                  const puede = depositables.some(d => d.id === c.id)
                  const marcado = elegidos.has(c.id)
                  return (
                    <tr key={c.id} style={marcado ? { background: '#f1f6fd' } : undefined}>
                      <td>
                        <input type="checkbox" checked={marcado} disabled={!puede}
                          onChange={() => alternar(c.id)}
                          aria-label={puede
                            ? `Seleccionar cheque ${c.numero}`
                            : `El cheque ${c.numero} no admite acciones en tanda: está ${ESTADO_LABEL[c.estado].toLowerCase()}`} />
                      </td>
                      <td style={{ textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 400 }}>
                        <span className="num">{fechaCorta(c.fecha_pago)}</span>{' '}
                        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                          {textoVencimiento(c.fecha_pago, hoy)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <Link href={`/dashboard/cheques/${c.id}`}>{c.librador || '—'}</Link>
                      </td>
                      <td style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 400 }}>{c.banco || '—'}</td>
                      <td className="num" style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>
                        {c.numero}{' '}
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.tipo}</span>
                      </td>
                      <td className="num">{pesos(c.importe)}</td>
                      <td style={{ textAlign: 'left' }}><Estado c={c} hoy={hoy} /></td>
                    </tr>
                  )
                })}
              </tbody>
              {/* El pie suma LO SELECCIONADO: es el único total que tiene sentido al lado
                  de un botón que actúa sobre la selección. El de la cartera está arriba. */}
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'left', fontWeight: 700 }}>
                    {seleccionados.length
                      ? `${seleccionados.length} ${seleccionados.length === 1 ? 'cheque seleccionado' : 'cheques seleccionados'}`
                      : 'Ninguno seleccionado'}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>{seleccionados.length ? pesos(sumaElegida) : '—'}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Concentración: diez cheques del mismo librador son UN riesgo, no diez. */}
      {concentracion.length > 0 && (
        <div className="card">
          <div className="card-h">
            <div className="card-t">Concentración por librador</div>
          </div>
          <div style={{ padding: '4px 16px 16px' }}>
            {concentracion.slice(0, 6).map(g => (
              <div key={(g.cuit ?? g.librador)} style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 300px) 1fr',
                alignItems: 'center', columnGap: 12, padding: '5px 0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {g.librador}
                  </span>
                  {g.excede && <span className="tag tag-red" style={{ flex: 'none' }}>supera el 20 %</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{
                    height: 18, borderRadius: '0 4px 4px 0', background: '#2a78d6',
                    width: `${Math.max(2, g.parte * 100)}%`, maxWidth: 260, flex: 'none',
                  }} />
                  <span className="num" style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{pesos(g.importe)}</span>
                  <span className="num" style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {porcentaje(g.parte)} · {g.cheques} {g.cheques === 1 ? 'cheque' : 'cheques'}
                  </span>
                </div>
              </div>
            ))}
            {concentracion.length > 6 && (
              <div className="num" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                Los otros {concentracion.length - 6} libradores suman{' '}
                {pesos(concentracion.slice(6).reduce((a, g) => a + g.importe, 0))} en{' '}
                {concentracion.slice(6).reduce((a, g) => a + g.cheques, 0)} cheques.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
