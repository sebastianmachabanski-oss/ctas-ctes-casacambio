import Link from 'next/link'

/**
 * Las tres vistas de Ganancias, siempre a la vista.
 *
 * Contestan preguntas distintas y conviene que se note cuáles existen: con un chip
 * suelto en cada pantalla, la tercera no se descubre nunca.
 *
 *   Por moneda    cuánto gané — el detalle del cálculo, una moneda por vez
 *   De dónde sale de qué está hecho el resultado de este período, todas las monedas
 *   Tablero       cómo viene — trece meses y la comparación
 *
 * Es un componente de servidor a propósito: recibe el query armado en vez de leerlo con
 * `useSearchParams`, que obligaría a envolverlo en Suspense en cada pantalla.
 */

export type VistaGanancias = 'moneda' | 'composicion' | 'tablero'

const VISTAS: [VistaGanancias, string, string][] = [
  ['moneda', '/dashboard/ganancias', 'Por moneda'],
  ['composicion', '/dashboard/ganancias/composicion', 'De dónde sale'],
  ['tablero', '/dashboard/ganancias/tablero', 'Tablero'],
]

export default function NavGanancias({ actual, qs = '' }: {
  actual: VistaGanancias
  /** Query string a arrastrar (sin el '?'), para no perder el período al cambiar de vista. */
  qs?: string
}) {
  return (
    <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label="Vistas de Ganancias">
      {VISTAS.map(([id, href, label]) => (
        id === actual ? (
          <span key={id} className="chip on" aria-current="page">{label}</span>
        ) : (
          <Link key={id} href={qs ? `${href}?${qs}` : href} className="chip">{label}</Link>
        )
      ))}
    </nav>
  )
}
