'use client'
import { useState } from 'react'
import Link from 'next/link'
import SubirImagen from '@/components/cheques/SubirImagen'
import { esPdf } from '@/lib/cheques-archivo'
import { useRouter } from 'next/navigation'
import {
  ESTADO_LABEL, TRANSICIONES, esTerminal, textoVencimiento, vencidoSinDepositar,
  pesos, pesosExacto, fechaLarga,
  type Cheque, type Estado, type Evento,
} from '@/lib/cheques'

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
}

const COLOR_EVENTO: Record<Estado, string> = {
  en_cartera: '#94a3b8',
  depositado: '#2a78d6',
  acreditado: '#15803d',
  rechazado: '#d03b3b',
  endosado: '#7c3aed',
  devuelto: '#8a94a6',
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

export default function FichaView({ cheque, eventos, origen, hoy, imagen }: {
  cheque: Cheque; eventos: Evento[]; origen: Origen; hoy: string
  /** Enlace FIRMADO y de vida corta. El bucket es privado: no hay URL fija. */
  imagen: string | null
}) {
  const router = useRouter()
  const [enviando, setEnviando] = useState<Estado | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /** El destino que está esperando confirmación, cuando es un estado final. */
  const [confirmando, setConfirmando] = useState<Estado | null>(null)
  /** Qué pasó en el último cambio, para que la pantalla no quede muda. */
  const [hecho, setHecho] = useState<string | null>(null)

  // Los botones SON la máquina de estados: no hay una lista de acciones escrita aparte
  // que pueda quedar desincronizada y ofrecer algo imposible.
  const posibles = TRANSICIONES[cheque.estado]

  async function mover(destino: Estado) {
    if (enviando) return
    setEnviando(destino); setAviso(null); setHecho(null)
    try {
      const r = await fetch('/api/cheques/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [cheque.id], estado: destino }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso(j.error || 'No se pudo registrar el cambio'); return }
      setHecho(`Ahora está ${ESTADO_LABEL[destino].toLowerCase()}. Quedó anotado en el curso del cheque.`)
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
                <b>{ACCION[confirmando]}.</b> Sale de la cartera y no se puede deshacer
                desde la pantalla.
              </span>
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
              {posibles.map(destino => (
                <button key={destino} className="chip" disabled={!!enviando}
                  onClick={() => (esTerminal(destino) ? setConfirmando(destino) : mover(destino))}>
                  {enviando === destino ? 'Registrando…' : ACCION[destino]}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {origen && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          La operación que lo trajo movió {pesos(Math.abs(Number(origen.cheques) || 0))} en cheques
          contra {pesos(Math.abs(Number(origen.pesos) || 0))} en pesos.
        </div>
      )}
    </div>
  )
}
