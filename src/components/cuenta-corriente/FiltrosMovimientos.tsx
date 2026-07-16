'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  tiposOperacion: { codigo: string; descripcion: string }[]
  valoresIniciales: { desde: string; hasta: string; operacion: string; cuenta?: string }
  cuentas?: string[]
  esSuperusuarioOOperador?: boolean
}

export default function FiltrosMovimientos({ tiposOperacion, valoresIniciales, cuentas, esSuperusuarioOOperador }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [desde, setDesde] = useState(valoresIniciales.desde)
  const [hasta, setHasta] = useState(valoresIniciales.hasta)
  const [operacion, setOperacion] = useState(valoresIniciales.operacion)
  const [cuenta, setCuenta] = useState(valoresIniciales.cuenta ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (operacion) params.set('operacion', operacion)
    if (cuenta) params.set('cuenta', cuenta)
    // replace en lugar de push para que el back no funcione
    startTransition(() => { router.replace(`${pathname}?${params.toString()}`) })
  }

  function handleLimpiar() {
    setDesde(''); setHasta(''); setOperacion(''); setCuenta('')
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
            <p className="text-sm font-medium text-gray-700">Cargando movimientos...</p>
          </div>
        </div>
      )}

      {/* Fila de filtros inline (estilo mockup): Cuenta + Desde + Hasta + Tipo + Buscar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {esSuperusuarioOOperador && cuentas && cuentas.length > 0 && (
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <label className="label">Cuenta corriente</label>
            <select className="input" value={cuenta} onChange={e => setCuenta(e.target.value)}>
              <option value="">Todas las cuentas</option>
              {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="desde">Desde</label>
          <input id="desde" type="date" className="input" value={desde}
            onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Hasta</label>
          <input id="hasta" type="date" className="input" value={hasta}
            onChange={e => setHasta(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="operacion">Tipo de movimiento</label>
          <select id="operacion" className="input" value={operacion}
            onChange={e => setOperacion(e.target.value)}>
            <option value="">Todos</option>
            <option value="INGRESO">{process.env.NEXT_PUBLIC_LABEL_INGRESO ?? 'Ingreso'}</option>
            <option value="EGRESO">{process.env.NEXT_PUBLIC_LABEL_EGRESO ?? 'Egreso'}</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn-primary" disabled={isPending}>Buscar</button>
          <button type="button" className="btn-secondary" disabled={isPending} onClick={handleLimpiar}>Limpiar</button>
        </div>
      </div>
    </form>
  )
}
