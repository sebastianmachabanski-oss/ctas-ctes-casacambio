'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  tiposOperacion: { codigo: string; descripcion: string }[]
  valoresIniciales: { desde: string; hasta: string; concepto: string; operacion: string }
}

export default function FiltrosMovimientos({ tiposOperacion, valoresIniciales }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [desde, setDesde] = useState(valoresIniciales.desde)
  const [hasta, setHasta] = useState(valoresIniciales.hasta)
  const [concepto, setConcepto] = useState(valoresIniciales.concepto)
  const [operacion, setOperacion] = useState(valoresIniciales.operacion)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!desde || !hasta) return
    const params = new URLSearchParams()
    params.set('desde', desde)
    params.set('hasta', hasta)
    if (concepto) params.set('concepto', concepto)
    if (operacion) params.set('operacion', operacion)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function handleLimpiar() {
    setDesde(''); setHasta(''); setConcepto(''); setOperacion('')
    startTransition(() => { router.push(pathname) })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="label" htmlFor="desde">Fecha desde *</label>
          <input id="desde" type="date" className="input" value={desde}
            onChange={e => setDesde(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Fecha hasta *</label>
          <input id="hasta" type="date" className="input" value={hasta}
            onChange={e => setHasta(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="concepto">Concepto</label>
          <input id="concepto" type="text" className="input" placeholder="ej: DOLARES"
            value={concepto} onChange={e => setConcepto(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="operacion">Tipo de movimiento</label>
          <select id="operacion" className="input" value={operacion}
            onChange={e => setOperacion(e.target.value)}>
            <option value="">Todos</option>
            <option value="DONACION">Ingreso</option>
            <option value="COMPROMISO">Egreso</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={isPending}>
          {isPending ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Buscando...
            </span>
          ) : 'Buscar'}
        </button>
        <button type="button" className="btn-secondary" disabled={isPending} onClick={handleLimpiar}>
          Limpiar
        </button>
      </div>

      {/* Overlay de carga sobre la página */}
      {isPending && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg px-8 py-6 flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <p className="text-sm font-medium text-gray-700">Cargando movimientos...</p>
          </div>
        </div>
      )}
    </form>
  )
}
