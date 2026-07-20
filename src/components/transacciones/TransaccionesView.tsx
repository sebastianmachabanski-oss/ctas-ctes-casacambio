'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Mov = {
  id: string; fecha: string; cliente: string | null; operacion: string; monto: number
  tipo: string; debe: string | null; cot: number | null
  pesos: number; cheques: number; dolares: number; euros: number; reales: number; usdt: number; banco: number
  cc_pesos: number; cc_dolares: number; cc_euros: number; cc_reales: number
}

// Columnas de impacto por moneda (solo se muestran las presentes en el resultado).
const IMPACTOS: { key: keyof Mov; sym: string }[] = [
  { key: 'pesos', sym: '$' }, { key: 'cheques', sym: 'CH$' }, { key: 'dolares', sym: 'U$S' },
  { key: 'euros', sym: '€' }, { key: 'reales', sym: 'R$' }, { key: 'usdt', sym: 'USDT' }, { key: 'banco', sym: 'BCO' },
  { key: 'cc_pesos', sym: 'CC $' }, { key: 'cc_dolares', sym: 'CC U$S' },
  { key: 'cc_euros', sym: 'CC €' }, { key: 'cc_reales', sym: 'CC R$' },
]
const OPERACIONES = ['COMPRA', 'VENTA', 'INGRESAN', 'EGRESAN', 'GASTOS', 'SWITCH', 'ENTRA TT', 'SALE TT', 'SOBRANTE', 'FALTANTE', 'GANANCIA', 'SALDO INICIAL']

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const nfCot = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 })
const money = (v: number) => v < 0 ? `(${nf.format(-v)})` : nf.format(v)
const fmtFecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-AR')
const num = (v: any): number => Number(v) || 0
// "Monto" del movimiento = magnitud del impacto principal (el número grande que se ve en
// las columnas de moneda), no el campo `monto` de la operación. Es lo que muestra el mockup
// y sobre lo que operan las comparaciones (>, <) del filtro de monto.
const montoPrincipal = (m: Mov): number => Math.max(0, ...IMPACTOS.map(c => Math.abs(num(m[c.key]))))
// Número en formato argentino: "1.000.000" → 1000000; "2.000,50" → 2000.5
function parseNumAr(s: string): number | null {
  const limpio = s.replace(/[^\d.,]/g, '')
  if (!limpio) return null
  const norm = limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(/\./g, '')
  const n = Number(norm)
  return isFinite(n) ? n : null
}
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
  const [borrando, setBorrando] = useState<string | null>(null)
  const [errorBorrar, setErrorBorrar] = useState('')
  const [avisoPlanilla, setAvisoPlanilla] = useState('')

  // Borrar (solo superusuario): borrado ESPEJADO — elimina del sistema y limpia la fila
  // en la planilla (solo si se identifica sin ambigüedad; si no, avisa para hacerlo a mano).
  async function borrar(m: Mov) {
    const desc = `${m.cliente ?? '—'} · ${m.operacion} · ${nf.format(montoPrincipal(m))}`
    if (!confirm(`¿Eliminar el movimiento?\n\n${desc}\n\nSe elimina del sistema y se limpia la fila correspondiente en la planilla. Si la fila no se puede identificar con certeza, te avisamos para borrarla a mano.`)) return
    setBorrando(m.id); setErrorBorrar(''); setAvisoPlanilla('')
    const res = await fetch(`/api/movimientos-caja/${m.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErrorBorrar(data.error ?? `Error ${res.status}`)
      setBorrando(null)
      return
    }
    // Resultado de la limpieza espejada en la planilla.
    const AVISOS: Record<string, string> = {
      no_encontrada: 'Se borró del sistema, pero la fila no se encontró en la planilla (¿ya la habías borrado allá?). Verificalo para que el próximo sync no lo traiga de vuelta.',
      multiple: `Se borró del sistema, pero hay ${data.candidatas ?? 'varias'} filas iguales en la planilla y no se puede elegir sola: borrá la correcta a mano.`,
      error: `Se borró del sistema, pero falló la limpieza en la planilla: ${data.warning ?? 'error desconocido'}. Borrala a mano.`,
      deshabilitado: 'Se borró del sistema. La limpieza automática de la planilla está deshabilitada en este entorno (WRITE_SOURCE).',
    }
    if (data.planilla && data.planilla !== 'ok') setAvisoPlanilla(AVISOS[data.planilla] ?? '')
    setBorrando(null)
    router.refresh()
  }

  // Columnas de impacto presentes en la página cargada.
  const cols = useMemo(() => IMPACTOS.filter(c => movimientos.some(m => num(m[c.key]) !== 0)), [movimientos])

  // Filtros por columna: refinan (en vivo) las filas de la página, como el mockup.
  // Monto: un número solo busca ESE monto exacto (en el importe de la operación o en
  // cualquier impacto); con operador (>, >=, <, <=) compara contra la magnitud del movimiento.
  const filtrados = useMemo(() => {
    const qc = fCli.trim().toUpperCase()

    const s = fMin.trim()
    const op = s.match(/^(>=|<=|>|<|=)/)?.[1] ?? '='
    const val = parseNumAr(s.replace(/^(>=|<=|>|<|=)\s*/, ''))
    const filtroMonto = (m: Mov): boolean => {
      if (!s || val === null) return true
      const mp = montoPrincipal(m)
      switch (op) {
        case '>':  return mp > val
        case '>=': return mp >= val
        case '<':  return mp < val
        case '<=': return mp <= val
        default: {
          const valores = [Math.abs(num(m.monto)), ...IMPACTOS.map(c => Math.abs(num(m[c.key])))]
          return valores.some(v => Math.abs(v - val) < 0.005)
        }
      }
    }

    return movimientos.filter(m =>
      (m.cliente ?? '').toUpperCase().includes(qc) &&
      (!fOp || m.operacion === fOp) &&
      filtroMonto(m))
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

  const ncols = 5 + cols.length + (puedeEditar ? 1 : 0)

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

      {/* Loader del borrado: la limpieza espejada en la planilla tarda unos segundos */}
      {borrando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,.65)', backdropFilter: 'blur(2px)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ padding: '22px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <svg className="animate-spin" style={{ width: 30, height: 30, color: 'var(--brand)' }} viewBox="0 0 24 24" fill="none">
              <circle style={{ opacity: 0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0 }}>Eliminando… también se limpia la fila en la planilla</p>
          </div>
        </div>
      )}

      {errorBorrar && (
        <div className="banner" style={{ background: 'var(--neg-bg)', border: '1px solid rgba(220,38,38,.3)', color: 'var(--neg-ink)' }}>
          No se pudo eliminar: {errorBorrar}
        </div>
      )}
      {avisoPlanilla && (
        <div className="banner-warn">⚠️ {avisoPlanilla}</div>
      )}

      {/* Tabla con filtros por columna */}
      <div className="card">
        <div className="tbl-wrap">
          <table className="cc-tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th style={{ textAlign: 'left' }}>Cliente</th>
                <th style={{ textAlign: 'left' }}>Operación</th>
                <th>Cot.</th>
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
                <th></th>
                <th><input className="srch" placeholder="monto · &gt; &lt;" title="Un número busca ese monto exacto. Con > o < filtra por rango (ej. >1000000)" value={fMin} onChange={e => setFMin(e.target.value)} style={{ width: 110, minWidth: 0 }} /></th>
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
                  <td className="num" style={{ color: 'var(--muted)', fontWeight: 400 }}>{m.cot ? nfCot.format(Number(m.cot)) : <span className="zero">—</span>}</td>
                  <td className="num">{nf.format(montoPrincipal(m))}</td>
                  {cols.map(c => {
                    const v = num(m[c.key])
                    return <td key={c.key as string}>{v ? <span className={`imp ${v > 0 ? 'p' : 'n'}`}>{money(v)}</span> : <span className="zero">—</span>}</td>
                  })}
                  {puedeEditar && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/dashboard/transacciones/${m.id}/editar`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-ink)' }}>✏️ Editar</Link>
                      <button onClick={() => borrar(m)} disabled={borrando === m.id}
                        title="Eliminar movimiento"
                        style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--neg-ink)', opacity: borrando === m.id ? 0.5 : 1 }}>
                        🗑️ {borrando === m.id ? '…' : 'Borrar'}
                      </button>
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
