'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
interface Props {
  tiposOperacion: { codigo: string; descripcion: string }[]
  valoresIniciales: { desde: string; hasta: string; concepto: string; operacion: string }
}
export default function FiltrosMovimientos({ tiposOperacion, valoresIniciales }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [desde, setDesde] = useState(valoresIniciales.desde)
  const [hasta, setHasta] = useState(valoresIniciales.hasta)
  const [concepto, setConcepto] = useState(valoresIniciales.concepto)
  const [operacion, setOperacion] = useState(valoresIniciales.operacion)
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!desde || !hasta) return
    const params = new URLSearchParams()
    params.set('desde', desde); params.set('hasta', hasta)
    if (concepto) params.set('concepto', concepto)
    if (operacion) params.set('operacion', operacion)
    router.push(`${pathname}?${params.toString()}`)
  }
  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="desde">Fecha desde *</label>
          <input id="desde" type="date" className="input" value={desde} onChange={e => setDesde(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Fecha hasta *</label>
          <input id="hasta" type="date" className="input" value={hasta} onChange={e => setHasta(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="concepto">Concepto</label>
          <input id="concepto" type="text" className="input" placeholder="ej: DONACIONES" value={concepto} onChange={e => setConcepto(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="operacion">Tipo de operación</label>
          <select id="operacion" className="input" value={operacion} onChange={e => setOperacion(e.target.value)}>
            <option value="">Todas</option>
            {tiposOperacion.map(t => <option key={t.codigo} value={t.codigo}>{t.descripcion}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" className="btn-primary">Buscar movimientos</button>
        <button type="button" className="btn-secondary" onClick={() => { setDesde(''); setHasta(''); setConcepto(''); setOperacion(''); router.push(pathname) }}>Limpiar</button>
      </div>
    </form>
  )
}
