/**
 * Lector de monitorargy.com — API sin clave, con historia.
 *
 * ── QUÉ APORTA Y QUÉ NO ────────────────────────────────────────────────────
 * Publica UN SOLO valor por serie y declara que es la VENTA ("Cotización informal, venta.
 * No hay fuente oficial; la relevan los medios y la compila ArgentinaDatos"). No hay
 * compra. Y es una foto diaria de la mañana, no intradiaria.
 *
 * Por eso no sirve como reemplazo de dolarhoy en el momento. Sirve para otra cosa: tiene
 * el blue diario DESDE 2011 —4.144 observaciones—, que ninguna de las otras dos ofrece.
 * Es la única forma de llenar el pasado de una sola vez en vez de esperar a juntarlo.
 *
 * Tampoco tiene euro, real ni USDT: de las 1.053 series que publica, las de tipo de cambio
 * son todas del dólar.
 */
import { type Clave, type Cotizacion, type Lectura } from './tipos'

const BASE = 'https://monitorargy.com'

/** Serie de monitorargy → nuestra clave. Solo hay dólar. */
export const SERIES: { clave: Clave; serie: string }[] = [
  { clave: 'blue',    serie: 'tc_blue' },
  { clave: 'oficial', serie: 'tc_minorista' },
]

/**
 * Arma las cotizaciones desde el estado ya descargado. Función PURA.
 *
 * `compra` va en null a propósito: la fuente no la publica. Inventarla —por ejemplo
 * restándole un spread al valor que sí da— sería fabricar un dato de mercado, que es
 * exactamente lo que este módulo existe para no hacer.
 */
export function leerEstado(estado: any): Cotizacion[] {
  const series = estado?.series ?? {}
  const salida: Cotizacion[] = []
  for (const { clave, serie } of SERIES) {
    const s = series[serie]
    if (!s) continue
    const v = Number(s.ultimoValor)
    salida.push({
      fuente: 'monitorargy',
      clave,
      compra: null,
      venta: Number.isFinite(v) ? v : null,
      // `ultimaFecha` es el día del dato, sin hora: se ancla al mediodía de Argentina para
      // que no se corra de día al convertir a UTC.
      actualizado: s.ultimaFecha ? new Date(`${s.ultimaFecha}T12:00:00-03:00`).toISOString() : null,
      actualizadoTexto: s.ultimaFecha ?? null,
    })
  }
  return salida
}

export async function leerMonitorargy(fetchImpl: typeof fetch = fetch): Promise<Lectura> {
  const problemas: string[] = []
  try {
    const r = await fetchImpl(`${BASE}/data/estado.json`, { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) {
      return { fuente: 'monitorargy', cotizaciones: [], problemas: [`estado.json respondió HTTP ${r.status}`] }
    }
    return { fuente: 'monitorargy', cotizaciones: leerEstado(await r.json()), problemas }
  } catch (e: any) {
    return { fuente: 'monitorargy', cotizaciones: [], problemas: [`no se pudo leer estado.json (${e?.message ?? e})`] }
  }
}

/**
 * La serie histórica completa de una clave, para llenar el pasado. Devuelve los puntos
 * como {fecha, venta}: igual que arriba, sin compra, porque la fuente no la tiene.
 */
export async function leerHistoria(
  clave: Clave, fetchImpl: typeof fetch = fetch,
): Promise<{ fecha: string; venta: number }[]> {
  const serie = SERIES.find(s => s.clave === clave)?.serie
  if (!serie) return []
  const r = await fetchImpl(`${BASE}/data/series/${serie}.json`, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`la serie ${serie} respondió HTTP ${r.status}`)
  const d = await r.json()
  const puntos = d?.resoluciones?.['1d'] ?? []
  return (Array.isArray(puntos) ? puntos : [])
    .map((p: any) => ({ fecha: String(p?.f ?? ''), venta: Number(p?.v) }))
    .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) && Number.isFinite(p.venta))
}
