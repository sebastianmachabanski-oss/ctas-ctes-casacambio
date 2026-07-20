'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { calcularMovimiento, validarOperacion, MONEDAS } from '@/lib/motor-calculo'
import { SIGNOS_OPERACION } from '@/lib/motor-calculo/signos'

type Movimiento = {
  id: string; tipo: string; fecha: string; cliente: string | null; operacion: string
  propio: string | null; externo: string | null; monto: number; cot: number | null
  costo_pct: number | null; debe: string | null; notas: string | null
}

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const SIMBOLOS: Record<string, string> = {
  'PESOS': '$', 'CHEQUES': 'CH$', 'DOLARES': 'U$S', 'EUROS': '€', 'REALES': 'R$', 'USDT': 'USDT',
  'BANCO': 'BCO', 'CC PESOS': 'CC $', 'CC DOLARES': 'CC U$S', 'CC EUROS': 'CC €', 'CC REALES': 'CC R$',
}

export default function FormEditarTransaccion({ movimiento }: { movimiento: Movimiento }) {
  const router = useRouter()
  const [f, setF] = useState({
    fecha: movimiento.fecha,
    cliente: movimiento.cliente ?? '',
    operacion: movimiento.operacion,
    propio: movimiento.propio ?? '',
    externo: movimiento.externo ?? '',
    monto: String(movimiento.monto),
    cot: movimiento.cot != null ? String(movimiento.cot) : '',
    costo_pct: movimiento.costo_pct != null ? String(movimiento.costo_pct) : '',
    debe: movimiento.debe ?? '',
    notas: movimiento.notas ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const set = (campo: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(prev => ({ ...prev, [campo]: e.target.value }))

  // Previsualización en vivo con el MISMO motor que usa el servidor (validado 100%
  // contra la planilla): el usuario ve el impacto en caja antes de guardar.
  const preview = useMemo(() => {
    const monto = Number(f.monto)
    if (!f.operacion || !f.propio || !f.monto || isNaN(monto)) return { tipo: 'vacio' as const }
    const errorNegocio = validarOperacion({ operacion: f.operacion, propio: f.propio })
    if (errorNegocio) return { tipo: 'error' as const, mensaje: errorNegocio }
    try {
      const r = calcularMovimiento({
        tipo: movimiento.tipo as 'CAJA' | 'CTA CTE',
        operacion: f.operacion, propio: f.propio, externo: f.externo,
        monto, cotizacion: f.cot ? Number(f.cot) : null,
        costoPorcentaje: f.costo_pct ? Number(f.costo_pct) : null,
      })
      const chips = Object.entries(r.valores).filter(([, v]) => v !== 0)
      return { tipo: 'ok' as const, cuenta: r.cuenta, chips }
    } catch (e: any) {
      return { tipo: 'error' as const, mensaje: e.message as string }
    }
  }, [f, movimiento.tipo])

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError('')
    const res = await fetch(`/api/movimientos-caja/${movimiento.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha: f.fecha, cliente: f.cliente, operacion: f.operacion, propio: f.propio,
        externo: f.externo, monto: Number(f.monto), cot: f.cot || null,
        costo_pct: f.costo_pct || null, debe: f.debe, notas: f.notas,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? `Error ${res.status}`)
      setGuardando(false)
      return
    }
    router.push('/dashboard/transacciones')
    router.refresh()
  }

  return (
    <form onSubmit={handleGuardar} className="card p-4 md:p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor="fecha">Fecha</label>
          <input id="fecha" type="date" className="input" value={f.fecha} onChange={set('fecha')} required />
        </div>
        <div>
          <label className="label" htmlFor="cliente">Cliente</label>
          <input id="cliente" type="text" className="input" value={f.cliente} onChange={set('cliente')}
            placeholder={movimiento.tipo === 'CTA CTE' ? 'Cuenta corriente' : 'Cliente eventual (texto libre)'} />
        </div>
        <div>
          <label className="label" htmlFor="operacion">Operación</label>
          <select id="operacion" className="input" value={f.operacion} onChange={set('operacion')} required>
            {!SIGNOS_OPERACION.some(s => s.operacion === f.operacion) && (
              <option value={f.operacion}>{f.operacion}</option>
            )}
            {SIGNOS_OPERACION.map(s => <option key={s.operacion} value={s.operacion}>{s.operacion}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="propio">Moneda propia</label>
          <select id="propio" className="input" value={f.propio} onChange={set('propio')} required>
            <option value="">Elegir…</option>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="externo">Moneda externa</label>
          <select id="externo" className="input" value={f.externo} onChange={set('externo')}>
            <option value="">— Sin moneda externa —</option>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="monto">Monto</label>
          <input id="monto" type="number" step="any" className="input" value={f.monto} onChange={set('monto')} required />
        </div>
        <div>
          <label className="label" htmlFor="cot">Cotización</label>
          <input id="cot" type="number" step="any" className="input" value={f.cot} onChange={set('cot')}
            placeholder="Solo si cambia de moneda" />
        </div>
        <div>
          <label className="label" htmlFor="costo">Costo %</label>
          <input id="costo" type="number" step="any" className="input" value={f.costo_pct} onChange={set('costo_pct')}
            placeholder="Opcional" />
        </div>
        <div>
          <label className="label" htmlFor="debe">Debe (repartidor)</label>
          <input id="debe" type="text" className="input" value={f.debe} onChange={set('debe')}
            placeholder="Vacío = el dinero está en caja" />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor="notas">Notas</label>
          <textarea id="notas" className="input" rows={2} value={f.notas} onChange={set('notas')} />
        </div>
      </div>

      {/* Previsualización del impacto (motor de cálculo) */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Impacto en caja (previsualización)</p>
        {preview.tipo === 'vacio' && <p className="text-sm text-gray-400">Completá operación, moneda y monto.</p>}
        {preview.tipo === 'error' && <p className="text-sm text-red-600">{preview.mensaje}</p>}
        {preview.tipo === 'ok' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {preview.chips.length === 0 && <span className="text-sm text-gray-400">Sin impacto</span>}
            {preview.chips.map(([col, v]) => (
              <span key={col}
                className={`inline-block text-xs font-medium tabular-nums px-1.5 py-0.5 rounded ${v > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {SIMBOLOS[col] ?? col} {v < 0 ? `(${nf.format(-v)})` : nf.format(v)}
              </span>
            ))}
            {preview.cuenta && (
              <span className="ml-2 text-xs text-gray-500">Cuenta: <b className="text-gray-700">{preview.cuenta}</b></span>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={guardando || preview.tipo !== 'ok'}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" className="btn-secondary" disabled={guardando}
          onClick={() => router.push('/dashboard/transacciones')}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
