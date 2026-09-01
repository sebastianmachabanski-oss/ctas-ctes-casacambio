'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PLANILLA_ACTIVA } from '@/lib/planilla'
import FiltroClientes from './FiltroClientes'

type Mov = {
  id: string; fecha: string; cliente: string | null; operacion: string; monto: number
  tipo: string; debe: string | null; cot: number | null; notas: string | null
  creado_por: string | null; creado_at: string | null
  editado_por: string | null; editado_at: string | null
  pesos: number; cheques: number; dolares: number; euros: number; reales: number; usdt: number; banco: number
  cc_pesos: number; cc_dolares: number; cc_euros: number; cc_reales: number; cc_usdt: number
}

// Columnas de impacto por moneda (solo se muestran las presentes en el resultado).
const IMPACTOS: { key: keyof Mov; sym: string }[] = [
  { key: 'pesos', sym: '$' }, { key: 'cheques', sym: 'CH$' }, { key: 'dolares', sym: 'U$S' },
  { key: 'euros', sym: '€' }, { key: 'reales', sym: 'R$' }, { key: 'usdt', sym: 'USDT' }, { key: 'banco', sym: 'BCO' },
  { key: 'cc_pesos', sym: 'CC $' }, { key: 'cc_dolares', sym: 'CC U$S' },
  { key: 'cc_euros', sym: 'CC €' }, { key: 'cc_reales', sym: 'CC R$' },
  { key: 'cc_usdt', sym: 'CC USDT' },
]
const OPERACIONES = ['COMPRA', 'VENTA', 'INGRESAN', 'EGRESAN', 'GASTOS', 'SWITCH', 'ENTRA TT', 'SALE TT', 'SOBRANTE', 'FALTANTE', 'GANANCIA', 'SALDO INICIAL']

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const nfCot = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 })
const money = (v: number) => v < 0 ? `(${nf.format(-v)})` : nf.format(v)
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
// Totales de la cabecera: sin decimales, con el signo entre paréntesis como el resto.
const ars = (v: number) => `$ ${v < 0 ? `(${nf0.format(-v)})` : nf0.format(v)}`
const usdTot = (v: number) => `U$S ${v < 0 ? `(${nf0.format(-v)})` : nf0.format(v)}`
const fmtFecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-AR')
const num = (v: any): number => Number(v) || 0
// Filas que no cargó ningún usuario (importación inicial de datos): se muestran en gris
// y sin nombre propio. El prefijo tolera el valor histórico ya guardado en base.
const esCargaInicial = (autor: string | null) => !autor || autor.startsWith('Carga inicial')
const fmtSello = (ts: string | null) =>
  ts ? new Date(ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : ''
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

type Filtros = { cli: string; tipo: string; op: string; notas: string; autor: string; monto: string }
type Totales = { monto: number; pesos: number; dolares: number }

export default function TransaccionesView({ movimientos, puedeEditar, desde, hasta, total, pagina, totalPaginas, filtros, totales, clientes, clientesSel }: {
  movimientos: Mov[]; puedeEditar: boolean; desde: string; hasta: string
  total: number; pagina: number; totalPaginas: number; filtros: Filtros; totales: Totales
  clientes: string[]; clientesSel: string[]
}) {
  const router = useRouter()
  const [d1, setD1] = useState(desde)
  const [d2, setD2] = useState(hasta)
  // Los filtros se aplican EN EL SERVIDOR y viajan en la URL: si se filtrara la página ya
  // traída, buscar un cliente mostraría solo sus movimientos entre las 100 filas de esta
  // página y seguiría ofreciendo el resto paginado (25/8/2026).
  //
  // El estado local es solo para que el campo responda mientras se tipea; el pedido al
  // servidor sale después de una pausa, para no consultar en cada tecla.
  // El cliente ya no se filtra por texto: se eligen uno o varios de la lista.
  const [cliSel, setCliSel] = useState<string[]>(clientesSel)
  const [fOp, setFOp] = useState(filtros.op)
  const [fMin, setFMin] = useState(filtros.monto)
  const [fAutor, setFAutor] = useState(filtros.autor)
  const [fNotas, setFNotas] = useState(filtros.notas)
  const [fTipo, setFTipo] = useState(filtros.tipo)
  const [borrando, setBorrando] = useState<string | null>(null)
  const [errorBorrar, setErrorBorrar] = useState('')
  const [avisoPlanilla, setAvisoPlanilla] = useState('')

  // Borrar (solo administrador/superadmin): borrado ESPEJADO — elimina del sistema y del origen externo
  // de datos (solo si se identifica sin ambigüedad; si no, avisa para hacerlo a mano).
  async function borrar(m: Mov) {
    const desc = `${m.cliente ?? '—'} · ${m.operacion} · ${nf.format(montoPrincipal(m))}`
    const extra = PLANILLA_ACTIVA
      ? '\n\nSe elimina del sistema y también del origen externo de datos. Si el registro no se puede identificar con certeza allá, te avisamos para borrarlo a mano.'
      : ''
    if (!confirm(`¿Eliminar el movimiento?\n\n${desc}${extra}`)) return
    setBorrando(m.id); setErrorBorrar(''); setAvisoPlanilla('')
    const res = await fetch(`/api/movimientos-caja/${m.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErrorBorrar(data.error ?? `Error ${res.status}`)
      setBorrando(null)
      return
    }
    // Resultado de la limpieza espejada en el origen externo de datos.
    const AVISOS: Record<string, string> = {
      no_encontrada: 'Se borró del sistema, pero el registro no se encontró en el origen externo (¿ya lo habías borrado allá?). Verificalo para que la próxima sincronización no lo traiga de vuelta.',
      multiple: `Se borró del sistema, pero hay ${data.candidatas ?? 'varios'} registros iguales en el origen externo y no se puede elegir solo: borrá el correcto a mano.`,
      error: `Se borró del sistema, pero falló la limpieza en el origen externo: ${data.warning ?? 'error desconocido'}. Borralo a mano.`,
      deshabilitado: 'Se borró del sistema. La limpieza automática en el origen externo está deshabilitada en este entorno.',
    }
    // Sin menciones a la planilla el aviso NO se calla del todo: mientras la
    // sincronización siga corriendo, una limpieza fallida hace que el movimiento
    // reaparezca solo, y el operador tiene que poder anticiparlo. Se le dice qué esperar,
    // sin nombrar el sistema externo. 'deshabilitado' sí se omite: ahí no hay riesgo de
    // que vuelva, simplemente no se tocó nada afuera.
    const NEUTRO = 'Se borró del sistema. Verificá en unos minutos que no reaparezca en la lista; si vuelve, avisale al administrador.'
    const avisos: string[] = []
    if (data.planilla && data.planilla !== 'ok') {
      avisos.push(
        PLANILLA_ACTIVA ? (AVISOS[data.planilla] ?? '')
          : (data.planilla === 'deshabilitado' ? '' : NEUTRO)
      )
    }
    // Si la pata de cuenta corriente no se pudo borrar, el saldo del cliente queda mal.
    // Es lo más grave que puede pasar acá, así que se avisa siempre.
    if (data.aviso_cta_cte) avisos.push(data.aviso_cta_cte)
    setAvisoPlanilla(avisos.filter(Boolean).join(' '))
    setBorrando(null)
    router.refresh()
  }

  // Columnas de impacto presentes en la página cargada.
  const cols = useMemo(() => IMPACTOS.filter(c => movimientos.some(m => num(m[c.key]) !== 0)), [movimientos])

  // El servidor ya devuelve exactamente las filas pedidas: acá no se vuelve a filtrar.
  const filtrados = movimientos

  // Navegación: rango de fechas, filtros por columna y paginación, todo en la URL.
  function navegar(p: number, d1v = d1, d2v = d2, f: Partial<Filtros> = {}) {
    const actuales: Filtros = { cli: cliSel.join('|'), tipo: fTipo, op: fOp, notas: fNotas, autor: fAutor, monto: fMin, ...f }
    const params = new URLSearchParams()
    if (d1v) params.set('desde', d1v)
    if (d2v) params.set('hasta', d2v)
    for (const [k, v] of Object.entries(actuales)) if (v) params.set(k, v)
    if (p > 1) params.set('pagina', String(p))
    const qs = params.toString()
    router.replace('/dashboard/transacciones' + (qs ? '?' + qs : ''))
  }

  // Cambiar un filtro siempre vuelve a la página 1: la anterior puede no existir ya.
  const aplicarFiltro = (f: Partial<Filtros>) => navegar(1, d1, d2, f)

  // Los campos de texto esperan a que se deje de tipear antes de consultar.
  useEffect(() => {
    const cambio = fNotas !== filtros.notas || fAutor !== filtros.autor || fMin !== filtros.monto
    if (!cambio) return
    const t = setTimeout(() => aplicarFiltro({ notas: fNotas, autor: fAutor, monto: fMin }), 400)
    return () => clearTimeout(t)
  }, [fNotas, fAutor, fMin])
  const buscar = () => navegar(1)  // cambiar el rango vuelve a la página 1

  // Quita solo el rango de fechas y conserva los filtros por columna: casi siempre lo que
  // se quiere es ampliar la búsqueda del cliente ya elegido a todo el historial.
  function limpiarFechas() {
    setD1(''); setD2('')
    navegar(1, '', '')
  }

  const ncols = 8 + cols.length + (puedeEditar ? 1 : 0)
  const hayFiltro = Boolean(cliSel.length || fTipo || fOp || fNotas || fAutor || fMin)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      {/* Rango de fechas (compacto) + totales del resultado filtrado */}
      <div className="card" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="label" style={{ margin: 0, fontSize: 11 }}>Desde</label>
            <input className="input" type="date" value={d1} onChange={e => setD1(e.target.value)}
              style={{ width: 138, fontSize: 12, padding: '4px 8px' }} />
            <label className="label" style={{ margin: 0, fontSize: 11 }}>Hasta</label>
            <input className="input" type="date" value={d2} onChange={e => setD2(e.target.value)}
              style={{ width: 138, fontSize: 12, padding: '4px 8px' }} />
            <button className="btn-primary" onClick={buscar}
              style={{ fontSize: 12, padding: '5px 14px' }}>Buscar</button>
            {(d1 || d2) && (
              <button className="btn-secondary" onClick={limpiarFechas}
                title="Quitar el rango de fechas y ver todo el historial"
                style={{ fontSize: 12, padding: '5px 12px' }}>Limpiar fechas</button>
            )}
          </div>

          {/* Totales de TODO lo que coincide con los filtros, no solo de esta página. */}
          <div style={{ display: 'flex', gap: 22, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {([
              ['Total monto', nf0.format(totales.monto), 'var(--ink)'],
              ['Total imp. $', ars(Math.round(totales.pesos)), totales.pesos >= 0 ? 'var(--pos-ink)' : 'var(--neg-ink)'],
              ['Total imp. U$S', usdTot(Math.round(totales.dolares)), totales.dolares >= 0 ? 'var(--pos-ink)' : 'var(--neg-ink)'],
            ] as [string, string, string][]).map(([lbl, val, col]) => (
              <div key={lbl} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontWeight: 650 }}>{lbl}</div>
                <div className="num" style={{ fontSize: 15, fontWeight: 700, color: col }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 11 }}>
          {hayFiltro
            ? `Totales de los ${total.toLocaleString('es-AR')} movimientos que coinciden con el filtro.`
            : 'Totales de todos los movimientos del rango. Filtrá por columna abajo ↓'}
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
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0 }}>Eliminando…{PLANILLA_ACTIVA ? ' también se limpia en el origen externo' : ''}</p>
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
        <div className="tbl-wrap tbl-scroll">
          <table className="cc-tbl densa">
            <thead>
              <tr>
                <th>Fecha</th>
                <th style={{ textAlign: 'left' }}>Tipo</th>
                <th style={{ textAlign: 'left' }}>Cliente</th>
                <th style={{ textAlign: 'left' }}>Operación</th>
                <th>Cot.</th>
                <th>Monto</th>
                {/* Notas va en el mismo lugar que en la planilla: después de los datos de
                    carga y antes de las columnas calculadas. Ancho acotado y con recorte
                    para no empujar la tabla a scroll horizontal. */}
                <th style={{ textAlign: 'left' }}>Notas</th>
                {cols.map(c => <th key={c.key as string}>Imp. {c.sym}</th>)}
                <th style={{ textAlign: 'left' }} title="Quién cargó la transacción. Las operaciones anteriores a la puesta en marcha del sistema figuran como carga inicial.">Registró</th>
                {puedeEditar && <th></th>}
              </tr>
              <tr className="tx-filtros">
                <th></th>
                <th style={{ textAlign: 'left' }}>
                  <select className="srch" value={fTipo} onChange={e => { setFTipo(e.target.value); aplicarFiltro({ tipo: e.target.value }) }}
                    style={{ width: 100, minWidth: 0 }}>
                    <option value="">todo</option>
                    <option value="CAJA">CAJA</option>
                    <option value="CTA CTE">CTA CTE</option>
                  </select>
                </th>
                <th style={{ textAlign: 'left' }}>
                  <FiltroClientes
                    clientes={clientes}
                    seleccionados={cliSel}
                    onChange={sel => { setCliSel(sel); aplicarFiltro({ cli: sel.join('|') }) }}
                  />
                </th>
                <th style={{ textAlign: 'left' }}>
                  <select className="srch" value={fOp} onChange={e => { setFOp(e.target.value); aplicarFiltro({ op: e.target.value }) }} style={{ width: '100%', minWidth: 0 }}>
                    <option value="">todas</option>
                    {OPERACIONES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </th>
                <th></th>
                <th><input className="srch" placeholder="monto · &gt; &lt;" title="Un número busca ese monto exacto. Con > o < filtra por rango (ej. >1000000)" value={fMin} onChange={e => setFMin(e.target.value)} style={{ width: 110, minWidth: 0 }} /></th>
                <th style={{ textAlign: 'left' }}>
                  <input className="srch" placeholder="filtrar…" value={fNotas}
                    onChange={e => setFNotas(e.target.value)} style={{ width: 120, minWidth: 0 }} />
                </th>
                {cols.map(c => <th key={c.key as string}></th>)}
                <th style={{ textAlign: 'left' }}>
                  <input className="srch" placeholder="usuario" value={fAutor}
                    onChange={e => setFAutor(e.target.value)} style={{ width: 110, minWidth: 0 }} />
                </th>
                {puedeEditar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(m => (
                <tr key={m.id}>
                  <td style={{ color: 'var(--muted)' }}>{fmtFecha(m.fecha)}</td>
                  <td style={{ textAlign: 'left' }}>
                    <span className={`tag ${m.tipo === 'CTA CTE' ? 'tag-blue' : 'tag-gray'}`}
                      style={{ whiteSpace: 'nowrap' }}>{m.tipo}</span>
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    {m.cliente ?? '—'}
                    {m.debe && <span className="tag tag-gray" style={{ marginLeft: 6, fontWeight: 600 }}>🚚 {m.debe}</span>}
                  </td>
                  <td style={{ textAlign: 'left' }}><span className={`tag ${badge(m.operacion)}`}>{m.operacion}</span></td>
                  <td className="num" style={{ color: 'var(--muted)', fontWeight: 400 }}>{m.cot ? nfCot.format(Number(m.cot)) : <span className="zero">—</span>}</td>
                  <td className="num">{nf.format(montoPrincipal(m))}</td>
                  <td style={{ textAlign: 'left', fontSize: 12, color: 'var(--muted)' }}>
                    {m.notas
                      ? <div title={m.notas} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.notas}</div>
                      : <span className="zero">—</span>}
                  </td>
                  {cols.map(c => {
                    const v = num(m[c.key])
                    return <td key={c.key as string}>{v ? <span className={`imp ${v > 0 ? 'p' : 'n'}`}>{money(v)}</span> : <span className="zero">—</span>}</td>
                  })}
                  <td style={{ textAlign: 'left', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {esCargaInicial(m.creado_por) ? (
                      <span style={{ color: 'var(--muted)', fontStyle: 'italic' }} title="Operación anterior a la puesta en marcha del sistema: no la cargó ningún usuario.">carga inicial</span>
                    ) : (
                      <span title={`Cargó ${m.creado_por}${m.creado_at ? ` el ${fmtSello(m.creado_at)}` : ''}`}>{m.creado_por}</span>
                    )}
                    {m.editado_por && (
                      <span style={{ marginLeft: 5, cursor: 'help' }}
                        title={`Editado por ${m.editado_por}${m.editado_at ? ` el ${fmtSello(m.editado_at)}` : ''}`}>✏️</span>
                    )}
                  </td>
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
                <tr><td colSpan={ncols} style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>Sin movimientos que coincidan con el filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '11px 16px', color: 'var(--muted)', fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>
            {filtrados.length.toLocaleString('es-AR')} en esta página
            {' · '}{total.toLocaleString('es-AR')}
            {hayFiltro ? ' que coinciden con el filtro' : ' movimientos en total'}
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
