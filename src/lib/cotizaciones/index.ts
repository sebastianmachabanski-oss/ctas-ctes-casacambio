/**
 * Toma de cotizaciones de mercado: lee las tres fuentes y devuelve lo que se puede guardar.
 *
 * Ver `tipos.ts` para por qué son tres. El orquestador no decide cuál vale: guarda las que
 * pasan los controles y REPORTA las que no, para que la decisión se tome con datos.
 *
 * ── LA REGLA QUE SOSTIENE TODO ESTO ────────────────────────────────────────
 * Una cotización que no pasa los controles NO SE GUARDA. El peor final posible de un
 * lector de HTML no es que falle: es que el sitio cambie, el lector agarre cualquier
 * número de la página y lo guarde como si fuera la cotización. Un dato que falta se nota
 * al mirarlo; uno equivocado se usa para decidir.
 */
import { problemaDe, type Cotizacion, type Fuente } from './tipos'
import { leerDolarhoy } from './dolarhoy'
import { leerDolarapi } from './dolarapi'
import { leerMonitorargy } from './monitorargy'

export * from './tipos'
export { leerDolarhoy, leerPagina, fechaDolarhoy, PAGINAS } from './dolarhoy'
export { leerDolarapi, leerRespuestas } from './dolarapi'
export { leerMonitorargy, leerEstado, leerHistoria, SERIES } from './monitorargy'

/**
 * Cuánto puede atrasarse una fuente antes de que su dato deje de representar "ahora".
 *
 * No invalida el dato —se guarda igual, con su fecha— pero sí se informa: una fuente
 * congelada es indistinguible de un mercado quieto si nadie mira la antigüedad. dolarhoy
 * y dolarapi se mueven durante el día; monitorargy publica una vez a la mañana, así que
 * tiene su propio margen.
 */
const ATRASO_MAXIMO_HS: Record<Fuente, number> = {
  dolarhoy: 6,
  dolarapi: 6,
  // 48 y no 24: las series que monitorargy toma del BCRA se publican con un día de
  // demora, así que su "minorista" es normalmente de ayer. Con 30 h avisaba todos los
  // días por algo que no tiene nada de malo, y un aviso que siempre suena no se lee.
  monitorargy: 48,
}

export type Toma = {
  /** Cuándo se leyó. Es el reloj nuestro, no el de las fuentes. */
  tomadaEn: string
  /** Las que pasaron los controles. Es lo único que se guarda. */
  cotizaciones: Cotizacion[]
  /** Qué no se pudo leer o no pasó los controles, en texto legible. */
  problemas: string[]
  /** Fuentes que no devolvieron una sola cotización válida. */
  fuentesCaidas: Fuente[]
}

/**
 * Lee las tres fuentes en paralelo y separa lo bueno de lo que hay que avisar.
 *
 * Nunca tira una excepción: una fuente caída es un hecho esperable, no un error del
 * programa. Si se cae dolarhoy, dolarapi y monitorargy siguen guardando, y el reporte se
 * entera por `fuentesCaidas` en vez de quedarse sin ninguna toma.
 */
export async function tomarCotizaciones(fetchImpl: typeof fetch = fetch): Promise<Toma> {
  const tomadaEn = new Date().toISOString()
  const lecturas = await Promise.all([
    leerDolarhoy(fetchImpl), leerDolarapi(fetchImpl), leerMonitorargy(fetchImpl),
  ])

  const cotizaciones: Cotizacion[] = []
  const problemas: string[] = []
  const fuentesCaidas: Fuente[] = []

  for (const l of lecturas) {
    for (const p of l.problemas) problemas.push(`${l.fuente}: ${p}`)
    let validas = 0
    for (const c of l.cotizaciones) {
      const problema = problemaDe(c)
      // monitorargy no publica compra: que falte es su forma normal de ser, no una falla.
      const soloFaltaCompra = c.fuente === 'monitorargy' && c.compra == null && c.venta != null
      if (problema && !soloFaltaCompra) { problemas.push(`${l.fuente} · ${problema}`); continue }
      validas++
      cotizaciones.push(c)
      if (c.actualizado) {
        const horas = (Date.now() - new Date(c.actualizado).getTime()) / 3_600_000
        if (horas > ATRASO_MAXIMO_HS[l.fuente]) {
          problemas.push(
            `${l.fuente} · ${c.clave}: el dato es de hace ${Math.round(horas)} h `
            + `(${c.actualizadoTexto ?? c.actualizado})`)
        }
      }
    }
    if (validas === 0) fuentesCaidas.push(l.fuente)
  }

  return { tomadaEn, cotizaciones, problemas, fuentesCaidas }
}
