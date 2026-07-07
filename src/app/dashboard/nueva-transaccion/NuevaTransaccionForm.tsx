'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MONEDAS = ['PESOS', 'DOLARES', 'EUROS', 'REALES']
const TIPOS = ['CTA CTE', 'CAJA']
// La Operación disponible depende del Tipo de transacción elegido.
const OPERACIONES_POR_TIPO: Record<string, string[]> = {
  'CTA CTE': ['INGRESAN', 'EGRESAN'],
  'CAJA': ['COMPRA', 'VENTA', 'INGRESAN', 'EGRESAN', 'GASTOS'],
}
// Cotización obligatoria solo para operaciones de compra/venta de moneda.
const OPERACIONES_REQUIEREN_COTIZACION = ['COMPRA', 'VENTA']

function today() {
  // OJO: toISOString() da la fecha en UTC, no en horario local — de noche en Argentina
  // (UTC-3) ya es "mañana" en UTC y proponía el día siguiente. Se arma con componentes
  // locales para que siempre sea el día de hoy en el huso horario del usuario.
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatoDDMMYYYY(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function Required() {
  return <span className="text-red-500 ml-0.5">*</span>
}

export default function NuevaTransaccionForm({ clientes }: { clientes: string[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'idle' | 'supabase' | 'done'>('idle')
  const [excelOk, setExcelOk] = useState<boolean | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    fecha: today(),
    tipo: 'CTA CTE',
    col_f: 'C',
    cuenta_cte: '',
    operacion: 'INGRESAN',
    propio: 'DOLARES',
    externo: 'DOLARES',
    monto: '',
    cotizacion: '',
    costo_porcentaje: '',
    debe: '',
    notas: '',
  })

  // Buscador del selector de Cliente: texto tipeado + visibilidad del desplegable.
  // clientesLocal arranca con la lista del server y crece en memoria cuando se da de alta
  // un cliente nuevo, para que sea buscable en la misma sesión sin esperar al próximo sync.
  const [clientesLocal, setClientesLocal] = useState(clientes)
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteOpen, setClienteOpen] = useState(false)
  const [clienteGuardando, setClienteGuardando] = useState(false)
  const clientesFiltrados = clientesLocal
    .filter(c => c.toUpperCase().includes(clienteQuery.trim().toUpperCase()))
    .sort((a, b) => a.localeCompare(b, 'es'))

  function elegirCliente(nombre: string) {
    set('cuenta_cte', nombre)
    setClienteQuery(nombre)
    setClienteOpen(false)
  }

  // Enter en el buscador de Cliente: si matchea exacto a uno existente, lo selecciona. Si
  // no existe ningún cliente con ese nombre, pregunta si darlo de alta como cliente nuevo.
  async function handleClienteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault() // no disparar el submit del formulario
    const query = clienteQuery.trim()
    if (!query || clienteGuardando) return

    const existente = clientesLocal.find(c => c.toUpperCase() === query.toUpperCase())
    if (existente) { elegirCliente(existente); return }

    setClienteOpen(false)
    const confirmado = confirm(`"${query}" no está en la lista de clientes. ¿Querés agregarlo como cliente nuevo?`)
    if (!confirmado) {
      // Puede haber sido un error de tipeo: vacía el campo para que elija uno correcto.
      setClienteQuery('')
      set('cuenta_cte', '')
      return
    }

    setClienteGuardando(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: query }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert('No se pudo agregar el cliente: ' + (data.error ?? 'error desconocido'))
        return
      }
      setClientesLocal(prev => [...prev, data.nombre])
      elegirCliente(data.nombre)
    } catch {
      alert('Error de conexión al agregar el cliente')
    } finally {
      setClienteGuardando(false)
    }
  }

  const operacionesDisponibles = OPERACIONES_POR_TIPO[form.tipo] ?? []
  const cotizacionRequerida = OPERACIONES_REQUIEREN_COTIZACION.includes(form.operacion)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function setTipo(tipo: string) {
    // Al cambiar el Tipo, la Operación puede dejar de ser válida: la reseteamos a la primera opción.
    const opciones = OPERACIONES_POR_TIPO[tipo] ?? []
    setForm(f => ({ ...f, tipo, operacion: opciones[0] ?? '' }))
  }

  function validate(): string | null {
    if (!form.fecha)       return 'La fecha es obligatoria'
    if (!form.tipo)        return 'El tipo de transacción es obligatorio'
    if (!form.col_f)       return 'Op es obligatorio'
    if (!form.cuenta_cte)  return 'Seleccioná un cliente de la lista'
    if (!form.operacion)   return 'La operación es obligatoria'
    if (!form.propio)      return 'El campo Propio es obligatorio'
    if (!form.externo)     return 'El campo Externo es obligatorio'
    if (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) <= 0)
      return 'El monto debe ser un número mayor a 0'
    if (cotizacionRequerida && (!form.cotizacion || isNaN(Number(form.cotizacion)) || Number(form.cotizacion) <= 0))
      return 'La cotización es obligatoria para operaciones de Compra/Venta'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) return setError(validationError)

    // Confirmación para montos elevados en pesos: si la operación mueve PESOS por más de
    // $ 1.000.000, se pide confirmar antes de guardar (evita cargas erróneas de un cero de más).
    const monto = Number(form.monto)
    const muevePesos = form.propio.toUpperCase() === 'PESOS' || form.externo.toUpperCase() === 'PESOS'
    if (muevePesos && monto > 1_000_000) {
      const fmtArs = new Intl.NumberFormat('es-AR').format(monto)
      if (!confirm(`El monto es de $ ${fmtArs} (supera $ 1.000.000). ¿Confirmás que es correcto?`)) return
    }

    const payload = {
      ...form,
      monto: Number(form.monto),
      cotizacion: form.cotizacion ? Number(form.cotizacion) : null,
      costo_porcentaje: form.costo_porcentaje ? Number(form.costo_porcentaje) : null,
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

      // Supabase ya quedó guardado: mostramos la confirmación de una. La escritura en la
      // planilla sigue en segundo plano y actualiza su propio estado sin bloquear al usuario.
      setStep('done')
      setLoading(false)
      setExcelOk(null) // null = todavía sincronizando con la planilla

      fetch('/api/excel-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(r => r.json())
        .then((excelData: { excel: boolean; warning?: string }) => {
          setExcelOk(excelData.excel ?? false)
          setWarning(excelData.warning ?? null)
        })
        .catch(() => {
          setExcelOk(false)
          setWarning('Error de conexión al actualizar la planilla')
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
    setForm(f => ({ ...f, monto: '', cotizacion: '', costo_porcentaje: '', debe: '', notas: '' }))
  }

  // La transacción ya quedó guardada en el sistema (Supabase). La planilla se actualiza en
  // segundo plano: este estado se refresca solo cuando esa escritura responde, sin bloquear.
  if (step === 'done') {
    return (
      <div className="card p-6 text-center space-y-4">
        <div className="text-4xl">{excelOk === false ? '⚠️' : '✅'}</div>
        <p className="text-gray-800 font-semibold">Transacción guardada</p>
        <div className={`rounded-lg p-3 text-sm text-left ${
          excelOk === false
            ? 'bg-amber-50 border border-amber-200 text-amber-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          {excelOk === true && '✓ Registrado en sistema y en la planilla'}
          {excelOk === false && `Sistema ✓ · Planilla ✗: ${warning}`}
          {excelOk === null && (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              ✓ Registrado en sistema · sincronizando con la planilla…
            </span>
          )}
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
          <select className="input" value={form.tipo} onChange={e => setTipo(e.target.value)}>
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
          {/* El formato visual del selector nativo lo define el navegador; esta línea
              confirma la fecha elegida siempre en DD/MM/AAAA, sin depender de eso. */}
          {form.fecha && (
            <p className="text-xs text-gray-400 mt-1">{formatoDDMMYYYY(form.fecha)}</p>
          )}
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
        <div className="relative">
          <label className="label">Cliente<Required /></label>
          <input
            type="text"
            className="input"
            value={clienteQuery}
            onChange={e => {
              setClienteQuery(e.target.value)
              set('cuenta_cte', '') // obliga a elegir un cliente real de la lista
              setClienteOpen(true)
            }}
            onFocus={() => setClienteOpen(true)}
            onBlur={() => setTimeout(() => setClienteOpen(false), 150)}
            onKeyDown={handleClienteKeyDown}
            placeholder="Buscar cliente… (Enter para agregar uno nuevo)"
            autoComplete="off"
            disabled={clienteGuardando}
            required
          />
          {clienteOpen && (
            <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
              {clientesFiltrados.length > 0 ? clientesFiltrados.map(c => (
                <li key={c}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => elegirCliente(c)}
                  >
                    {c}
                  </button>
                </li>
              )) : (
                <li className="px-3 py-2 text-sm text-gray-400">Sin resultados — Enter para agregarlo como cliente nuevo</li>
              )}
            </ul>
          )}
        </div>
        <div>
          <label className="label">Operación<Required /></label>
          <select className="input" value={form.operacion} onChange={e => set('operacion', e.target.value)}>
            {operacionesDisponibles.map(op => <option key={op} value={op}>{op}</option>)}
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
          <label className="label">Cotización{cotizacionRequerida && <Required />}</label>
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

      {/* Fila 4: Costo % + Debe */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Costo %</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.costo_porcentaje}
            onChange={e => set('costo_porcentaje', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="label">Debe</label>
          <input
            type="text"
            className="input"
            value={form.debe}
            onChange={e => set('debe', e.target.value)}
            placeholder="Nombre del repartidor que tiene el dinero"
          />
          <p className="text-xs text-gray-400 mt-1">
            Cargá el nombre del repartidor que tiene el dinero en la calle. Dejalo vacío si ya está en la caja.
          </p>
        </div>
      </div>

      {/* Fila 5: Notas */}
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
        <button type="submit" className="btn-primary flex-1" disabled>
          Guardar transacción
        </button>
        <p className="text-xs text-gray-400 shrink-0"><Required /> Obligatorio</p>
      </div>
      <p className="text-sm text-red-500 text-center">Funcionalidad en desarrollo</p>
    </form>
  )
}
