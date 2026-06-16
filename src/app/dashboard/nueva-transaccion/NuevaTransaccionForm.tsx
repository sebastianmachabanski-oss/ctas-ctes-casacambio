'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MONEDAS = ['PESOS', 'DOLARES', 'EUROS', 'REALES']
const TIPOS = ['CTA CTE', 'CAJA']
const OPERACIONES = ['INGRESAN', 'EGRESAN']

function today() {
  return new Date().toISOString().slice(0, 10)
}

function Required() {
  return <span className="text-red-500 ml-0.5">*</span>
}

export default function NuevaTransaccionForm({ cuentas }: { cuentas: string[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'idle' | 'supabase' | 'excel' | 'done'>('idle')
  const [excelOk, setExcelOk] = useState<boolean | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    fecha: today(),
    tipo: 'CTA CTE',
    col_f: 'C',
    cuenta_cte: cuentas[0] ?? '',
    operacion: 'INGRESAN',
    propio: 'DOLARES',
    externo: 'DOLARES',
    monto: '',
    cotizacion: '',
    notas: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function validate(): string | null {
    if (!form.fecha)       return 'La fecha es obligatoria'
    if (!form.tipo)        return 'El tipo de transacción es obligatorio'
    if (!form.col_f)       return 'Op es obligatorio'
    if (!form.cuenta_cte)  return 'Seleccioná una cuenta corriente'
    if (!form.operacion)   return 'La operación es obligatoria'
    if (!form.propio)      return 'El campo Propio es obligatorio'
    if (!form.externo)     return 'El campo Externo es obligatorio'
    if (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) <= 0)
      return 'El monto debe ser un número mayor a 0'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) return setError(validationError)

    const payload = {
      ...form,
      monto: Number(form.monto),
      cotizacion: form.cotizacion ? Number(form.cotizacion) : null,
    }

    setStep('supabase')
    setLoading(true)
    try {
      const res = await fetch('/api/transacciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al guardar')
        setStep('idle')
        setLoading(false)
        return
      }

      // Supabase insert succeeded — show intermediate screen
      setStep('excel')
      setLoading(false)

      // Fire Excel write in background
      fetch('/api/excel-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(r => r.json())
        .then((excelData: { excel: boolean; warning?: string }) => {
          setExcelOk(excelData.excel ?? false)
          setWarning(excelData.warning ?? null)
          setStep('done')
        })
        .catch(() => {
          setExcelOk(false)
          setWarning('Error de conexión al actualizar Excel')
          setStep('done')
        })
    } catch {
      setError('Error de conexión. Verificá tu conexión e intentá de nuevo.')
      setStep('idle')
      setLoading(false)
    }
  }

  function resetForm() {
    setStep('idle')
    setExcelOk(null)
    setWarning(null)
    setError(null)
    setForm(f => ({ ...f, monto: '', cotizacion: '', notas: '' }))
  }

  // Intermediate: Supabase done, Excel in progress
  if (step === 'excel') {
    return (
      <div className="card p-6 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <p className="text-gray-800 font-semibold">Guardado en sistema</p>
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Actualizando Excel…
        </div>
      </div>
    )
  }

  // Final: both done
  if (step === 'done') {
    return (
      <div className="card p-6 text-center space-y-4">
        <div className="text-4xl">{excelOk ? '✅' : '⚠️'}</div>
        <p className="text-gray-800 font-semibold">Transacción guardada</p>
        <div className={`rounded-lg p-3 text-sm text-left ${excelOk ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
          {excelOk ? '✓ Registrado en sistema y en Excel' : `Sistema ✓ · Excel ✗: ${warning}`}
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <button className="btn-secondary" onClick={resetForm}>
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
          <label className="label">Tipo de transacción<Required /></label>
          <select className="input" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fecha<Required /></label>
          <input
            type="date"
            className="input"
            value={form.fecha}
            onChange={e => set('fecha', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Op<Required /></label>
          <select className="input" value={form.col_f} onChange={e => set('col_f', e.target.value)}>
            <option value="C">C</option>
            <option value="T">T</option>
          </select>
        </div>
      </div>

      {/* Fila 2: Cuenta + Operación */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Cuenta corriente<Required /></label>
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
          <label className="label">Operación<Required /></label>
          <select className="input" value={form.operacion} onChange={e => set('operacion', e.target.value)}>
            {OPERACIONES.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        </div>
      </div>

      {/* Fila 3: Propio + Externo + Monto + Cotización */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="label">Propio<Required /></label>
          <select className="input" value={form.propio} onChange={e => set('propio', e.target.value)}>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Externo<Required /></label>
          <select className="input" value={form.externo} onChange={e => set('externo', e.target.value)}>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Monto<Required /></label>
          <input
            type="number"
            step="0.01"
            min="0.01"
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

      <div className="flex items-center gap-4 pt-1">
        <button type="submit" className="btn-primary flex-1" disabled={loading || step === 'supabase'}>
          {loading || step === 'supabase' ? 'Guardando…' : 'Guardar transacción'}
        </button>
        <p className="text-xs text-gray-400 shrink-0"><Required /> Obligatorio</p>
      </div>
    </form>
  )
}
