/**
 * Lector de dolarapi.com — API de verdad, sin clave.
 *
 * Es la que ya usa la banda de cotizaciones de la pantalla (src/components/BandaMercado),
 * y la ÚNICA de las tres que publica USDT, que el cliente opera y dolarhoy no tiene.
 *
 * Dos endpoints: `/v1/dolares` trae los dólares (blue, oficial y cripto, que es el USDT)
 * y `/v1/cotizaciones` las otras monedas (euro, real). Los dos traen compra, venta y la
 * fecha de actualización, así que no hay nada que adivinar.
 */
import { type Clave, type Cotizacion, type Lectura } from './tipos'

const BASE = 'https://dolarapi.com/v1'

/** `casa` en /v1/dolares → nuestra clave. 'cripto' es la cotización de USDT. */
const POR_CASA: Record<string, Clave> = { blue: 'blue', oficial: 'oficial', cripto: 'usdt' }
/** `moneda` en /v1/cotizaciones → nuestra clave. */
const POR_MONEDA: Record<string, Clave> = { EUR: 'eur', BRL: 'brl' }

const num = (v: any): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Arma las cotizaciones a partir de las dos respuestas ya descargadas. Función PURA: se
 * prueba con respuestas guardadas, sin depender de que el servicio esté en pie.
 */
export function leerRespuestas(dolares: any[], cotizaciones: any[]): Cotizacion[] {
  const salida: Cotizacion[] = []
  const agregar = (clave: Clave, x: any) => salida.push({
    fuente: 'dolarapi',
    clave,
    compra: num(x?.compra),
    venta: num(x?.venta),
    actualizado: x?.fechaActualizacion ? new Date(x.fechaActualizacion).toISOString() : null,
    actualizadoTexto: x?.fechaActualizacion ?? null,
  })
  for (const x of Array.isArray(dolares) ? dolares : []) {
    const clave = POR_CASA[x?.casa]
    if (clave) agregar(clave, x)
  }
  for (const x of Array.isArray(cotizaciones) ? cotizaciones : []) {
    const clave = POR_MONEDA[x?.moneda]
    if (clave) agregar(clave, x)
  }
  return salida
}

export async function leerDolarapi(fetchImpl: typeof fetch = fetch): Promise<Lectura> {
  const problemas: string[] = []
  const bajar = async (ruta: string): Promise<any[]> => {
    try {
      const r = await fetchImpl(`${BASE}${ruta}`, { signal: AbortSignal.timeout(15_000) })
      if (!r.ok) { problemas.push(`${ruta} respondió HTTP ${r.status}`); return [] }
      return await r.json()
    } catch (e: any) {
      problemas.push(`no se pudo leer ${ruta} (${e?.message ?? e})`)
      return []
    }
  }
  const [dolares, cotizaciones] = await Promise.all([
    bajar('/dolares'), bajar('/cotizaciones'),
  ])
  return { fuente: 'dolarapi', cotizaciones: leerRespuestas(dolares, cotizaciones), problemas }
}
