'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SelectorPeriodo from '@/components/SelectorPeriodo'

type Gasto = {
  id: string; fecha: string
  cliente: string | null; notas: string | null
  monto: number | null; pesos: number | null
  debe: string | null; creado_por: string | null
}

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 })
const fecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR')

// El motor guarda GASTOS con signo negativo: es plata que SALE de la caja. En un listado
// de gastos mostrar todo entre paréntesis y en rojo no aporta nada —ya se sabe que son
// salidas—, así que se muestran en positivo y el total se llama "Total gastado".
const importe = (v: number | null) => nf.format(Math.abs(Number(v) || 0))

export default function GastosView({
  filas, total, totalPesos, conDebe, pagina, totalPaginas,
  periodo, fecha: cursor, rDesde, rHasta, hoy, q,
}: {
  filas: Gasto[]; total: number; totalPesos: number; conDebe: number
  pagina: number; totalPaginas: number
  periodo: string; fecha: string; rDesde: string; rHasta: string; hoy: string; q: string
}) {
  const router = useRouter()
  const [busca, setBusca] = useState(q)

  // Los filtros de período viven en la URL; la búsqueda por concepto viaja con ellos para
  // que cambiar de mes no la borre.
  const params = (extra: Record<string, string | number>) => {
    const qs = new URLSearchParams()
    if (rDesde && rHasta) { qs.set('desde', rDesde); qs.set('hasta', rHasta) }
    else { qs.set('p', periodo); qs.set('fecha', cursor) }
    for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, String(v))
    return '/dashboard/gastos?' + qs.toString()
  }

  function buscar(valor: string) {
    setBusca(valor)
    router.push(params({ q: valor }))
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="card p-4 md:p-5" style={{ display: 'grid', gap: 12 }}>
        <SelectorPeriodo
          ruta="/dashboard/gastos"
          periodo={periodo}
          fecha={cursor}
          rDesde={rDesde}
          rHasta={rHasta}
          hoy={hoy}
          extra={busca ? { q: busca } : undefined}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="srch" value={busca} placeholder="Buscar concepto…" aria-label="Buscar concepto"
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') buscar(busca) }}
            onBlur={() => { if (busca !== q) buscar(busca) }}
            style={{ minWidth: 200 }} />
          {q && <button className="chip" onClick={() => buscar('')}>Quitar búsqueda</button>}
        </div>
      </div>

      {/* Los totales responden al período elegido, no a la página que se está viendo. */}
      <div className="saldos">
        <div className="saldo-card" style={{ borderLeft: '3px solid #dc2626' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dot" style={{ background: '#dc2626' }} /><span className="cur">Total gastado</span>
          </div>
          <div className="val num">$ {nf.format(Math.abs(totalPesos))}</div>
          <div className="nota">{q ? 'del período, con la búsqueda aplicada' : 'del período elegido'}</div>
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
          <span className="text-sm text-gray-500">GASTOS solo existe en pesos</span>
        </div>

        {filas.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            No hay gastos en el período elegido
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
                    <td colSpan={5} style={{ textAlign: 'left', fontWeight: 700 }}>Total gastado del período</td>
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
                  <Paso href={params({ q: busca, pagina: pagina - 1 })} activo={pagina > 1}>◀ Anterior</Paso>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>página {pagina} de {totalPaginas}</span>
                  <Paso href={params({ q: busca, pagina: pagina + 1 })} activo={pagina < totalPaginas}>Siguiente ▶</Paso>
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
