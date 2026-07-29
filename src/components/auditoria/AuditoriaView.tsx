'use client'
import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'

// Registro de actividad. Los filtros (fecha / acción / usuario) viajan por la URL y se
// resuelven en el server: el log crece indefinidamente y no tiene sentido traerlo entero
// para filtrar en el browser, a diferencia de Transacciones.

type Evento = {
  id: number
  ts: string
  usuario_nombre: string
  usuario_rol: string | null
  actor: 'usuario' | 'sistema'
  accion: string
  entidad: string
  movimiento_id: string | null
  huella: string | null
  resumen: string | null
  campos: string[] | null
  datos_antes: Record<string, any> | null
  datos_despues: Record<string, any> | null
}

const ACCIONES: { v: string; label: string }[] = [
  { v: 'alta',           label: 'Alta' },
  { v: 'edicion',        label: 'Edición' },
  { v: 'borrado',        label: 'Borrado' },
  { v: 'ingreso_calle',  label: 'Ingreso de calle' },
  { v: 'login',          label: 'Ingreso al sistema' },
  { v: 'login_fallido',  label: 'Ingreso fallido' },
  { v: 'usuario',        label: 'Usuarios' },
  { v: 'config',         label: 'Configuración' },
]
const ETIQUETA: Record<string, string> = Object.fromEntries(ACCIONES.map(a => [a.v, a.label]))

// Color por acción: el borrado tiene que saltar a la vista, es lo que se va a buscar.
function badge(a: string) {
  switch (a) {
    case 'borrado':       return 'tag-red'
    case 'alta':          return 'tag-green'
    case 'edicion':       return 'tag-blue'
    case 'login_fallido': return 'tag-red'
    default:              return 'tag-gray'
  }
}

// Nombres de campo tal como se ven en la app, no como se llaman en la base.
const NOMBRE_CAMPO: Record<string, string> = {
  fecha: 'Fecha', cliente: 'Cliente', operacion: 'Operación', propio: 'Moneda',
  externo: 'Moneda externa', monto: 'Monto', cot: 'Cotización', costo_pct: 'Costo %',
  debe: 'Repartidor (DEBE)', notas: 'Notas', tipo: 'Tipo', cuenta: 'Cuenta',
}
const nfMonto = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 6 })

function valor(v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return nfMonto.format(v)
  return String(v)
}

const fmtTs = (ts: string) =>
  new Date(ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' })

export default function AuditoriaView({
  eventos, desde, hasta, accion, usuario, total, pagina, totalPaginas,
}: {
  eventos: Evento[]
  desde: string; hasta: string; accion: string; usuario: string
  total: number; pagina: number; totalPaginas: number
}) {
  const router = useRouter()
  const [d1, setD1] = useState(desde)
  const [d2, setD2] = useState(hasta)
  const [fAccion, setFAccion] = useState(accion)
  const [fUsuario, setFUsuario] = useState(usuario)
  const [abierto, setAbierto] = useState<number | null>(null)

  function navegar(p: number, v: Partial<{ d1: string; d2: string; ac: string; us: string }> = {}) {
    const params = new URLSearchParams()
    const vd1 = v.d1 ?? d1, vd2 = v.d2 ?? d2, vac = v.ac ?? fAccion, vus = v.us ?? fUsuario
    if (vd1) params.set('desde', vd1)
    if (vd2) params.set('hasta', vd2)
    if (vac) params.set('accion', vac)
    if (vus) params.set('usuario', vus)
    if (p > 1) params.set('pagina', String(p))
    const qs = params.toString()
    router.replace('/dashboard/admin/auditoria' + (qs ? '?' + qs : ''))
  }
  const buscar = () => navegar(1)   // cambiar un filtro vuelve a la página 1
  const limpiar = () => {
    setD1(''); setD2(''); setFAccion(''); setFUsuario('')
    router.replace('/dashboard/admin/auditoria')
  }

  // Campos a mostrar en el detalle: los que cambiaron (edición) o todos los de la foto
  // (alta y borrado, donde interesa el contenido completo del movimiento).
  function camposDetalle(e: Evento): string[] {
    if (e.campos?.length) return e.campos
    const fuente = e.datos_despues ?? e.datos_antes ?? {}
    return Object.keys(fuente)
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div><label className="label">Desde</label><input className="input" type="date" value={d1} onChange={e => setD1(e.target.value)} /></div>
          <div><label className="label">Hasta</label><input className="input" type="date" value={d2} onChange={e => setD2(e.target.value)} /></div>
          <div>
            <label className="label">Acción</label>
            <select className="input" value={fAccion} onChange={e => { setFAccion(e.target.value); navegar(1, { ac: e.target.value }) }}>
              <option value="">Todas</option>
              {ACCIONES.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Usuario</label>
            <input className="input" placeholder="nombre" value={fUsuario}
              onChange={e => setFUsuario(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') buscar() }} />
          </div>
          <button className="btn-primary" onClick={buscar}>Buscar</button>
          {(d1 || d2 || fAccion || fUsuario) && (
            <button className="chip" onClick={limpiar}>Limpiar</button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="card-t">Registro de actividad</div>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            Registro inmutable: los eventos no se pueden modificar ni borrar.
          </span>
        </div>
        <div className="tbl-wrap">
          <table className="cc-tbl">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Fecha y hora</th>
                <th style={{ textAlign: 'left' }}>Usuario</th>
                <th style={{ textAlign: 'left' }}>Acción</th>
                <th style={{ textAlign: 'left' }}>Detalle</th>
                <th style={{ textAlign: 'left' }}>Cambios</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {eventos.map(e => {
                const expandible = !!(e.datos_antes || e.datos_despues)
                const abiertoAca = abierto === e.id
                return (
                  <Fragment key={e.id}>
                  <tr style={abiertoAca ? { background: 'var(--wash)' } : undefined}>
                    <td style={{ textAlign: 'left', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtTs(e.ts)}</td>
                    <td style={{ textAlign: 'left' }}>
                      {e.actor === 'sistema'
                        ? <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{e.usuario_nombre}</span>
                        : <>{e.usuario_nombre}{e.usuario_rol && <span className="tag tag-gray" style={{ marginLeft: 6 }}>{e.usuario_rol}</span>}</>}
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <span className={`tag ${badge(e.accion)}`}>{ETIQUETA[e.accion] ?? e.accion}</span>
                    </td>
                    <td style={{ textAlign: 'left', whiteSpace: 'normal', maxWidth: 380 }}>
                      {e.resumen ?? <span className="zero">—</span>}
                    </td>
                    <td style={{ textAlign: 'left', whiteSpace: 'normal', maxWidth: 220, fontSize: 12, color: 'var(--muted)' }}>
                      {e.campos?.length
                        ? e.campos.map(c => NOMBRE_CAMPO[c] ?? c).join(', ')
                        : <span className="zero">—</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {expandible && (
                        <button onClick={() => setAbierto(abiertoAca ? null : e.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--brand-ink)' }}>
                          {abiertoAca ? 'Ocultar' : 'Ver detalle'}
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Detalle: el antes y el después, campo por campo, JUSTO debajo del evento. */}
                  {abiertoAca && (
                  <tr>
                    <td colSpan={6} style={{ background: 'var(--wash)', padding: '4px 16px 16px' }}>
                    <div style={{ fontSize: 12.5 }}>
                      {e.accion === 'borrado' && (
                        <div className="banner banner-warn" style={{ marginBottom: 10 }}>
                          ⚠️ Movimiento eliminado. Este es el contenido que tenía — alcanza para volver a cargarlo.
                        </div>
                      )}
                      <table className="cc-tbl" style={{ background: 'var(--card)', borderRadius: 8 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left' }}>Campo</th>
                            <th style={{ textAlign: 'left' }}>Antes</th>
                            <th style={{ textAlign: 'left' }}>Después</th>
                          </tr>
                        </thead>
                        <tbody>
                          {camposDetalle(e).map(c => {
                            const a = e.datos_antes?.[c]
                            const d = e.datos_despues?.[c]
                            const cambio = e.campos?.includes(c)
                            return (
                              <tr key={c}>
                                <td style={{ textAlign: 'left' }}>{NOMBRE_CAMPO[c] ?? c}</td>
                                <td style={{ textAlign: 'left', color: cambio ? 'var(--neg-ink)' : 'var(--muted)' }}>
                                  {e.datos_antes ? valor(a) : <span className="zero">—</span>}
                                </td>
                                <td style={{ textAlign: 'left', fontWeight: cambio ? 600 : 400 }}>
                                  {e.datos_despues ? valor(d) : <span className="zero">—</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    </td>
                  </tr>
                  )}
                  </Fragment>
                )
              })}

              {eventos.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
                  {total === 0 && !desde && !hasta && !accion && !usuario
                    ? 'Todavía no hay actividad registrada. Se registra desde ahora en adelante: altas, ediciones, borrados e ingresos de calle hechos en la app.'
                    : 'Sin resultados para estos filtros.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '11px 16px', color: 'var(--muted)', fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{total.toLocaleString('es-AR')} evento{total === 1 ? '' : 's'}</span>
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
