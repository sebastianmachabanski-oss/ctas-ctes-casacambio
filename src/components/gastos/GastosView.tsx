'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Gasto = {
  id: string; fecha: string
  cliente: string | null; notas: string | null
  monto: number | null; pesos: number | null
  debe: string | null; creado_por: string | null
}
type Filtros = { desde: string; hasta: string; q: string }

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 })
const fecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR')

// El motor guarda GASTOS con signo negativo: es plata que SALE de la caja. En un listado
// de gastos mostrar todo entre paréntesis y en rojo no aporta nada —ya se sabe que son
// salidas—, así que se muestran en positivo y el total se llama "Total gastado".
const importe = (v: number | null) => nf.format(Math.abs(Number(v) || 0))

export default function GastosView({
  filas, total, totalPesos, conDebe, pagina, totalPaginas, filtros,
}: {
  filas: Gasto[]; total: number; totalPesos: number; conDebe: number
  pagina: number; totalPaginas: number; filtros: Filtros
}) {
  const router = useRouter()
  const [f, setF] = useState<Filtros>(filtros)

  function url(next: Partial<Filtros & { pagina: number }>) {
    const v = { ...f, pagina: 1, ...next }
    const qs = new URLSearchParams()
    if (v.desde) qs.set('desde', v.desde)
    if (v.hasta) qs.set('hasta', v.hasta)
    if (v.q) qs.set('q', v.q)
    if (v.pagina > 1) qs.set('pagina', String(v.pagina))
    const s = qs.toString()
    return '/dashboard/gastos' + (s ? '?' + s : '')
  }

  function aplicar(next: Partial<Filtros>) {
    setF(v => ({ ...v, ...next }))
    router.push(url(next))
  }

  const hayFiltros = !!(f.desde || f.hasta || f.q)

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="card p-4 md:p-5">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Campo label="Desde">
            <input type="date" className="srch" value={f.desde} aria-label="Desde"
              onChange={e => aplicar({ desde: e.target.value })} style={{ width: 140 }} />
          </Campo>
          <Campo label="Hasta">
            <input type="date" className="srch" value={f.hasta} aria-label="Hasta"
              onChange={e => aplicar({ hasta: e.target.value })} style={{ width: 140 }} />
          </Campo>
          <Campo label="Concepto">
            <input className="srch" value={f.q} placeholder="buscar…" aria-label="Buscar concepto"
              onChange={e => setF(v => ({ ...v, q: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') aplicar({ q: f.q }) }}
              onBlur={() => { if (f.q !== filtros.q) aplicar({ q: f.q }) }}
              style={{ minWidth: 170 }} />
          </Campo>
          {hayFiltros && (
            <button className="chip" onClick={() => { setF({ desde: '', hasta: '', q: '' }); router.push('/dashboard/gastos') }}>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* El total responde a los filtros, no a la página que se está viendo. */}
      <div className="saldos">
        <div className="saldo-card" style={{ borderLeft: '3px solid #dc2626' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dot" style={{ background: '#dc2626' }} /><span className="cur">Total gastado</span>
          </div>
          <div className="val num">$ {nf.format(Math.abs(totalPesos))}</div>
          <div className="nota">{hayFiltros ? 'del período filtrado' : 'de todos los gastos registrados'}</div>
        </div>
        <div className="saldo-card" style={{ borderLeft: '3px solid #8a94a6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dot" style={{ background: '#8a94a6' }} /><span className="cur">Cantidad</span>
          </div>
          <div className="val num">{total.toLocaleString('es-AR')}</div>
          <div className="nota">
            {total === 1 ? 'gasto registrado' : 'gastos registrados'}
            {conDebe > 0 ? ` · ${conDebe} con repartidor` : ''}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900">Gastos</h2>
          <span className="text-sm text-gray-500">
            GASTOS solo existe en pesos
          </span>
        </div>

        {filas.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            No hay gastos para los filtros seleccionados
          </div>
        ) : (
          <>
            <div className="tbl-scroll">
              <table className="cc-tbl densa">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Fecha</th>
                    <th style={{ textAlign: 'left' }}>Concepto</th>
                    <th style={{ textAlign: 'left' }}>Notas</th>
                    <th style={{ textAlign: 'left' }}>Repartidor</th>
                    <th style={{ textAlign: 'left' }}>Cargado por</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(g => (
                    <tr key={g.id}>
                      <td style={{ color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>{fecha(g.fecha)}</td>
                      <td style={{ textAlign: 'left' }}>{g.cliente || '—'}</td>
                      <td style={{ textAlign: 'left', color: 'var(--ink-2)', fontWeight: 400 }}>{g.notas || '—'}</td>
                      <td style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 400 }}>{g.debe || '—'}</td>
                      <td style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>{g.creado_por || '—'}</td>
                      <td className="num">$ {importe(g.pesos ?? g.monto)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'left', fontWeight: 700 }}>
                      Total gastado{hayFiltros ? ' del período' : ''}
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>$ {nf.format(Math.abs(totalPesos))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {filas.length.toLocaleString('es-AR')} de {total.toLocaleString('es-AR')} gastos
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Paso href={url({ pagina: pagina - 1 })} activo={pagina > 1}>◀ Anterior</Paso>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>página {pagina} de {totalPaginas}</span>
                  <Paso href={url({ pagina: pagina + 1 })} activo={pagina < totalPaginas}>Siguiente ▶</Paso>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx global>{`
        .cc-tbl tfoot td { border-top: 2px solid var(--ring); }
      `}</style>
    </div>
  )
}

function Paso({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} style={{
      fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8,
      border: '1px solid var(--ring)',
      color: activo ? 'var(--ink-2)' : 'var(--muted)',
      pointerEvents: activo ? 'auto' : 'none',
      opacity: activo ? 1 : .45,
      textDecoration: 'none',
    }}>{children}</Link>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)' }}>
        {label}
      </span>
      {children}
    </div>
  )
}
