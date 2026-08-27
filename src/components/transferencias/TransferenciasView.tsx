'use client'
import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

export type Fila = {
  id: string; fecha: string; fila_sheet: number | null
  cliente: string | null; cuenta: string | null
  operacion: string | null; operacion_externa: string | null
  propio: string | null; externo: string | null
  monto: number | null; cot: number | null; costo_pct: number | null
  notas: string | null
  pesos: number | null; cheques: number | null; dolares: number | null
  euros: number | null; reales: number | null
}

type Filtros = { desde: string; hasta: string; cliente: string; caja: string; q: string }

const MONEDAS = [
  { key: 'pesos'   as const, label: 'Pesos',   sym: '$'   },
  { key: 'cheques' as const, label: 'Cheques', sym: 'CH$' },
  { key: 'dolares' as const, label: 'Dólares', sym: 'U$S' },
  { key: 'euros'   as const, label: 'Euros',   sym: '€'   },
  { key: 'reales'  as const, label: 'Reales',  sym: 'R$'  },
]

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 })
const money = (v: number) => (v < 0 ? `(${nf.format(-v)})` : nf.format(v))
const fecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR')

// Las filas sin NOTAS caen todas juntas acá: en la planilla eran el grupo "(en blanco)".
const SIN_NOTA = '(sin nota)'

export default function TransferenciasView({ filas, clientes, cajas, filtros, hayDatos }: {
  filas: Fila[]; clientes: string[]; cajas: string[]; filtros: Filtros; hayDatos: boolean
}) {
  const router = useRouter()
  const [f, setF] = useState<Filtros>(filtros)
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())

  function aplicar(next: Partial<Filtros>) {
    const v = { ...f, ...next }
    setF(v)
    const qs = new URLSearchParams()
    for (const [k, val] of Object.entries(v)) if (val) qs.set(k, val)
    const s = qs.toString()
    router.push('/dashboard/transferencias' + (s ? '?' + s : ''))
  }

  function limpiar() {
    setF({ desde: '', hasta: '', cliente: '', caja: '', q: '' })
    router.push('/dashboard/transferencias')
  }

  // El corazón del reporte: agrupar por NOTAS y subtotalizar, igual que la tabla
  // dinámica original (docs/GUIA-MIGRACION-SHEETS.md, punto 4.5).
  const grupos = useMemo(() => {
    const m = new Map<string, { nota: string; filas: Fila[]; tot: Record<string, number> }>()
    for (const fila of filas) {
      const nota = (fila.notas ?? '').trim() || SIN_NOTA
      let g = m.get(nota)
      if (!g) {
        g = { nota, filas: [], tot: Object.fromEntries(MONEDAS.map(x => [x.key, 0])) }
        m.set(nota, g)
      }
      g.filas.push(fila)
      for (const mo of MONEDAS) g.tot[mo.key] += Number(fila[mo.key]) || 0
    }
    // Los grupos con más movimiento primero; el bolsón sin nota siempre al final.
    return Array.from(m.values()).sort((a, b) => {
      if (a.nota === SIN_NOTA) return 1
      if (b.nota === SIN_NOTA) return -1
      return b.filas.length - a.filas.length || a.nota.localeCompare(b.nota, 'es')
    })
  }, [filas])

  const totalGeneral = useMemo(() => {
    const t = Object.fromEntries(MONEDAS.map(x => [x.key, 0])) as Record<string, number>
    for (const fila of filas) for (const mo of MONEDAS) t[mo.key] += Number(fila[mo.key]) || 0
    return t
  }, [filas])

  // Solo se muestran las columnas de moneda que alguna transferencia mueve: con las cinco
  // siempre visibles, la mitad de la tabla son guiones.
  const columnas = useMemo(() => {
    const activas = MONEDAS.filter(mo => filas.some(x => Number(x[mo.key]) !== 0))
    return activas.length ? activas : MONEDAS.slice(0, 3)
  }, [filas])

  function alternar(nota: string) {
    setCerrados(prev => {
      const s = new Set(prev)
      s.has(nota) ? s.delete(nota) : s.add(nota)
      return s
    })
  }

  const anchoDetalle = 5 // fecha, nro, operación, op. externa, cot/costo

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="card p-4 md:p-5">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Campo label="Desde">
            <input type="date" className="srch" value={f.desde}
              onChange={e => aplicar({ desde: e.target.value })} style={{ width: 140 }} />
          </Campo>
          <Campo label="Hasta">
            <input type="date" className="srch" value={f.hasta}
              onChange={e => aplicar({ hasta: e.target.value })} style={{ width: 140 }} />
          </Campo>
          <Campo label="Cliente">
            <select className="srch" value={f.cliente} onChange={e => aplicar({ cliente: e.target.value })}
              style={{ minWidth: 150 }}>
              <option value="">Todos</option>
              {clientes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo label="Caja">
            <select className="srch" value={f.caja} onChange={e => aplicar({ caja: e.target.value })}
              style={{ minWidth: 140 }}>
              <option value="">Todas</option>
              {cajas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo label="Participantes (notas)">
            <input className="srch" value={f.q} placeholder="ej: BOH"
              onChange={e => setF(v => ({ ...v, q: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') aplicar({ q: f.q }) }}
              onBlur={() => { if (f.q !== filtros.q) aplicar({ q: f.q }) }}
              style={{ minWidth: 150 }} />
          </Campo>
          {(f.desde || f.hasta || f.cliente || f.caja || f.q) && (
            <button className="chip" onClick={limpiar}>Limpiar filtros</button>
          )}
        </div>
      </div>

      {!hayDatos ? (
        <div className="card p-6" style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink-2)' }}>Todavía no hay transferencias cargadas.</p>
          <p style={{ margin: '8px 0 0' }}>
            Las transferencias son los movimientos con <b>Op = T</b>. Si ya las venís cargando
            en la planilla, hace falta correr una sincronización completa para que lleguen acá.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">
              Transferencias por participantes
            </h2>
            <span className="text-sm text-gray-500">
              {grupos.length} grupo{grupos.length !== 1 ? 's' : ''} · {filas.length} movimiento{filas.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filas.length === 0 ? (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">
              No hay transferencias para los filtros seleccionados
            </div>
          ) : (
            <div className="tbl-scroll">
              <table className="cc-tbl densa">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Fecha</th>
                    <th style={{ textAlign: 'left' }}>Nro</th>
                    <th style={{ textAlign: 'left' }}>Operación</th>
                    <th style={{ textAlign: 'left' }}>Op. externa</th>
                    <th style={{ textAlign: 'left' }}>Cot · Costo %</th>
                    {columnas.map(c => <th key={c.key}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(g => {
                    const cerrado = cerrados.has(g.nota)
                    return (
                      <Fragment key={g.nota}>
                        {/* Encabezado del grupo: es el subtotal "Total BOH - GRA" de la
                            planilla, pero arriba y plegable, que en pantalla se lee mejor. */}
                        <tr className="grupo-tt">
                          <td colSpan={anchoDetalle} style={{ textAlign: 'left' }}>
                            <button onClick={() => alternar(g.nota)} className="grupo-tt-btn">
                              <span aria-hidden style={{ display: 'inline-block', width: 12 }}>
                                {cerrado ? '▸' : '▾'}
                              </span>
                              {g.nota}
                              <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>
                                ({g.filas.length})
                              </span>
                            </button>
                          </td>
                          {columnas.map(c => {
                            const v = g.tot[c.key]
                            return (
                              <td key={c.key} className={`num ${v < 0 ? 'neg' : ''}`} style={{ fontWeight: 700 }}>
                                {v === 0 ? '—' : `${c.sym} ${money(v)}`}
                              </td>
                            )
                          })}
                        </tr>

                        {!cerrado && g.filas.map(x => (
                          <tr key={x.id}>
                            <td style={{ color: 'var(--muted)', fontWeight: 400 }}>{fecha(x.fecha)}</td>
                            <td style={{ color: 'var(--muted)', fontWeight: 400 }}>{x.fila_sheet ?? '—'}</td>
                            <td style={{ textAlign: 'left' }}>{x.operacion ?? '—'}</td>
                            <td style={{ textAlign: 'left', color: 'var(--ink-2)', fontWeight: 400 }}>
                              {x.operacion_externa ?? '—'}
                            </td>
                            <td style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>
                              {x.cot ? nf.format(Number(x.cot)) : '—'}
                              {x.costo_pct ? ` · ${nf.format(Number(x.costo_pct))}%` : ''}
                            </td>
                            {columnas.map(c => {
                              const v = Number(x[c.key]) || 0
                              if (!v) return <td key={c.key} className="zero">—</td>
                              return (
                                <td key={c.key} className={`num ${v < 0 ? 'neg' : ''}`}>
                                  {c.sym} {money(v)}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={anchoDetalle} style={{ textAlign: 'left', fontWeight: 700 }}>Total general</td>
                    {columnas.map(c => {
                      const v = totalGeneral[c.key]
                      return (
                        <td key={c.key} className={`num ${v < 0 ? 'neg' : ''}`} style={{ fontWeight: 700 }}>
                          {v === 0 ? '—' : `${c.sym} ${money(v)}`}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        .grupo-tt td { background: var(--soft, #f1f5f9); border-top: 1px solid var(--ring); }
        .grupo-tt-btn {
          display: inline-flex; align-items: center; gap: 6px;
          font: inherit; font-weight: 700; color: var(--ink-2);
          background: none; border: 0; padding: 0; cursor: pointer;
        }
        .cc-tbl tfoot td { border-top: 2px solid var(--ring); }
      `}</style>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}
