'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AltaCheques from '@/components/cheques/AltaCheques'
import SelectBuscable from '@/components/SelectBuscable'
import { pesos, pesosExacto, sumaDeCheques, type Cheque, type ChequeNuevo } from '@/lib/cheques'

// Resolver un cheque rechazado (27/11/2026).
//
// POR QUÉ ES UNA PANTALLA Y NO UN BOTÓN MÁS
// Marcar `rechazado` no mueve plata: el cheque todavía puede reintentarse. Resolverlo SÍ,
// y cuánto se recupera y de dónde viene son decisiones que se toman en el momento, no
// están en ningún dato previo. Un botón no puede preguntarlas.
//
// EL IMPORTE ARRANCA EN EL NOMINAL
// El cliente endosó un documento de 100.000 y garantizó que se pagaba: debe 100.000, no
// lo que se le adelantó. Devolver solo lo adelantado dejaría a la casa trabajando gratis,
// habiendo puesto la plata y corrido el riesgo. Queda editable para negociar.

type Salida = 'efectivo' | 'cuenta' | 'canje'

const OPCIONES: { clave: Salida; titulo: string; detalle: string }[] = [
  { clave: 'efectivo', titulo: 'Repone en efectivo', detalle: 'El cliente paga y entra a la caja' },
  { clave: 'cuenta', titulo: 'Debitar en cuenta', detalle: 'Queda debiendo en su cuenta corriente' },
  { clave: 'canje', titulo: 'Canje por otro cheque', detalle: 'Entrega otro documento en reemplazo' },
]

export default function ResolverRechazo({ cheque, cuentas, hoy, onCancelar }: {
  cheque: Cheque
  cuentas: string[]
  hoy: string
  onCancelar: () => void
}) {
  const router = useRouter()
  const [salida, setSalida] = useState<Salida>('efectivo')
  const [fecha, setFecha] = useState(hoy)
  const [importe, setImporte] = useState(String(cheque.importe))
  const [cuenta, setCuenta] = useState('')
  const [nuevos, setNuevos] = useState<ChequeNuevo[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monto = Number(importe.replace(',', '.'))
  const valido = monto > 0 && monto <= cheque.importe
  const nominalNuevo = sumaDeCheques(nuevos)

  // Lo que el canje deja de ganancia: el cheque nuevo vale más que lo que se recupera del
  // viejo. Se muestra mientras se carga para que no haya que calcularlo de cabeza.
  const gananciaCanje = salida === 'canje' && nominalNuevo > 0 ? nominalNuevo - monto : null

  async function enviar() {
    if (enviando) return
    setEnviando(true); setError(null)
    try {
      const r = await fetch('/api/cheques/resolver-rechazo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cheque.id, salida, fecha, importe: monto,
          cuenta: salida === 'cuenta' ? cuenta : undefined,
          cheques: salida === 'canje' ? nuevos : undefined,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'No se pudo resolver el rechazo'); return }
      router.refresh()
      onCancelar()
    } catch {
      setError('No se pudo conectar. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="card" style={{ borderColor: '#d03b3b' }}>
      <div className="card-h">
        <div className="card-t">Resolver el rechazo</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Nominal {pesos(cheque.importe)}
        </div>
      </div>

      <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {OPCIONES.map(o => (
            <button key={o.clave} type="button"
              onClick={() => setSalida(o.clave)}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                border: `1.5px solid ${salida === o.clave ? '#d03b3b' : 'var(--ring)'}`,
                background: salida === o.clave ? '#fdf2f2' : 'var(--card)',
                fontFamily: 'inherit',
              }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{o.titulo}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{o.detalle}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div>
            <label className="label" htmlFor="rr-fecha">Fecha</label>
            <input id="rr-fecha" type="date" className="input" max={hoy}
              value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="rr-importe">
              {salida === 'canje' ? 'Valor que se le reconoce' : 'Importe recuperado'}
            </label>
            <input id="rr-importe" type="number" step="0.01" min="0" max={cheque.importe}
              className="input" value={importe} onChange={e => setImporte(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              {monto > cheque.importe
                ? 'No puede superar el nominal'
                : monto > 0 && monto < cheque.importe
                  ? `Se resigna ${pesosExacto(cheque.importe - monto)}`
                  : 'Arranca en el nominal del cheque'}
            </div>
          </div>
          {salida === 'cuenta' && (
            <div>
              <label className="label">Cuenta a debitar</label>
              <SelectBuscable opciones={cuentas} value={cuenta} onChange={setCuenta} />
            </div>
          )}
        </div>

        {salida === 'canje' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <AltaCheques cheques={nuevos} onChange={setNuevos} fechaOperacion={fecha} />
            {gananciaCanje !== null && (
              <div style={{ fontSize: 12.5, color: gananciaCanje >= 0 ? '#15803d' : '#b91c1c' }}>
                {gananciaCanje > 0
                  ? `El cheque nuevo vale ${pesosExacto(gananciaCanje)} más: esa diferencia es ganancia.`
                  : gananciaCanje === 0
                    ? 'El cheque nuevo vale lo mismo: el canje no deja ganancia.'
                    : `El cheque nuevo vale ${pesosExacto(-gananciaCanje)} menos de lo que se le reconoce.`}
              </div>
            )}
          </div>
        )}

        {error && <div className="banner banner-warn">{error}</div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" disabled={!valido || enviando} onClick={enviar}>
            {enviando ? 'Registrando…' : 'Registrar'}
          </button>
          <button className="chip" disabled={enviando} onClick={onCancelar}>Cancelar</button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            El cheque pasa a devuelto y sale de la cartera.
          </span>
        </div>
      </div>
    </div>
  )
}
