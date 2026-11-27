'use client'
import { useState } from 'react'
import Link from 'next/link'
import SubirImagen from '@/components/cheques/SubirImagen'
import ResolverRechazo from '@/components/cheques/ResolverRechazo'
import { esPdf } from '@/lib/cheques-archivo'
import { useRouter } from 'next/navigation'
import {
  ESTADO_LABEL, TRANSICIONES, esTerminal, muevePlata, estadoAnterior,
  textoVencimiento, vencidoSinDepositar,
  pesos, pesosExacto, fechaLarga, CLIENTE_SIN_BANCO, CONCEPTO_INCOBRABLE,
  type Cheque, type Estado, type Evento,
} from '@/lib/cheques'
import { costoDeCheque, tasaTexto, plazoTexto } from '@/lib/cheques-tasa'

type Origen = {
  id: string; fecha: string; cliente: string | null
  operacion: string; cheques: number | null; pesos: number | null
} | null

/** Qué se le dice al operador que va a pasar, en su idioma y no en el de la base. */
const ACCION: Record<Estado, string> = {
  depositado: 'Depositar',
  acreditado: 'Marcar acreditado',
  rechazado: 'Registrar rechazo',
  endosado: 'Endosar a un tercero',
  devuelto: 'Devolver al cliente',
  en_cartera: 'Volver a cartera',
  incobrable: 'Darlo por incobrable',
}

const COLOR_EVENTO: Record<Estado, string> = {
  en_cartera: '#94a3b8',
  depositado: '#2a78d6',
  acreditado: '#15803d',
  rechazado: '#d03b3b',
  endosado: '#7c3aed',
  devuelto: '#8a94a6',
  incobrable: '#7f1d1d',
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '7px 0' }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em',
        textTransform: 'uppercase', color: 'var(--muted)',
      }}>{rotulo}</div>
      <div style={{ fontSize: 13, marginTop: 3 }}>{children}</div>
    </div>
  )
}

/** Una cifra del bloque de descuento: rótulo arriba, número grande, y por qué es ese. */
function Dato({ rotulo, valor, ayuda, destacado }: {
  rotulo: string; valor: string; ayuda?: string; destacado?: boolean
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em',
        textTransform: 'uppercase', color: 'var(--muted)',
      }}>{rotulo}</div>
      <div className="num" style={{
        fontSize: destacado ? 18 : 15,
        fontWeight: destacado ? 700 : 600,
        marginTop: 2,
        color: destacado ? 'var(--ink)' : undefined,
      }}>{valor}</div>
      {ayuda && (
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>{ayuda}</div>
      )}
    </div>
  )
}

export default function FichaView({ cheque, eventos, origen, cuentas, hoy, imagen }: {
  cheque: Cheque; eventos: Evento[]; origen: Origen; hoy: string
  /** Cuentas corrientes activas, para la salida "se lo debito al cliente". */
  cuentas: string[]
  /** Enlace FIRMADO y de vida corta. El bucket es privado: no hay URL fija. */
  imagen: string | null
}) {
  const router = useRouter()
  const [enviando, setEnviando] = useState<Estado | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /** El destino que está esperando confirmación: estado final, o que mueve plata. */
  const [confirmando, setConfirmando] = useState<Estado | null>(null)
  /** Fecha del hecho para las transiciones que generan un movimiento. */
  const [fechaMov, setFechaMov] = useState(hoy)
  /** El panel de resolución del rechazo, que no es una transición más. */
  const [resolviendo, setResolviendo] = useState(false)
  /** Qué pasó en el último cambio, para que la pantalla no quede muda. */
  const [hecho, setHecho] = useState<string | null>(null)

  // Los botones SON la máquina de estados: no hay una lista de acciones escrita aparte
  // que pueda quedar desincronizada y ofrecer algo imposible.
  //
  // Única excepción: desde `acreditado` la máquina admite dos destinos —`depositado` y
  // `en_cartera`— pero no son una elección. Son el mismo deshacer, y cuál corresponde lo
  // dice el historial: se vuelve de donde se vino. Ofrecer los dos haría que el operador
  // tuviera que recordar si ese cheque se depositó o se cobró por ventanilla.
  const deshacerCobro = cheque.estado === 'acreditado'
    ? (estadoAnterior(eventos, 'acreditado') ?? 'depositado')
    : null
  const deshacerBaja = cheque.estado === 'incobrable'
  const posibles = deshacerCobro ? [deshacerCobro] : TRANSICIONES[cheque.estado]

  // A qué tasa se tomó este documento. Sale de la operación que lo trajo; devuelve null
  // si esa operación no está o no tiene de dónde sacar el costo, y entonces el bloque no
  // se dibuja en vez de mostrar ceros.
  const costo = costoDeCheque(cheque, origen)

  async function mover(destino: Estado) {
    if (enviando) return
    setEnviando(destino); setAviso(null); setHecho(null)
    try {
      const r = await fetch('/api/cheques/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [cheque.id], estado: destino, fecha: fechaMov }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso(j.error || 'No se pudo registrar el cambio'); return }
      if (Array.isArray(j.avisos) && j.avisos.length) setAviso(j.avisos.join(' '))
      setHecho(
        `Ahora está ${ESTADO_LABEL[destino].toLowerCase()}. `
        + (j.movimientos
          ? 'El cobro quedó registrado en la caja.'
          : 'Quedó anotado en el curso del cheque.'))
      router.refresh()
    } catch {
      setAviso('No se pudo conectar. Probá de nuevo.')
    } finally {
      setEnviando(null)
    }
  }

  /** Guarda la RUTA que devolvió la subida. El archivo ya está en el bucket. */
  async function guardarImagen(ruta: string | null) {
    setAviso(null)
    try {
      const r = await fetch(`/api/cheques/${cheque.id}/imagen`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivo_url: ruta }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso(j.error || 'No se pudo guardar la imagen'); return }
      router.refresh()
    } catch {
      setAviso('No se pudo conectar. Probá de nuevo.')
    }
  }

  const vencido = vencidoSinDepositar(cheque, hoy)

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          {/* Volver, como botón y no como miga de pan: la miga se lee como un rótulo
              y no se reconoce como la salida de la pantalla. */}
          <Link href="/dashboard/cheques" className="chip"
            style={{ display: 'inline-block', textDecoration: 'none', marginBottom: 6 }}>
            ← Volver a la cartera
          </Link>
          <h1 className="num" style={{ fontSize: 22, fontWeight: 700, margin: '2px 0 0' }}>
            Cheque {cheque.numero}
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={
            vencido || cheque.estado === 'rechazado' ? 'tag tag-red'
              : cheque.estado === 'depositado' ? 'tag tag-blue'
              : cheque.estado === 'acreditado' ? 'tag tag-green' : 'tag tag-gray'
          }>
            {vencido ? 'Vencido' : ESTADO_LABEL[cheque.estado]}
          </span>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Vence el {fechaLarga(cheque.fecha_pago)} · {textoVencimiento(cheque.fecha_pago, hoy)}
          </div>
        </div>
      </div>

      {aviso && <div className="banner banner-warn">{aviso}</div>}
      {hecho && <div className="banner banner-info">{hecho}</div>}

      {/* Datos del instrumento, con la imagen al lado */}
      <div className="card" style={{ padding: 16, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 300, flex: '1 1 260px', maxWidth: 300, display: 'grid', gap: 8, alignContent: 'start' }}>
          {imagen && esPdf(cheque.archivo_url) ? (
            // Un echeq llega como archivo, no como foto. Mostrarlo embebido no aporta:
            // se abre en una pestaña, que es donde el lector de PDF del navegador sirve.
            <a href={imagen} target="_blank" rel="noopener noreferrer" style={{
              height: 180, border: '1px solid var(--ring)', borderRadius: 10,
              background: 'var(--bg-2, #f8fafc)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Abrir el archivo</span>
            </a>
          ) : imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagen} alt={`Imagen del cheque ${cheque.numero}`}
              style={{ width: '100%', borderRadius: 10, border: '1px solid var(--ring)' }} />
          ) : (
            <div style={{
              height: 180, border: '1px dashed var(--ring)', borderRadius: 10,
              background: 'var(--bg-2, #f8fafc)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <circle cx="8" cy="12" r="2.5" />
                <path d="M14 10h5M14 14h3" />
              </svg>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>Sin imagen</div>
            </div>
          )}

          <SubirImagen valor={cheque.archivo_url} onChange={guardarImagen} />
        </div>

        <div style={{ flex: '2 1 340px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div className="num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em' }}>
              {pesosExacto(cheque.importe)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>valor nominal</div>
          </div>

          <div className="form-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            columnGap: 20, marginTop: 8,
          }}>
            <Campo rotulo="Librador">{cheque.librador || '—'}</Campo>
            <Campo rotulo="CUIT del librador"><span className="num">{cheque.cuit_librador || '—'}</span></Campo>
            <Campo rotulo="Banco">
              {cheque.banco || '—'}{cheque.sucursal ? ` · sucursal ${cheque.sucursal}` : ''}
            </Campo>
            <Campo rotulo="Cuenta"><span className="num">{cheque.cuenta || '—'}</span></Campo>
            <Campo rotulo="Emisión">
              <span className="num">{cheque.fecha_emision ? fechaLarga(cheque.fecha_emision) : '—'}</span>
            </Campo>
            <Campo rotulo="Fecha de pago"><span className="num">{fechaLarga(cheque.fecha_pago)}</span></Campo>
            <Campo rotulo="Tipo">{cheque.tipo === 'echeq' ? 'Echeq' : 'Papel'}</Campo>
            <Campo rotulo={cheque.tipo === 'echeq' ? 'Identificador' : 'Banda CMC7'}>
              <span className="num" style={{ fontSize: 12 }}>
                {(cheque.tipo === 'echeq' ? cheque.id_echeq : cheque.cmc7) || '—'}
              </span>
            </Campo>
            {origen && <Campo rotulo="Lo trajo">{origen.cliente || '—'}</Campo>}
            {origen && (
              <Campo rotulo="Entró con la operación">
                <Link href={`/dashboard/transacciones/${origen.id}/editar`}>
                  {origen.operacion} del {fechaLarga(origen.fecha)}
                </Link>
              </Campo>
            )}
          </div>

          {cheque.notas && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 8 }}>{cheque.notas}</div>
          )}
        </div>
      </div>

      {/* EL DESCUENTO. Es el número por el que se decide la operación, así que va arriba
          del curso del cheque y no en una nota al pie. Las dos tasas se muestran juntas a
          propósito: la directa es la que se habla con el cliente y la efectiva la que se
          compara contra otra colocación. El detalle del cálculo, en `cheques-tasa.ts`. */}
      {costo && (
        <div className="card">
          <div className="card-h">
            <div className="card-t">El descuento</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{plazoTexto(costo.tasa.dias)}</div>
          </div>
          <div style={{
            padding: '2px 14px 14px',
            display: 'grid', gap: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))',
          }}>
            <Dato rotulo="Nominal" valor={pesos(cheque.importe)} />
            <Dato rotulo="Se pagó" valor={pesos(costo.tasa.pagado)} />
            <Dato rotulo="Descuento" valor={pesos(costo.tasa.descuento)} />
            <Dato rotulo="Tasa directa" valor={tasaTexto(costo.tasa.directa)}
              ayuda="sobre el nominal" destacado />
            <Dato rotulo="Mensual" valor={tasaTexto(costo.tasa.mensual)}
              ayuda="directa a 30 días" destacado />
            <Dato rotulo="TNA" valor={tasaTexto(costo.tasa.tna)} ayuda="efectiva a 365 días" />
          </div>
          {costo.prorrateado && (
            <div style={{
              padding: '0 14px 13px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
            }}>
              La operación trajo varios cheques y una sola cifra de lo pagado, así que el
              costo de este se prorratea por importe. La tasa de la operación entera es
              exacta; la de este cheque, aproximada.
            </div>
          )}
        </div>
      )}

      {/* RESOLVER EL RECHAZO. No es una transición más: cuánto se recupera y de dónde
          viene son decisiones del momento, y un botón no las puede preguntar. */}
      {resolviendo && (
        <ResolverRechazo cheque={cheque} cuentas={cuentas} hoy={hoy}
          onCancelar={() => setResolviendo(false)} />
      )}

      {/* El curso del cheque */}
      <div className="card">
        <div className="card-h">
          <div className="card-t">Curso del cheque</div>
        </div>

        <div style={{ padding: '12px 16px 4px' }}>
          {eventos.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', paddingBottom: 12 }}>
              Este cheque no tiene eventos registrados.
            </div>
          ) : eventos.map((e, i) => (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', columnGap: 12 }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: 11, height: 11, borderRadius: '50%', margin: '4px auto 0',
                  background: COLOR_EVENTO[e.estado], border: '2px solid #fff',
                  boxSizing: 'content-box',
                }} />
                {i < eventos.length - 1 && (
                  <div style={{
                    position: 'absolute', left: '50%', top: 21, bottom: -6, width: 2,
                    marginLeft: -1, background: 'var(--ring)',
                  }} />
                )}
              </div>
              <div style={{ paddingBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: e.estado === 'rechazado' ? '#b91c1c' : 'var(--ink-1)',
                  }}>{ESTADO_LABEL[e.estado]}</span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>{fechaLarga(e.fecha)}</span>
                </div>
                {(e.notas || e.movimiento_id) && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
                    {e.notas}
                    {e.movimiento_id && (
                      <>
                        {e.notas ? ' · ' : ''}
                        <Link href={`/dashboard/transacciones/${e.movimiento_id}/editar`}>Ver el movimiento</Link>
                        {' '}— este evento movió plata.
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Las acciones son EXACTAMENTE las transiciones que la máquina permite desde el
            estado actual. Un estado terminal no ofrece ninguna.

            SE CONFIRMA LO QUE NO SE PUEDE DESHACER, y solo eso. Acreditado, endosado y
            devuelto son estados finales: desde ahí la pantalla no ofrece salida, así que
            un clic de más deja el cheque fuera de la cartera sin vuelta atrás. Depositar
            o registrar un rechazo sí se corrigen siguiendo la máquina, y pedir
            confirmación en cada paso convierte el aviso en algo que se tilda sin leer. */}
        <div style={{
          borderTop: '1px solid var(--ring)', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          {esTerminal(cheque.estado) ? (
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {ESTADO_LABEL[cheque.estado]}: sin acciones disponibles.
            </span>
          ) : confirmando ? (
            <>
              <span style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>
                <b>{ACCION[confirmando]}.</b>{' '}
                {confirmando === 'acreditado'
                  ? `Entran ${pesos(cheque.importe)} a la caja, a nombre de `
                    + `${cheque.banco?.trim() || CLIENTE_SIN_BANCO}.`
                  : confirmando === 'incobrable'
                    ? `El cheque se da de baja y la pérdida va a Gastos como `
                      + `"${CONCEPTO_INCOBRABLE}". Se puede deshacer.`
                    : 'Sale de la cartera y no se puede deshacer desde la pantalla.'}
              </span>
              {/* LA FECHA DEL HECHO. Un cobro marcado tres días tarde tiene que entrar a
                  la caja con la fecha en que el banco pagó, o el arqueo de ese día no
                  cierra. Solo aparece donde hay plata: en las demás no cambia nada. */}
              {muevePlata(confirmando) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  Fecha
                  <input type="date" className="input" style={{ width: 150 }}
                    max={hoy} value={fechaMov} onChange={e => setFechaMov(e.target.value)} />
                </label>
              )}
              <button className="btn-primary" disabled={!!enviando}
                onClick={() => { const d = confirmando; setConfirmando(null); mover(d) }}>
                {enviando ? 'Registrando…' : 'Confirmar'}
              </button>
              <button className="chip" disabled={!!enviando} onClick={() => setConfirmando(null)}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Desde {ESTADO_LABEL[cheque.estado].toLowerCase()}:
              </span>
              {/* Va primero porque es lo que se hace en la mayoría de los rechazos: el
                  reintento y la baja son los casos de borde. */}
              {cheque.estado === 'rechazado' && !resolviendo && (
                <button className="btn-primary" disabled={!!enviando}
                  onClick={() => setResolviendo(true)}>
                  Resolver el rechazo
                </button>
              )}
              {posibles.map(destino => (
                <button key={destino} className="chip" disabled={!!enviando}
                  onClick={() => (esTerminal(destino) || muevePlata(destino)
                    ? setConfirmando(destino)
                    : mover(destino))}>
                  {enviando === destino ? 'Registrando…'
                    : deshacerCobro
                      ? `Deshacer el cobro (vuelve a ${ESTADO_LABEL[destino].toLowerCase()})`
                      : deshacerBaja
                        ? 'Deshacer la baja (vuelve a rechazado)'
                        : ACCION[destino]}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Solo cuando NO se pudo calcular el descuento: si se pudo, el bloque de arriba ya
          lo dice mejor y repetirlo acá sería ruido. */}
      {origen && !costo && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          La operación que lo trajo movió {pesos(Math.abs(Number(origen.cheques) || 0))} en cheques
          contra {pesos(Math.abs(Number(origen.pesos) || 0))} en pesos. No alcanza para
          calcular la tasa.
        </div>
      )}
    </div>
  )
}
