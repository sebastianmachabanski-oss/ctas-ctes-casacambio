'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { calcularMovimiento, validarOperacion } from '@/lib/motor-calculo'

const MONEDAS = ['PESOS', 'DOLARES', 'EUROS', 'REALES']
const SIMBOLOS: Record<string, string> = {
  pesos: '$', cheques: 'CH$', dolares: 'U$S', euros: '€', reales: 'R$',
  banco: 'BCO', cc_pesos: 'CC $', cc_dolares: 'CC U$S', cc_euros: 'CC €', cc_reales: 'CC R$',
}
const nfPreview = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

// Monto con separador de miles en vivo (como el mockup): puntos de miles, coma decimal.
function fmtMonto(s: string): string {
  const limpio = s.replace(/[^\d,]/g, '')
  const i = limpio.indexOf(',')
  const ent = (i >= 0 ? limpio.slice(0, i) : limpio).replace(/^0+(?=\d)/, '')
  const dec = i >= 0 ? ',' + limpio.slice(i + 1).replace(/,/g, '').slice(0, 2) : ''
  const conMiles = ent ? new Intl.NumberFormat('es-AR').format(Number(ent)) : ''
  return conMiles + dec
}
function montoNumero(s: string): number {
  if (!s) return NaN
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : NaN
}
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

export default function NuevaTransaccionForm({ cuentas }: { cuentas: string[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'idle' | 'supabase' | 'done'>('idle')
  const [cajaDirecta, setCajaDirecta] = useState(false)
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

  // Selector de cliente según el Tipo (decisión 11/7/2026):
  //  - CTA CTE: buscador SOLO sobre las cuentas corrientes reales (sin alta libre —
  //    un nombre que no exista rompe las fórmulas de la planilla).
  //  - CAJA: texto libre sin desplegable (clientes eventuales, NO normalizados).
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteOpen, setClienteOpen] = useState(false)
  const cuentasFiltradas = cuentas
    .filter(c => c.toUpperCase().includes(clienteQuery.trim().toUpperCase()))
    .sort((a, b) => a.localeCompare(b, 'es'))

  function elegirCuenta(nombre: string) {
    set('cuenta_cte', nombre)
    setClienteQuery(nombre)
    setClienteOpen(false)
  }

  // Enter en el buscador: selecciona el match exacto (o el único resultado); nunca
  // dispara el submit ni da de alta nada.
  function handleCuentaKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const query = clienteQuery.trim().toUpperCase()
    const exacta = cuentas.find(c => c.toUpperCase() === query)
    if (exacta) { elegirCuenta(exacta); return }
    if (cuentasFiltradas.length === 1) elegirCuenta(cuentasFiltradas[0])
  }

  const operacionesDisponibles = OPERACIONES_POR_TIPO[form.tipo] ?? []
  const cotizacionRequerida = OPERACIONES_REQUIEREN_COTIZACION.includes(form.operacion)

  // Monto elevado en pesos (> $ 1.000.000): banner con checkbox de confirmación (mockup),
  // en lugar del popup del navegador.
  const [confirmoGrande, setConfirmoGrande] = useState(false)
  const montoGrande = useMemo(() => {
    const monto = montoNumero(form.monto)
    const muevePesos = form.propio.toUpperCase() === 'PESOS' || form.externo.toUpperCase() === 'PESOS'
    return muevePesos && monto > 1_000_000
  }, [form.monto, form.propio, form.externo])

  // Previsualización en vivo con el MISMO motor que usa el servidor (validado 100%
  // contra la planilla): el usuario ve el impacto en caja antes de guardar.
  const preview = useMemo(() => {
    const monto = montoNumero(form.monto)
    if (!form.operacion || !form.propio || !form.monto || isNaN(monto)) return { tipo: 'vacio' as const }
    const errorNegocio = validarOperacion({ operacion: form.operacion, propio: form.propio })
    if (errorNegocio) return { tipo: 'error' as const, mensaje: errorNegocio }
    try {
      const r = calcularMovimiento({
        tipo: form.tipo as 'CAJA' | 'CTA CTE',
        operacion: form.operacion, propio: form.propio, externo: form.externo,
        monto, cotizacion: form.cotizacion ? Number(form.cotizacion) : null,
        costoPorcentaje: form.costo_porcentaje ? Number(form.costo_porcentaje) : null,
      })
      const chips = Object.entries(r.valores).filter(([, v]) => v !== 0)
      return { tipo: 'ok' as const, cuenta: r.cuenta, chips }
    } catch (e: any) {
      return { tipo: 'error' as const, mensaje: e.message as string }
    }
  }, [form])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function setTipo(tipo: string) {
    // Al cambiar el Tipo, la Operación puede dejar de ser válida (se resetea a la primera
    // opción) y el cliente elegido tampoco aplica (cuenta corriente ↔ cliente eventual).
    const opciones = OPERACIONES_POR_TIPO[tipo] ?? []
    setForm(f => ({ ...f, tipo, operacion: opciones[0] ?? '', cuenta_cte: '' }))
    setClienteQuery('')
    setClienteOpen(false)
  }

  function validate(): string | null {
    if (!form.fecha)       return 'La fecha es obligatoria'
    if (!form.tipo)        return 'El tipo de transacción es obligatorio'
    if (!form.col_f)       return 'Op es obligatorio'
    if (!form.cuenta_cte.trim())
      return form.tipo === 'CTA CTE'
        ? 'Seleccioná una cuenta corriente de la lista'
        : 'Ingresá el nombre del cliente'
    if (!form.operacion)   return 'La operación es obligatoria'
    if (!form.propio)      return 'El campo Propio es obligatorio'
    if (!form.externo)     return 'El campo Externo es obligatorio'
    if (!form.monto || isNaN(montoNumero(form.monto)) || montoNumero(form.monto) <= 0)
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

    // Monto elevado en pesos: exige tildar la confirmación del banner (sin popup).
    if (montoGrande && !confirmoGrande)
      return setError('El monto supera $ 1.000.000: tildá la confirmación para poder guardar.')

    const payload = {
      ...form,
      cuenta_cte: form.cuenta_cte.trim(),
      monto: montoNumero(form.monto),
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
      setCajaDirecta(data.caja_directa === true)
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
          {excelOk !== null && (
            <p className="mt-1 text-xs opacity-80">
              {cajaDirecta
                ? '✓ Visible al instante en Transacciones e Inicio'
                : 'ℹ️ Se verá en Transacciones tras la próxima sincronización (falta la policy de escritura directa)'}
            </p>
          )}
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
          <button className="btn-primary" onClick={() => router.push('/dashboard/transacciones')}>
            Ver movimientos
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Campos en grilla fluida (estilo mockup): se acomodan al ancho de la pantalla */}
      <div className="form-grid">
        <div>
          <label className="label">Tipo<Required /></label>
          <select className="input" value={form.tipo} onChange={e => setTipo(e.target.value)}>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fecha<Required /></label>
          <input type="date" className="input" value={form.fecha}
            onChange={e => set('fecha', e.target.value)} required />
          {/* El formato visual del selector nativo lo define el navegador; esta línea
              confirma la fecha elegida siempre en DD/MM/AAAA, sin depender de eso. */}
          {form.fecha && <p className="text-xs text-gray-400 mt-1">{formatoDDMMYYYY(form.fecha)}</p>}
        </div>
        <div>
          <label className="label">Op<Required /></label>
          <select className="input" value={form.col_f} onChange={e => set('col_f', e.target.value)}>
            <option value="C">C</option>
            <option value="T">T</option>
          </select>
        </div>
        {form.tipo === 'CTA CTE' ? (
          <div className="relative">
            <label className="label">Cuenta corriente<Required /></label>
            <input
              type="text"
              className="input"
              value={clienteQuery}
              onChange={e => {
                setClienteQuery(e.target.value)
                set('cuenta_cte', '') // obliga a elegir una cuenta real de la lista
                setClienteOpen(true)
              }}
              onFocus={() => setClienteOpen(true)}
              onBlur={() => setTimeout(() => setClienteOpen(false), 150)}
              onKeyDown={handleCuentaKeyDown}
              placeholder="Buscar cuenta corriente…"
              autoComplete="off"
              required
            />
            {clienteOpen && (
              <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                {cuentasFiltradas.length > 0 ? cuentasFiltradas.map(c => (
                  <li key={c}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => elegirCuenta(c)}
                    >
                      {c}
                    </button>
                  </li>
                )) : (
                  <li className="px-3 py-2 text-sm text-gray-400">Sin resultados — la cuenta corriente debe existir (se crean desde Usuarios/planilla)</li>
                )}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <label className="label">Cliente<Required /></label>
            <input
              type="text"
              className="input"
              value={form.cuenta_cte}
              onChange={e => set('cuenta_cte', e.target.value)}
              placeholder="Nombre del cliente"
              autoComplete="off"
              required
            />
            <p className="text-xs text-gray-400 mt-1">Cliente eventual: se escribe tal cual, sin lista.</p>
          </div>
        )}
        <div>
          <label className="label">Operación<Required /></label>
          <select className="input" value={form.operacion} onChange={e => set('operacion', e.target.value)}>
            {operacionesDisponibles.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Moneda propia<Required /></label>
          <select className="input" value={form.propio} onChange={e => set('propio', e.target.value)}>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Moneda externa<Required /></label>
          <select className="input" value={form.externo} onChange={e => set('externo', e.target.value)}>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Monto<Required /></label>
          <input
            type="text"
            inputMode="decimal"
            className="input num"
            value={form.monto}
            onChange={e => set('monto', fmtMonto(e.target.value))}
            placeholder="0"
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
          <label className="label">Debe · repartidor</label>
          <input
            type="text"
            className="input"
            value={form.debe}
            onChange={e => set('debe', e.target.value)}
            placeholder="Nombre del repartidor"
          />
          <p className="text-xs text-gray-400 mt-1">
            Cargá el nombre del repartidor que tiene el dinero en la calle. Dejalo vacío si ya está en la caja.
          </p>
        </div>
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
      </div>

      {/* Banner de monto elevado (mockup): visible solo si mueve pesos por > $ 1.000.000 */}
      {montoGrande && (
        <div className="banner-warn">
          ⚠️ <b>Monto elevado.</b> Supera $ 1.000.000.
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmoGrande} onChange={e => setConfirmoGrande(e.target.checked)} />
            Confirmo que el monto es correcto
          </label>
        </div>
      )}

      {/* Previsualización · impacto en caja (motor de cálculo, igual que el mockup) */}
      <div style={{ padding: '13px 15px', border: '1px solid var(--ring)', borderRadius: 10, background: 'var(--wash)' }}>
        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-2)', marginBottom: 8 }}>
          Previsualización · impacto en caja
        </div>
        {preview.tipo === 'vacio' && <p className="text-sm text-gray-400">Completá operación, moneda y monto.</p>}
        {preview.tipo === 'error' && <p className="text-sm text-red-600">{preview.mensaje}</p>}
        {preview.tipo === 'ok' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {preview.chips.length === 0 && <span className="text-sm text-gray-400">Sin impacto</span>}
            {preview.chips.map(([col, v]) => (
              <span key={col} className={`imp ${(v as number) > 0 ? 'p' : 'n'}`}>
                {SIMBOLOS[col] ?? col} {(v as number) < 0 ? `(${nfPreview.format(-(v as number))})` : nfPreview.format(v as number)}
              </span>
            ))}
            {preview.cuenta && (
              <span className="text-xs" style={{ color: 'var(--muted)', alignSelf: 'center' }}>· Cuenta: <b style={{ color: 'var(--ink-2)' }}>{preview.cuenta}</b></span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 pt-1">
        <button type="submit" className="btn-primary"
          disabled={loading || (montoGrande && !confirmoGrande)}>
          {loading ? 'Guardando…' : 'Guardar transacción'}
        </button>
        <p className="text-xs text-gray-400 shrink-0"><Required /> Obligatorio</p>
      </div>
    </form>
  )
}
