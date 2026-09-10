'use client'
import { useEffect, useState } from 'react'

/**
 * Cotizaciones de referencia, de una fuente EXTERNA (dolarapi). No salen de los datos del
 * sistema y por eso van siempre rotuladas como tales: confundirlas con las cotizaciones
 * con las que opera la casa sería un error caro.
 *
 * Desde el 10/9/2026 vive en la barra superior, a la derecha del título, y no en el cuerpo
 * de Inicio. Ocupaba dos renglones y un ancho completo justo arriba del listado de
 * transacciones, que quedaba empujado más allá de la mitad de la pantalla. Arriba ocupa
 * espacio que ya estaba vacío.
 *
 * Si no hay red muestra valores de ejemplo, avisando que lo son: una banda vacía dejaría
 * un hueco sin explicación.
 */

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

export default function BandaMercado() {
  const FB: [string, number, number][] = [['Dólar Blue', 1490, 1510], ['Dólar Oficial', 1435, 1475], ['USDT', 1500, 1525], ['Euro', 1610, 1660], ['Real', 255, 265]]
  const [items, setItems] = useState<[string, number, number][]>(FB)
  const [src, setSrc] = useState('cargando…')
  const [live, setLive] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const signal = AbortSignal.timeout(5000)
        const [ds, cs] = await Promise.all([
          fetch('https://dolarapi.com/v1/dolares', { signal }).then(r => r.json()),
          fetch('https://dolarapi.com/v1/cotizaciones', { signal }).then(r => r.json()),
        ])
        const g = (a: any[], p: (x: any) => boolean, n: string): [string, number, number] | null => {
          const x = Array.isArray(a) ? a.find(p) : null
          return x ? [n, Math.round(+x.compra), Math.round(+x.venta)] : null
        }
        const its = [
          g(ds, d => d.casa === 'blue', 'Blue'),
          g(ds, d => d.casa === 'oficial', 'Oficial'),
          // dolarapi expone el dólar cripto (casa: 'cripto'), que es la cotización de USDT.
          g(ds, d => d.casa === 'cripto', 'USDT'),
          g(cs, c => c.moneda === 'EUR', 'Euro'),
          g(cs, c => c.moneda === 'BRL', 'Real'),
        ].filter(Boolean) as [string, number, number][]
        if (!its.length) throw new Error('sin datos')
        if (cancel) return
        const h = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        setItems(its); setSrc(`en vivo · ${h}`); setLive(true)
      } catch {
        if (cancel) return
        setItems(FB.map(([n, c, v]) => [n.replace('Dólar ', ''), c, v] as [string, number, number]))
        setSrc('valores de ejemplo (sin conexión)'); setLive(false)
      }
    })()
    return () => { cancel = true }
  }, [])

  return (
    <div className="mkt-bar" title="Cotización de referencia online — no proviene de los datos del sistema">
      <span className="mkt-bar-tag">📡 Mercado</span>
      <div className="mkt-bar-row">
        {items.map(i => (
          <span className="it" key={i[0]}>
            <span className="n">{i[0]}</span>
            <span className="v num">{fmt.format(i[1])}</span>
            <span className="sep">/</span>
            <span className="v num">{fmt.format(i[2])}</span>
          </span>
        ))}
      </div>
      <span className={`mkt-bar-src${live ? ' live' : ''}`}>{src}</span>
    </div>
  )
}
