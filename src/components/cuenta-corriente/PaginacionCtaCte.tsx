import Link from 'next/link'

/**
 * Paginación de los movimientos de una cuenta corriente.
 *
 * Antes la pantalla traía la cuenta entera —7.661 movimientos en la más grande— y los
 * mandaba todos al navegador. Ahora se pagina, así que hace falta cómo moverse.
 *
 * Son enlaces y no botones: el estado vive en la URL, así se puede compartir o volver con
 * el botón "atrás" del navegador y la página se ve igual.
 */
export default function PaginacionCtaCte({
  pagina, totalPaginas, mostrados, total, params,
}: {
  pagina: number
  totalPaginas: number
  mostrados: number
  total: number
  params: { desde?: string; hasta?: string; operacion?: string; cuenta?: string }
}) {
  const url = (p: number) => {
    const qs = new URLSearchParams()
    if (params.cuenta) qs.set('cuenta', params.cuenta)
    if (params.desde) qs.set('desde', params.desde)
    if (params.hasta) qs.set('hasta', params.hasta)
    if (params.operacion) qs.set('operacion', params.operacion)
    if (p > 1) qs.set('pagina', String(p))
    const s = qs.toString()
    return '/dashboard/cuenta-corriente' + (s ? '?' + s : '')
  }

  const estilo = (activo: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8,
    border: '1px solid var(--ring)',
    color: activo ? 'var(--ink-2)' : 'var(--muted)',
    pointerEvents: activo ? 'auto' : 'none',
    opacity: activo ? 1 : .45,
    textDecoration: 'none',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 14px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        {mostrados.toLocaleString('es-AR')} de {total.toLocaleString('es-AR')} movimientos
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href={url(pagina - 1)} style={estilo(pagina > 1)}>◀ Anterior</Link>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          página {pagina} de {totalPaginas}
        </span>
        <Link href={url(pagina + 1)} style={estilo(pagina < totalPaginas)}>Siguiente ▶</Link>
      </div>
    </div>
  )
}
