'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Mov = {
  id: string; fecha: string; cliente: string | null; operacion: string; monto: number
  tipo: string; debe: string | null
  pesos: number; cheques: number; dolares: number; euros: number; reales: number; banco: number
  cc_pesos: number; cc_dolares: number; cc_euros: number; cc_reales: number
}

// Columnas de impacto por moneda (solo se muestran las presentes en el resultado).
const IMPACTOS: { key: keyof Mov; sym: string }[] = [
  { key: 'pesos', sym: '$' }, { key: 'cheques', sym: 'CH$' }, { key: 'dolares', sym: 'U$S' },
  { key: 'euros', sym: '€' }, { key: 'reales', sym: 'R$' }, { key: 'banco', sym: 'BCO' },
  { key: 'cc_pesos', sym: 'CC $' }, { key: 'cc_dolares', sym: 'CC U$S' },
  { key: 'cc_euros', sym: 'CC €' }, { key: 'cc_reales', sym: 'CC R$' },
]
const OPERACIONES = ['COMPRA', 'VENTA', 'INGRESAN', 'EGRESAN', 'GASTOS', 'SWITCH', 'ENTRA TT', 'SALE TT', 'SOBRANTE', 'FALTANTE', 'GANANCIA', 'SALDO INICIAL']

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const money = (v: number) => v < 0 ? `(${nf.format(-v)})` : nf.format(v)
const fmtFecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-AR')
function badge(op: string) {
  const o = (op || '').toUpperCase()
  if (['COMPRA', 'INGRESAN', 'SOBRANTE', 'GANANCIA'].includes(o)) return 'tag-green'
  if (['VENTA', 'EGRESAN', 'GASTOS', 'FALTANTE'].includes(o)) return 'tag-red'
  return 'tag-gray'
}

export default function TransaccionesView({ movimientos, puedeEditar, desde, hasta, total, pagina, totalPaginas }: {
  movimientos: Mov[]; puedeEditar: boolean; desde: string; hasta: string
  total: number; pagina: number; totalPaginas: number
}) {
  const router = useRouter()
  const [d1, setD1] = useState(desde)
  const [d2, setD2] = useState(hasta)
  const [fCli, setFCli] = useState('')
  const [fOp, setFOp] = useState('')
  const [fMin, setFMin] = useState('')

  // Columnas de impacto presentes en la página cargada.
  const cols = useMemo(() => IMPACTOS.filter(c => movimientos.some(m => (m[c.key] as number ?? 0) !== 0)), [movimientos])

  // Filtros por columna: refinan (en vivo) las filas de la página, como el mockup.
  const filtrados = useMemo(() => {
    const qc = fCli.trim().toUpperCase()
    const qm = Number((fMin || '').replace(/\D/g, '')) || 0   // solo dígitos: "1.000.000" → 1000000
    return movimientos.filter(m =>
      (m.cliente ?? '').toUpperCase().includes(qc) &&
      (!fOp || m.operacion === fOp) &&
      Math.abs(m.monto) >= qm)
  }, [movimientos, fCli, fOp, fMin])

  // Navegación (rango de fechas y paginación) conservando el estado en la URL.
  function navegar(p: number, d1v = d1, d2v = d2) {
    const params = new URLSearchParams()
    if (d1v) params.set('desde', d1v)
    if (d2v) params.set('hasta', d2v)
    if (p > 1) params.set('pagina', String(p))
    const qs = params.toString()
    router.replace('/dashboard/transacciones' + (qs ? '?' + qs : ''))
  }
  const buscar = () => navegar(1)  // cambiar el rango vuelve a la página 1

  const ncols = 4 + cols.length + (puedeEditar ? 1 : 0)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Filtro de rango + aviso de filtros por columna */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div><label className="label">Desde</label><input className="input" type="date" value={d1} onChange={e => setD1(e.target.value)} /></div>
          <div><label className="label">Hasta</label><input className="input" type="date" value={d2} onChange={e => setD2(e.target.value)} /></div>
          <button className="btn-primary" onClick={buscar}>Buscar</button>
          <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Filtrá directamente por columna abajo ↓</span>
          </div>
        </div>
      </div>

      {/* Tabla con filtros por columna */}
      <div className="card">
        <div className="tbl-wrap">
          <table className="cc-tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th style={{ textAlign: 'left' }}>Cliente</th>
                <th style={{ textAlign: 'left' }}>Operación</th>
                <th>Monto</th>
                {cols.map(c => <th key={c.key as string}>Imp. {c.sym}</th>)}
                {puedeEditar && <th></th>}
              </tr>
              <tr className="tx-filtros">
                <th></th>
                <th style={{ textAlign: 'left' }}>
                  <input className="srch" placeholder="filtrar…" value={fCli} onChange={e => setFCli(e.target.value)} style={{ width: '100%', minWidth: 0 }} />
                </th>
                <th style={{ textAlign: 'left' }}>
                  <select className="srch" value={fOp} onChange={e => setFOp(e.target.value)} style={{ width: '100%', minWidth: 0 }}>
                    <option value="">todas</option>
                    {OPERACIONES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </th>
                <th><input className="srch" placeholder="monto ≥" value={fMin} onChange={e => setFMin(e.target.value)} inputMode="numeric" style={{ width: 96, minWidth: 0 }} /></th>
                {cols.map(c => <th key={c.key as string}></th>)}
                {puedeEditar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(m => (
                <tr key={m.id}>
                  <td style={{ color: 'var(--muted)' }}>{fmtFecha(m.fecha)}</td>
                  <td style={{ textAlign: 'left' }}>
                    {m.cliente ?? '—'}
                    {m.debe && <span className="tag tag-gray" style={{ marginLeft: 6, fontWeight: 600 }}>🚚 {m.debe}</span>}
                  </td>
                  <td style={{ textAlign: 'left' }}><span className={`tag ${badge(m.operacion)}`}>{m.operacion}</span></td>
                  <td className="num">{nf.format(Math.abs(m.monto))}</td>
                  {cols.map(c => {
                    const v = (m[c.key] as number) ?? 0
                    return <td key={c.key as string}>{v ? <span className={`imp ${v > 0 ? 'p' : 'n'}`}>{money(v)}</span> : <span className="zero">—</span>}</td>
                  })}
                  {puedeEditar && (
                    <td>
                      <Link href={`/dashboard/transacciones/${m.id}/editar`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-ink)' }}>✏️ Editar</Link>
                    </td>
                  )}
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={ncols} style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>Sin resultados para estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '11px 16px', color: 'var(--muted)', fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>
            {filtrados.length.toLocaleString('es-AR')}
            {filtrados.length !== movimientos.length ? ` de ${movimientos.length}` : ''} en esta página
            {' · '}{total.toLocaleString('es-AR')} movimientos en total
          </span>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button className="chip" disabled={pagina <= 1} onClick={() => navegar(pagina - 1)}
              style={{ opacity: pagina <= 1 ? 0.4 : 1, cursor: pagina <= 1 ? 'default' : 'pointer' }}>◄ Anterior</button>
            <span>página {pagina} de {totalPaginas}</span>
            <button className="chip" disabled={pagina >= totalPaginas} onClick={() => navegar(pagina + 1)}
              style={{ opacity: pagina >= totalPaginas ? 0.4 : 1, cursor: pagina >= totalPaginas ? 'default' : 'pointer' }}>Siguiente ►</button>
          </span>
        </div>
      </div>
    </div>
  )
}
