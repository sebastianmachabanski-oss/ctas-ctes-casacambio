'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import SelectBuscable from '@/components/SelectBuscable'
import { useAvisoSinGuardar } from '@/lib/useAvisoSinGuardar'
import { validarTransferencia, gananciaDe, gananciaNegativa, type EntradaTransferencia } from '@/lib/transferencia'

/**
 * Alta de una transferencia con SUS DOS PATAS, en una sola operación.
 *
 * Pantalla propia y no un modo del alta común: una transferencia no es un movimiento con
 * un campo distinto, son dos movimientos que solo tienen sentido juntos. Mezclarla con el
 * formulario general obligaba a esconder la mitad de los campos y a dejar la puerta
 * abierta a cargar una sola pata, que es justamente lo que se quiere eliminar.
 *
 * Una sola moneda y siempre CAJA: así son las 1.761 transferencias del histórico.
 */

// Las monedas que se operan. USDT incluido: existe solo en la app pero se transfiere igual.
const MONEDAS = ['DOLARES', 'PESOS', 'EUROS', 'REALES', 'USDT']

const SIMBOLO: Record<string, string> = {
  DOLARES: 'US$', PESOS: '$', EUROS: '€', REALES: 'R$', USDT: 'USDT',
}

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

function hoy() {
  // La fecha LOCAL: toISOString() da UTC y de noche en Argentina adelanta un día.
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function vacio(): EntradaTransferencia {
  return {
    fecha: hoy(),
    referencia: '',
    moneda: 'DOLARES',
    entra: { participante: '', monto: 0 },
    sale: { participante: '', monto: 0 },
  }
}

/** Acepta "1.234,56" y "1234.56". Devuelve 0 si no hay nada usable. */
function aNumero(s: string): number {
  const limpio = s.replace(/\./g, '').replace(',', '.')
  const n = Number(limpio)
  return isFinite(n) ? n : 0
}

export default function NuevaTransferenciaForm({ clientes }: { clientes: string[] }) {
  const router = useRouter()
  const [form, setForm] = useState(vacio)
  // Los montos viven como TEXTO mientras se tipean: guardarlos como número obliga a
  // resolver qué es un campo a medio escribir y reformatea bajo el cursor.
  const [montoEntra, setMontoEntra] = useState('')
  const [montoSale, setMontoSale] = useState('')
  const [confirmoPerdida, setConfirmoPerdida] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const entrada: EntradaTransferencia = useMemo(() => ({
    ...form,
    entra: { ...form.entra, monto: aNumero(montoEntra) },
    sale: { ...form.sale, monto: aNumero(montoSale) },
  }), [form, montoEntra, montoSale])

  const tocado = !!(form.referencia || montoEntra || montoSale
    || form.entra.participante || form.sale.participante)
  useAvisoSinGuardar(tocado && !loading)

  const ganancia = gananciaDe(entrada)
  const negativa = gananciaNegativa(entrada)
  const sim = SIMBOLO[form.moneda] ?? form.moneda
  const hayMontos = aNumero(montoEntra) > 0 && aNumero(montoSale) > 0

  const set = (patch: Partial<EntradaTransferencia>) => setForm(f => ({ ...f, ...patch }))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setOk(null)

    const problema = validarTransferencia(entrada)
    if (problema) return setError(problema)
    if (negativa && !confirmoPerdida)
      return setError('Sale más de lo que entra. Revisá los importes; si es correcto, tildá la confirmación.')

    setLoading(true)
    try {
      const res = await fetch('/api/transferencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entrada, confirmo_perdida: confirmoPerdida }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'No se pudo guardar'); return }
      setOk(`Transferencia "${data.referencia}" cargada con sus dos patas. Ganancia: ${sim} ${fmt.format(data.ganancia)}.`)
      setForm(vacio()); setMontoEntra(''); setMontoSale(''); setConfirmoPerdida(false)
      router.refresh()
    } catch {
      setError('No se pudo conectar con el servidor. Probá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4" style={{ maxWidth: 880 }}>
      {error && <div className="banner-warn">⚠️ {error}</div>}
      {ok && <div className="banner banner-info">✅ {ok}</div>}

      {/* Datos compartidos por las dos patas. La referencia se escribe UNA vez: es lo que
          las vincula, y tipearla dos veces era la causa de que no se parearan. */}
      <div className="card p-4" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div>
          <label className="label">Fecha</label>
          <input type="date" className="input" value={form.fecha}
            onChange={e => set({ fecha: e.target.value })} required />
        </div>
        <div>
          <label className="label">Moneda</label>
          <SelectBuscable value={form.moneda} opciones={MONEDAS} onChange={v => set({ moneda: v })} />
        </div>
        <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <label className="label">Referencia</label>
          <input type="text" className="input" value={form.referencia}
            onChange={e => set({ referencia: e.target.value })}
            placeholder="Participantes, ej. BOH - GRA" required />
          <p className="text-xs text-gray-400 mt-1">
            Se guarda igual en las dos patas. Es lo que las mantiene unidas.
          </p>
        </div>
      </div>

      {/* Las dos patas, lado a lado. Se ven juntas a propósito: la operación es una sola. */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {([
          ['entra', 'Entra', 'Quién entrega la plata', montoEntra, setMontoEntra] as const,
          ['sale', 'Sale', 'Quién la recibe', montoSale, setMontoSale] as const,
        ]).map(([clave, titulo, ayuda, valor, setValor]) => (
          <div className="card p-4" key={clave}
            style={{ borderLeft: `3px solid ${clave === 'entra' ? 'var(--pos-ink)' : 'var(--neg-ink)'}` }}>
            <div className="sec-lbl" style={{ margin: '0 0 10px' }}>{titulo}</div>
            <label className="label">Participante</label>
            <input type="text" className="input" list="participantes"
              value={form[clave].participante}
              onChange={e => set({ [clave]: { ...form[clave], participante: e.target.value } } as any)}
              placeholder={ayuda} autoComplete="off" required />
            <label className="label" style={{ marginTop: 10 }}>Monto</label>
            <input type="text" inputMode="decimal" className="input num"
              value={valor} onChange={e => setValor(e.target.value)}
              placeholder="0,00" required />
          </div>
        ))}
      </div>
      {/* Sugerencias compartidas por las dos patas. Es una lista nativa: el campo sigue
          siendo libre, igual que el cliente de las operaciones de caja. */}
      <datalist id="participantes">
        {clientes.map(c => <option key={c} value={c} />)}
      </datalist>

      {/* La ganancia, ANTES de guardar. Hasta hoy recién se veía en Ganancias, días
          después, y para entonces el desvío ya se había "arreglado" con un ajuste de caja. */}
      {hayMontos && (
        <div className="card p-4" style={negativa ? { borderLeft: '3px solid var(--warn-ink)' } : undefined}>
          <div className="sec-lbl" style={{ margin: 0 }}>Ganancia de la transferencia</div>
          <div className={`num ${negativa ? 'neg' : 'pos'}`} style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
            {sim} {fmt.format(ganancia)}
          </div>
          {negativa && (
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
              <b>Sale más de lo que entra.</b> Por definición esto no debería pasar: si el egreso
              supera al ingreso, no hay negocio. Revisá los importes.
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmoPerdida}
                  onChange={e => setConfirmoPerdida(e.target.checked)} />
                Los importes son correctos: confirmo
              </label>
            </div>
          )}
        </div>
      )}

      <button type="submit" className="btn btn-primary"
        disabled={loading || (negativa && !confirmoPerdida)}>
        {loading ? 'Guardando…' : 'Guardar transferencia'}
      </button>
      <p className="text-xs text-gray-400">
        Las dos patas se guardan juntas: o entran las dos, o no entra ninguna.
      </p>
    </form>
  )
}
