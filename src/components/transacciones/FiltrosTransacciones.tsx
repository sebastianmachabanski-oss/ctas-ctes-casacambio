'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'

// Operaciones reales de la planilla (tabla 1 de SIGNOS + SALDO INICIAL).
const OPERACIONES = [
  'COMPRA', 'VENTA', 'INGRESAN', 'EGRESAN', 'GASTOS', 'SWITCH',
  'ENTRA TT', 'SALE TT', 'SOBRANTE', 'FALTANTE', 'GANANCIA', 'SALDO INICIAL',
]

interface Props {
  valoresIniciales: { desde: string; hasta: string; cliente: string; operacion: string; tipo: string }
}

export default function FiltrosTransacciones({ valoresIniciales }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [desde, setDesde] = useState(valoresIniciales.desde)
  const [hasta, setHasta] = useState(valoresIniciales.hasta)
  const [cliente, setCliente] = useState(valoresIniciales.cliente)
  const [operacion, setOperacion] = useState(valoresIniciales.operacion)
  const [tipo, setTipo] = useState(valoresIniciales.tipo)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (cliente.trim()) params.set('cliente', cliente.trim())
    if (operacion) params.set('operacion', operacion)
    if (tipo) params.set('tipo', tipo)
    // El cambio de filtros siempre vuelve a la página 1.
    startTransition(() => { router.replace(`${pathname}?${params.toString()}`) })
  }

  function handleLimpiar() {
    setDesde(''); setHasta(''); setCliente(''); setOperacion(''); setTipo('')
    startTransition(() => { router.replace(pathname) })
  }

  return (
    <form onSubmit={handleSubmit}>
      {isPending && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg px-8 py-6 flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <p className="text-sm font-medium text-gray-700">Cargando transacciones...</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div>
          <label className="label" htmlFor="desde">Fecha desde</label>
          <input id="desde" type="date" className="input" value={desde}
            onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Fecha hasta</label>
          <input id="hasta" type="date" className="input" value={hasta}
            onChange={e => setHasta(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="cliente">Cliente</label>
          <input id="cliente" type="search" className="input" placeholder="Buscar…"
            value={cliente} onChange={e => setCliente(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="operacion">Operación</label>
          <select id="operacion" className="input" value={operacion}
            onChange={e => setOperacion(e.target.value)}>
            <option value="">Todas</option>
            {OPERACIONES.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tipo">Tipo</label>
          <select id="tipo" className="input" value={tipo}
            onChange={e => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="CAJA">Caja</option>
            <option value="CTA CTE">Cta cte</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div className="flex gap-3 w-full">
            <button type="submit" className="btn-primary flex-1" disabled={isPending}>
              Buscar
            </button>
            <button type="button" className="btn-secondary" disabled={isPending} onClick={handleLimpiar}>
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
