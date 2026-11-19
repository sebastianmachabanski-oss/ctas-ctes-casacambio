/**
 * Cotizaciones de MERCADO, de fuentes externas. Nada de esto sale de los datos del
 * sistema: son el referencial contra el que se mide si se compró y se vendió bien.
 *
 * ── POR QUÉ TRES FUENTES A LA VEZ (19/11/2026) ─────────────────────────────
 * El cliente mira dolarhoy. Pero el día que se eligió, dolarhoy y dolarapi daban el
 * MISMO blue —1.620 / 1.640, con cinco minutos de diferencia—, y la brecha del 1,5% que
 * motivó toda la discusión resultó ser la hora de la captura, no la fuente.
 *
 * Una coincidencia no prueba nada, así que se guardan las tres y se mide. Si en dos
 * semanas dolarapi reproduce a dolarhoy, el lector de HTML —que es el único frágil de los
 * tres— se puede tirar. Si no, queda demostrado cuál hay que usar y por qué.
 *
 * Lo que aporta cada una:
 *   dolarhoy     la que mira el cliente. Intradiaria, compra y venta, dólar/euro/real.
 *                NO tiene API: hay que leer el HTML, y eso se rompe con un rediseño.
 *   dolarapi     API de verdad, intradiaria, y la única con USDT —que dolarhoy no tiene—.
 *   monitorargy  API con QUINCE AÑOS de historia diaria del blue. Es una foto de la
 *                mañana, así que no sirve para el momento, pero sí para llenar el pasado.
 */

export type Fuente = 'dolarhoy' | 'dolarapi' | 'monitorargy'

/**
 * Qué cotización es, normalizada entre fuentes: cada una la nombra distinto —la página
 * del blue de dolarhoy se titula "Dólar Libre"— y sin esto no se pueden comparar.
 */
export type Clave = 'blue' | 'oficial' | 'usdt' | 'eur' | 'brl'

export const CLAVES: { clave: Clave; label: string }[] = [
  { clave: 'blue',    label: 'Dólar blue' },
  { clave: 'oficial', label: 'Dólar oficial' },
  { clave: 'usdt',    label: 'USDT' },
  { clave: 'eur',     label: 'Euro' },
  { clave: 'brl',     label: 'Real' },
]

export type Cotizacion = {
  fuente: Fuente
  clave: Clave
  compra: number | null
  venta: number | null
  /**
   * Cuándo dice LA FUENTE que se actualizó, en ISO. Se guarda aparte de la hora en que la
   * leímos nosotros: es la única forma de notar que una fuente se congeló. Un valor que no
   * cambia puede ser un mercado quieto o un sitio roto, y esto los distingue.
   */
  actualizado: string | null
  /** El texto crudo de la actualización, tal como lo publica la fuente. Para diagnosticar. */
  actualizadoTexto: string | null
}

/** Lo que devuelve leer una fuente: lo que salió bien y lo que no. */
export type Lectura = {
  fuente: Fuente
  cotizaciones: Cotizacion[]
  /** Qué no se pudo leer y por qué. Vacío = salió todo bien. */
  problemas: string[]
}

/**
 * Convierte "$1.620,00" en 1620. Devuelve null si no es un número, en vez de NaN: un NaN
 * se propaga callado hasta la base y termina guardado como nulo sin que nadie sepa por qué.
 */
export function aNumero(txt: string | null | undefined): number | null {
  if (txt == null) return null
  const s = String(txt).replace(/[\s$€£%]/g, '').replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Spread máximo tolerable entre compra y venta. Por encima, el dato está mal leído. */
const SPREAD_MAXIMO = 0.25

/**
 * Revisa una cotización ANTES de guardarla. Devuelve el problema, o null si está bien.
 *
 * Esto es lo que evita el peor modo de falla del scraping: que el sitio cambie, el lector
 * agarre cualquier número de la página y lo guarde como si fuera la cotización. Un dato
 * ausente se nota; uno equivocado se usa.
 */
export function problemaDe(c: Cotizacion): string | null {
  const { compra, venta } = c
  if (compra == null && venta == null) return `${c.clave}: no se encontró ni compra ni venta`
  if (venta == null) return `${c.clave}: se encontró la compra (${compra}) pero no la venta`
  if (compra == null) return `${c.clave}: se encontró la venta (${venta}) pero no la compra`
  if (compra <= 0 || venta <= 0) return `${c.clave}: importes no positivos (${compra} / ${venta})`
  // Por definición del negocio la venta es mayor o igual a la compra. Al revés, o es un
  // error de la fuente o el lector cruzó las dos columnas.
  if (venta < compra) return `${c.clave}: la venta (${venta}) es menor que la compra (${compra})`
  if ((venta - compra) / venta > SPREAD_MAXIMO)
    return `${c.clave}: spread de ${Math.round(((venta - compra) / venta) * 100)}%, demasiado grande`
  return null
}
