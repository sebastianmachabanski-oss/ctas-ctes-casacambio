/**
 * Lector de dolarhoy.com — la fuente que mira el cliente.
 *
 * ── NO TIENE API ───────────────────────────────────────────────────────────
 * Se probaron /api, /api/v1, /api/cotizaciones, /feed y /rss: ninguna existe. Los valores
 * vienen en el HTML que arma el servidor, así que hay que leerlos de ahí. Es el único
 * lector frágil de los tres y por eso es el que más cuidado lleva.
 *
 * ── SE LEE POR ETIQUETA, NO POR POSICIÓN ───────────────────────────────────
 * Busca las palabras "Compra" y "Venta" y toma el número que viene PEGADO a cada una, sin
 * saber nada de la estructura del HTML. Apuntar a rutas fijas del documento —tal div
 * adentro de tal otro— se rompe con cualquier retoque de diseño; esto aguanta mientras
 * sigan diciendo "Compra" y "Venta" al lado del número, que es lo último que van a cambiar.
 *
 * Tampoco se mira el título de la página: la del blue se titula "Dólar Libre". La moneda
 * la decide la URL que se pidió, no lo que diga el contenido.
 *
 * ── UNA PÁGINA POR MONEDA ──────────────────────────────────────────────────
 * La portada tiene media docena de cotizaciones juntas y hay que adivinar cuál es cuál.
 * Las páginas por moneda tienen UNA sola, así que no hay ambigüedad posible.
 */
import { aNumero, type Clave, type Cotizacion, type Lectura } from './tipos'

const BASE = 'https://dolarhoy.com'

/** Qué página corresponde a cada moneda. dolarhoy NO publica USDT: ver tipos.ts. */
export const PAGINAS: { clave: Clave; ruta: string }[] = [
  { clave: 'blue',    ruta: '/cotizacion-dolar-blue' },
  { clave: 'oficial', ruta: '/cotizacion-dolar-oficial' },
  { clave: 'eur',     ruta: '/cotizacion-euro' },
  { clave: 'brl',     ruta: '/cotizacion-real-brasileno' },
]

/** Entidades HTML que aparecen en estas páginas. No hace falta un intérprete completo. */
function desescapar(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

/** El texto visible, una línea por elemento. Es sobre esto que se buscan las etiquetas. */
function aLineas(html: string): string[] {
  const sinCodigo = html.replace(/<(script|style|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  const texto = desescapar(sinCodigo.replace(/<[^>]+>/g, '\n'))
  return texto.split('\n').map(x => x.trim()).filter(Boolean)
}

const ES_IMPORTE = /^\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s*$/

/**
 * "19/11/26 06:24 PM" → ISO. Argentina no tiene horario de verano, así que es UTC−3 fijo
 * todo el año y la conversión no depende de la fecha.
 */
export function fechaDolarhoy(texto: string | null): string | null {
  if (!texto) return null
  const m = /(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(texto)
  if (!m) return null
  const [, d, mes, anioTxt, hTxt, min, ampm] = m
  const anio = anioTxt.length === 2 ? 2000 + Number(anioTxt) : Number(anioTxt)
  let h = Number(hTxt)
  if (ampm?.toUpperCase() === 'PM' && h !== 12) h += 12
  if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0
  const iso = `${anio}-${mes}-${d}T${String(h).padStart(2, '0')}:${min}:00-03:00`
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? null : t.toISOString()
}

/**
 * Saca la cotización de una página ya descargada. Función PURA: recibe el HTML y no toca
 * la red, para poder probarla con páginas guardadas en vez de depender del sitio.
 */
export function leerPagina(html: string, clave: Clave): Cotizacion {
  const lineas = aLineas(html)
  const buscar = (etiqueta: 'compra' | 'venta'): number | null => {
    for (let i = 0; i < lineas.length; i++) {
      if (lineas[i].toLowerCase() !== etiqueta) continue
      // El número puede estar en la línea siguiente o una más allá, según cómo quede
      // partido el marcado. Más lejos ya no es "el número de al lado".
      for (let j = i + 1; j <= i + 2 && j < lineas.length; j++) {
        if (ES_IMPORTE.test(lineas[j])) return aNumero(lineas[j])
      }
    }
    return null
  }
  const mt = /Actualizado por última vez:\s*([^<\n|]{0,32})/i.exec(desescapar(html))
  const actualizadoTexto = mt ? mt[1].trim() : null
  return {
    fuente: 'dolarhoy',
    clave,
    compra: buscar('compra'),
    venta: buscar('venta'),
    actualizado: fechaDolarhoy(actualizadoTexto),
    actualizadoTexto,
  }
}

/** Baja las cuatro páginas y arma la lectura. Una que falle no tumba a las otras. */
export async function leerDolarhoy(fetchImpl: typeof fetch = fetch): Promise<Lectura> {
  const cotizaciones: Cotizacion[] = []
  const problemas: string[] = []
  await Promise.all(PAGINAS.map(async ({ clave, ruta }) => {
    try {
      const r = await fetchImpl(`${BASE}${ruta}`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      })
      if (!r.ok) { problemas.push(`${clave}: ${ruta} respondió HTTP ${r.status}`); return }
      cotizaciones.push(leerPagina(await r.text(), clave))
    } catch (e: any) {
      problemas.push(`${clave}: no se pudo leer ${ruta} (${e?.message ?? e})`)
    }
  }))
  return { fuente: 'dolarhoy', cotizaciones, problemas }
}
