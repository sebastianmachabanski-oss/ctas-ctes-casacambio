'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MONEDAS = ['PESOS', 'DOLARES', 'EUROS', 'REALES']
const TIPOS = ['CTA CTE', 'CAJA']
const OPERACIONES = ['INGRESAN', 'EGRESAN']

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function NuevaTransaccionForm({ cuentas }: { cuentas: string[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    fecha: today(),
    tipo: 'CTA CTE',
    col_f: 'C',
    cuenta_cte: cuentas[0] ?? '',
    operacion: 'INGRESAN',
    propio: 'DOLARES',
    externo: 'PESOS',
    monto: '',
    cotizacion: '',
    notas: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setWarning(null)

    if (!form.cuenta_cte) return setError('Seleccioná una cuenta corriente')
    if (!form.monto || isNaN(Number(form.monto))) return setError('El monto debe ser un número válido')

    setLoading(true)
    try {
      const res = await fetch('/api/transacciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          monto: Number(form.monto),
          cotizacion: form.cotizacion ? Number(form.cotizacion) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al guardar')
      } else {
        if (data.warning) setWarning(data.warning)
        setSuccess(true)
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="card p-6 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <p className="text-gray-800 font-semibold">Transacción guardada</p>
        {warning && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm text-left">
            ⚠️ {warning}
          </div>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <button className="btn-secondary" onClick={() => {
            setSuccess(false)
            setWarning(null)
            setForm(f => ({ ...f, monto: '', cotizacion: '', notas: '' }))
          }}>
            Nueva transacción
          </button>
          <button className="btn-primary" onClick={() => router.push('/dashboard/cuenta-corriente')}>
            Ver movimientos
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 md:p-6 space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Fila 1: Tipo + Fecha + Op */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="col-span-2 md:col-span-1">
          <label className="label">Tipo de transacción</label>
          <select className="input" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fecha</label>
          <input
            type="date"
            className="input"
            value={form.fecha}
            onChange={e => set('fecha', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Op</label>
          <select className="input" value={form.col_f} onChange={e => set('col_f', e.target.value)}>
            <option value="C">C</option>
            <option value="T">T</option>
          </select>
        </div>
      </div>

      {/* Fila 2: Cuenta + Operación */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Cuenta corriente</label>
          <select
            className="input"
            value={form.cuenta_cte}
            onChange={e => set('cuenta_cte', e.target.value)}
            required
          >
            <option value="">— Seleccioná —</option>
            {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Operación</label>
          <select className="input" value={form.operacion} onChange={e => set('operacion', e.target.value)}>
            {OPERACIONES.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        </div>
      </div>

      {/* Fila 3: Propio + Externo + Monto + Cotización */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="label">Propio</label>
          <select className="input" value={form.propio} onChange={e => set('propio', e.target.value)}>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Externo</label>
          <select className="input" value={form.externo} onChange={e => set('externo', e.target.value)}>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Monto</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={form.monto}
            onChange={e => set('monto', e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="label">Cotización</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            className="input"
            value={form.cotizacion}
            onChange={e => set('cotizacion', e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Fila 4: Notas */}
      <div>
        <label className="label">Notas</label>
        <input
          type="text"
          className="input"
          value={form.notas}
          onChange={e => set('notas', e.target.value)}
          placeholder="Referencia, observaciones…"
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? 'Guardando…' : 'Guardar transacción'}
      </button>
    </form>
  )
}
