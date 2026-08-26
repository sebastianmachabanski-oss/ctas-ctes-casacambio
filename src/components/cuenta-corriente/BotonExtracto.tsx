import Link from 'next/link'

/**
 * Abre el extracto imprimible de la cuenta que se está mirando, con los mismos filtros.
 *
 * Va a una pestaña nueva: la pantalla queda como estaba, y cerrando el extracto se
 * vuelve a lo que se estaba haciendo sin perder los filtros ni la página.
 *
 * No lleva `pagina`: el extracto imprime el período completo, no la página en pantalla.
 */
export default function BotonExtracto({ params }: {
  params: { cuenta: string; desde?: string; hasta?: string; operacion?: string }
}) {
  const qs = new URLSearchParams({ cuenta: params.cuenta })
  if (params.desde) qs.set('desde', params.desde)
  if (params.hasta) qs.set('hasta', params.hasta)
  if (params.operacion) qs.set('operacion', params.operacion)

  return (
    <Link
      href={`/extracto/cuenta-corriente?${qs}`}
      target="_blank"
      rel="noopener"
      title="Abre una vista para imprimir o guardar como PDF"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
        border: '1px solid var(--ring)', color: 'var(--ink-2)', textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden>🖨️</span> Exportar a PDF
    </Link>
  )
}
