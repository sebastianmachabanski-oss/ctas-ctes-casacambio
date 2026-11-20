/**
 * Validador de los lectores de cotizaciones de mercado (`src/lib/cotizaciones`).
 *
 *   npx tsx scripts/validar-cotizaciones.mts
 *
 * NO TOCA LA RED. Usa `scripts/muestras/dolarhoy-blue.html`, que es un fragmento REAL de
 * la página, y respuestas de las APIs escritas a mano. Para probar contra las fuentes de
 * verdad está `scripts/tomar-cotizaciones.mts --vista-previa`; esto verifica la lógica, que
 * es lo que se puede romper sin que nadie se entere.
 *
 * Lo que más importa acá es lo que NO se guarda: un lector de HTML que agarra cualquier
 * número de la página y lo da por bueno es peor que uno que falla.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leerPagina, fechaDolarhoy } from '../src/lib/cotizaciones/dolarhoy'
import { leerRespuestas } from '../src/lib/cotizaciones/dolarapi'
import { leerEstado } from '../src/lib/cotizaciones/monitorargy'
import { problemaDe, aNumero, type Cotizacion } from '../src/lib/cotizaciones/tipos'
import { credencialesSupabase } from '../src/lib/cotizaciones/guardar'

const AQUI = dirname(fileURLToPath(import.meta.url))

let ok = 0
const fallas: string[] = []
function asert(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok++; return }
  fallas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

const cot = (p: Partial<Cotizacion>): Cotizacion => ({
  fuente: 'dolarhoy', clave: 'blue', compra: null, venta: null,
  actualizado: null, actualizadoTexto: null, ...p,
})

// ── 1. EL CASO REAL: la página de dolarhoy tal como vino ───────────────────
{
  const html = readFileSync(join(AQUI, 'muestras', 'dolarhoy-blue.html'), 'utf8')
  const c = leerPagina(html, 'blue')
  asert('1a · encuentra la compra', c.compra === 1620, `obtuvo ${c.compra}`)
  asert('1b · encuentra la venta', c.venta === 1640, `obtuvo ${c.venta}`)
  asert('1c · no se guía por el título de la página', c.clave === 'blue')
  asert('1d · lee la hora de actualización', c.actualizadoTexto === '19/11/26 06:24 PM',
    String(c.actualizadoTexto))
  asert('1e · y la convierte bien', c.actualizado === '2026-11-19T21:24:00.000Z',
    String(c.actualizado))
  asert('1f · la cotización pasa los controles', problemaDe(c) === null, String(problemaDe(c)))
}

// ── 2. La hora: 12 AM y 12 PM son las que se escriben mal ──────────────────
{
  asert('2a · mediodía', fechaDolarhoy('19/11/26 12:00 PM') === '2026-11-19T15:00:00.000Z')
  asert('2b · medianoche', fechaDolarhoy('19/11/26 12:00 AM') === '2026-11-19T03:00:00.000Z')
  asert('2c · de la tarde', fechaDolarhoy('19/11/26 06:24 PM') === '2026-11-19T21:24:00.000Z')
  asert('2d · sin hora reconocible no inventa una', fechaDolarhoy('ayer') === null)
  asert('2e · vacío', fechaDolarhoy(null) === null)
}

// ── 3. Importes: lo que NO es un número tiene que dar null, no NaN ─────────
//     Un NaN se propaga callado hasta la base y queda guardado como nulo sin que nadie
//     sepa por qué. Un null se ve en el control y frena el guardado.
{
  asert('3a · formato argentino', aNumero('$1.620,00') === 1620)
  asert('3b · sin decimales', aNumero('1.620') === 1620)
  asert('3c · millones', aNumero('$1.234.567,89') === 1234567.89)
  asert('3d · texto', aNumero('sin datos') === null)
  asert('3e · vacío', aNumero('') === null)
  asert('3f · guion', aNumero('—') === null)
}

// ── 4. EL CONTROL QUE SOSTIENE TODO: qué no se guarda ──────────────────────
{
  asert('4a · sin ningún número', problemaDe(cot({})) !== null)
  asert('4b · falta la venta', problemaDe(cot({ compra: 1620 })) !== null)
  asert('4c · falta la compra', problemaDe(cot({ venta: 1640 })) !== null)
  asert('4d · negativos', problemaDe(cot({ compra: -1, venta: 10 })) !== null)
  // Si el lector cruza las columnas, la venta queda abajo de la compra.
  asert('4e · venta menor que compra', problemaDe(cot({ compra: 1640, venta: 1620 })) !== null)
  // Agarrar un número cualquiera de la página da spreads absurdos.
  asert('4f · spread absurdo', problemaDe(cot({ compra: 100, venta: 1640 })) !== null)
  asert('4g · una cotización normal pasa', problemaDe(cot({ compra: 1620, venta: 1640 })) === null)
  asert('4h · compra igual a venta es válido', problemaDe(cot({ compra: 1640, venta: 1640 })) === null)
}

// ── 5. Una página sin los números: tiene que devolver nulos, no basura ─────
{
  const c = leerPagina('<html><body><div>Compra</div><div>no disponible</div></body></html>', 'blue')
  asert('5a · no inventa un importe', c.compra === null && c.venta === null,
    `${c.compra} / ${c.venta}`)
  asert('5b · y el control lo frena', problemaDe(c) !== null)
}

// ── 6. dolarapi: las dos respuestas, incluido el USDT ──────────────────────
{
  const dolares = [
    { casa: 'oficial', compra: 1535, venta: 1585, fechaActualizacion: '2026-11-19T18:00:00.000Z' },
    { casa: 'blue', compra: 1620, venta: 1640, fechaActualizacion: '2026-11-19T20:59:00.000Z' },
    { casa: 'cripto', compra: 1730.43, venta: 1735, fechaActualizacion: '2026-11-19T20:59:00.000Z' },
    { casa: 'mayorista', compra: 1, venta: 2 },
  ]
  const otras = [
    { moneda: 'EUR', compra: 1706.47, venta: 1720.25, fechaActualizacion: '2026-11-19T17:59:00.000Z' },
    { moneda: 'BRL', compra: 262.95, venta: 263.08, fechaActualizacion: '2026-11-19T18:00:00.000Z' },
    { moneda: 'CLP', compra: 1, venta: 2 },
  ]
  const cs = leerRespuestas(dolares, otras)
  asert('6a · trae las cinco que interesan', cs.length === 5, `trajo ${cs.length}`)
  asert('6b · ignora las que no se usan', !cs.some(c => ['mayorista', 'CLP'].includes(c.clave as string)))
  const usdt = cs.find(c => c.clave === 'usdt')
  asert('6c · "cripto" es el USDT', usdt?.venta === 1735, String(usdt?.venta))
  asert('6d · todas pasan los controles', cs.every(c => problemaDe(c) === null))
  asert('6e · aguanta una respuesta vacía', leerRespuestas([], []).length === 0)
  asert('6f · aguanta basura', leerRespuestas(null as any, undefined as any).length === 0)
}

// ── 7. monitorargy: publica la venta y NO la compra ────────────────────────
//     Que falte la compra es su forma normal de ser, no una falla. Inventarla restándole
//     un spread sería fabricar un dato de mercado.
{
  const estado = {
    series: {
      tc_blue: { ultimoValor: 1630, ultimaFecha: '2026-11-19' },
      tc_minorista: { ultimoValor: 1582.68, ultimaFecha: '2026-11-18' },
      ipc_mensual: { ultimoValor: 2.17, ultimaFecha: '2026-10-01' },
    },
  }
  const cs = leerEstado(estado)
  asert('7a · trae las dos de tipo de cambio', cs.length === 2, `trajo ${cs.length}`)
  asert('7b · sin compra', cs.every(c => c.compra === null))
  asert('7c · con la venta', cs.find(c => c.clave === 'blue')?.venta === 1630)
  // La fecha viene sin hora: anclada al mediodía no se corre de día al pasar a UTC.
  asert('7d · la fecha no se corre de día',
    cs.find(c => c.clave === 'blue')?.actualizado === '2026-11-19T15:00:00.000Z',
    String(cs.find(c => c.clave === 'blue')?.actualizado))
  asert('7e · ignora las series que no son tipo de cambio',
    !cs.some(c => (c.clave as string) === 'ipc_mensual'))
  asert('7f · aguanta un estado vacío', leerEstado({}).length === 0)
  asert('7g · aguanta basura', leerEstado(null).length === 0)
}

// ── 8. Las credenciales van DE A PARES ─────────────────────────────────────
//     El 19/11/2026 la función leyó las once cotizaciones sin un error y no pudo guardar
//     ninguna: `Invalid API key`. Elegía la URL y la clave por separado, y en Netlify
//     convivían dos juegos de nombres —los del sitio y los que usaba el sync—, así que
//     terminó con la dirección de un proyecto y la clave de otro. Supabase no da ninguna
//     pista de que el problema sea la URL.
{
  const guardadas = { ...process.env }
  const limpiar = () => {
    for (const k of ['SUPABASE_URL', 'SERVICE_ROLE_KEY',
      'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k]
  }

  limpiar()
  process.env.SUPABASE_URL = 'https://viejo.supabase.co'
  process.env.SERVICE_ROLE_KEY = 'clave-vieja'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://actual.supabase.co/'
  process.env.SUPABASE_SERVICE_ROLE_KEY = '  clave-actual \n'
  let c = credencialesSupabase()
  asert('8a · con los dos juegos, gana el del sitio',
    c?.origen === 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY', String(c?.origen))
  asert('8b · y NO mezcla la URL de uno con la clave del otro',
    c?.url === 'https://actual.supabase.co' && c?.key === 'clave-actual',
    `${c?.url} / ${JSON.stringify(c?.key)}`)
  asert('8c · saca la barra final de la URL', !c?.url.endsWith('/'))
  // Una clave pegada con un salto de línea da el mismo `Invalid API key` y no se ve.
  asert('8d · limpia espacios y saltos de línea de la clave', c?.key === 'clave-actual')
  asert('8e · informa qué proyecto', c?.proyecto === 'actual', String(c?.proyecto))

  // EL CASO REAL DE PRODUCCIÓN: las dos claves cargadas, la vieja ya sin valor útil.
  // `createAdminClient` prefiere SUPABASE_SERVICE_ROLE_KEY; esta función hacía lo inverso,
  // así que la app escribía bien y la función programada fallaba las once escrituras.
  limpiar()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://actual.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-buena'
  process.env.SERVICE_ROLE_KEY = 'clave-vieja-que-ya-no-sirve'
  c = credencialesSupabase()
  asert('8f · con las dos claves, gana la misma que usa la app',
    c?.key === 'clave-buena', String(c?.key))

  // Si solo está el nombre viejo, se usa igual: mejor eso que no guardar nada.
  limpiar()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://actual.supabase.co'
  process.env.SERVICE_ROLE_KEY = 'clave-vieja'
  c = credencialesSupabase()
  asert('8g · con solo el nombre viejo, lo usa',
    c?.origen === 'NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE_KEY', String(c?.origen))

  limpiar()
  process.env.SUPABASE_URL = 'https://viejo.supabase.co'
  process.env.SERVICE_ROLE_KEY = 'clave-vieja'
  c = credencialesSupabase()
  asert('8h · sin las del sitio, usa las de línea de comandos',
    c?.origen === 'SUPABASE_URL + SERVICE_ROLE_KEY' && c?.url === 'https://viejo.supabase.co',
    String(c?.origen))

  // Medio juego no sirve.
  limpiar()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://actual.supabase.co'
  asert('8i · una URL sin ninguna clave no alcanza', credencialesSupabase() === null)
  limpiar()
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-suelta'
  asert('8j · una clave sin URL tampoco', credencialesSupabase() === null)
  limpiar()
  asert('8k · sin nada, null', credencialesSupabase() === null)

  for (const k of Object.keys(process.env)) if (!(k in guardadas)) delete process.env[k]
  Object.assign(process.env, guardadas)
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
