/**
 * Graba el video de demostración recorriendo la app con datos ficticios.
 *
 *   cd demo && npm install && npx playwright install chromium
 *   DEMO_USUARIO=demo@ejemplo.com DEMO_CLAVE=... npm run grabar
 *
 * QUÉ PRODUCE
 * Un archivo WebM en `demo/salida/`. Playwright solo sabe grabar WebM; el paso a MP4 va
 * con ffmpeg y está explicado en demo/README.md.
 *
 * POR QUÉ ESTÁ GUIONADO Y NO SE GRABA A MANO
 * Una captura hecha a mano hay que rehacerla entera cada vez que cambia una pantalla, y
 * siempre sale con un titubeo, un clic de más o un dato que no convenía mostrar. Esto se
 * vuelve a correr y sale igual de prolijo. El recorrido está abajo, en RECORRIDO, y se
 * edita como una lista: agregar una parada es agregar un objeto.
 *
 * ── LA GUARDA ──────────────────────────────────────────────────────────────
 * Solo graba contra `localhost`. No es una comodidad: es para que sea IMPOSIBLE grabar
 * sin querer la app del cliente real con sus datos verdaderos y después mandarle ese
 * video a un tercero. Si algún día hay que grabar contra una URL desplegada, que sea una
 * decisión explícita y con otra guarda, no un descuido.
 */
import { chromium } from 'playwright'
import { mkdirSync, existsSync, renameSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cargarCredenciales, ARCHIVO as ARCHIVO_CREDENCIALES } from './credenciales.mjs'
import { leerGuion, ARCHIVO_GUION } from './leer-guion.mjs'
import { mostrarPortada, mostrarCierre } from './laminas.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, 'salida')

// Las credenciales pueden venir del entorno o de `demo/credenciales.local`, que evita
// tener que escribirlas en cada ventana nueva. Ver demo/credenciales.mjs.
cargarCredenciales()

const URL_BASE = process.env.DEMO_URL ?? 'http://localhost:3000'
const USUARIO = process.env.DEMO_USUARIO
const CLAVE = process.env.DEMO_CLAVE

// El usuario CLIENTE, para mostrar lo que ve el cliente de la casa de cambio cuando entra
// a mirar su propia cuenta. Lo crea scripts/crear-cliente-demo.mts. Si no están, esas
// paradas se saltean con un aviso en lugar de cortar la grabación: el resto del recorrido
// sirve igual, y es preferible un video sin ese tramo a ningún video.
const CLIENTE_USUARIO = process.env.DEMO_CLIENTE_USUARIO
const CLIENTE_CLAVE = process.env.DEMO_CLIENTE_CLAVE
const HAY_CLIENTE = Boolean(CLIENTE_USUARIO && CLIENTE_CLAVE)

function salir(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1) }

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(URL_BASE)) salir(
  `Solo se graba contra localhost, y DEMO_URL es "${URL_BASE}".\n`
  + '   Es a propósito: evita grabar por error la app del cliente real, con sus datos\n'
  + '   verdaderos, y mandarle ese video a otra persona.\n\n'
  + '   Levantá la app con datos de demo:  npm run dev')

if (!USUARIO || !CLAVE) salir(
  'Faltan DEMO_USUARIO y DEMO_CLAVE: el usuario de la base de DEMOSTRACIÓN.\n\n'
  + '   Para no volver a escribirlas en cada ventana, creá el archivo\n'
  + `   ${ARCHIVO_CREDENCIALES}\n`
  + '   con este contenido (ver demo/credenciales.local.ejemplo):\n\n'
  + '     DEMO_USUARIO=demo@ejemplo.com\n'
  + '     DEMO_CLAVE=la-clave-del-administrador\n'
  + '     DEMO_CLIENTE_USUARIO=cliente@ejemplo.com\n'
  + '     DEMO_CLIENTE_CLAVE=Demo1234!\n\n'
  + '   No se sube al repositorio. Si no creaste los usuarios todavía, están en los\n'
  + '   pasos 2 y 3 de demo/README.md.')

// ── Tiempos ────────────────────────────────────────────────────────────────
// Más lentos de lo que uno leería solo: el que mira el video no conoce la pantalla y
// necesita ubicarse antes de que el cartel le diga qué mirar.
const pausa = ms => new Promise(r => setTimeout(r, ms))

/**
 * El recorrido se lee de `guion.json`, que está al lado de este archivo.
 *
 * POR QUÉ NO ESTÁ ACÁ ADENTRO
 * Los textos del video se retocan muchas más veces que el programa: una explicación que
 * no se entiende, una frase larga, un tiempo corto. Si viven entre el código, cada retoque
 * obliga a abrir un archivo de programación y arriesgarse a romper algo que no se tocó.
 * En un archivo aparte los edita cualquiera.
 *
 * `como` elige con qué usuario se mira la pantalla: 'staff' (el administrador) o 'cliente'
 * (el cliente de la casa de cambio mirando su propia cuenta). Cuando una parada pide un
 * usuario distinto del que está adentro, el recorrido cierra la sesión y vuelve a entrar.
 * Eso se ve en el video, y conviene que se vea: es parte de lo que se está mostrando.
 *
 * EL ORDEN NO ES EL DE LAS PANTALLAS, ES EL DEL ARGUMENTO. Primero quién entra y qué ve
 * cada uno, porque ordena todo lo que viene después. Después lo que el cliente puede hacer
 * solo, que es lo que distingue al producto. Recién entonces la operación diaria. Y al
 * final el control: ganancias y auditoría.
 */

/**
 * Los movimientos guionados, por nombre. El guion los nombra en su campo `accion`.
 *
 * Están acá y no en el guion porque son programa, no texto: bajan la pantalla, escriben en
 * un campo. Lo que se edita seguido —qué dice y cuánto dura— está en el JSON; esto casi
 * nunca cambia.
 */
const ACCIONES = {
  /** Baja la pantalla para mostrar lo que hay más abajo. */
  'bajar': async page => { await page.mouse.wheel(0, 520); await pausa(1200) },

  /** Igual, pero deja mirar un rato antes de bajar. */
  'bajar-despacio': async page => { await pausa(1400); await page.mouse.wheel(0, 420) },

  /** Completa una compra de dólares como la cargaría un operador. */
  'cargar-operacion': async page => {
    const escribir = async (sel, valor) => {
      const campo = page.locator(sel).first()
      if (await campo.count()) { await campo.click(); await campo.fill(valor); await pausa(420) }
    }
    await escribir('input[placeholder="Nombre del cliente"]', 'J. MARTINEZ')
    await escribir('input[inputmode="decimal"]', '5000')
    await pausa(900)
    await page.mouse.wheel(0, 420)
  },
}

const GUION = leerGuion()

/**
 * Los tiempos que NO son de cada parada, sino el ritmo general.
 *
 * POR QUÉ ESTÁN ACÁ ABAJO Y SE PUEDEN CAMBIAR
 * Se repiten en las diecisiete paradas, así que pesan más de lo que parece: con los
 * valores de antes sumaban más tiempo que todos los carteles juntos. Quien mira el video
 * no distingue "el cartel duró poco" de "la pantalla tardó en aparecer": percibe que el
 * video es lento. Si esto no se puede ajustar, se termina acortando los textos —que es lo
 * único visible— sin tocar lo que de verdad lo alarga.
 *
 * Se configuran en `guion.json`, en el bloque `tiempos`, en milésimas de segundo.
 */
const T = GUION.tiempos ?? {}

/** Cuánto queda el cartel quieto antes de que empiece el movimiento de la parada. */
const LEER = T.leer ?? 1800
/** Pausa después de cambiar de pantalla, para que no se vea atropellado. */
const RESPIRAR = T.respirar ?? 500
/** Lo que tarda el cartel en desaparecer antes de pasar a la parada siguiente. */
const SALIDA_CARTEL = T.salidaCartel ?? 300
/** El ritmo del ingreso: lo que tarda en escribir el usuario y la clave. */
const TIPEO = T.tipeo ?? 300
/** La pausa después de entrar, con la pantalla ya cargada. */
const TRAS_INGRESAR = T.trasIngresar ?? 1100

/**
 * Le pone a TODAS las paradas la misma duración, sin tocar el guion.
 *
 *     $env:DEMO_ESPERA=8000
 *
 * Dar con el ritmo es cuestión de probar, y probar editando doce números a mano —y
 * volviéndolos atrás si no gustó— es tedioso. Con esto se graba, se mira, y si quedó
 * corto se cambia un número y se vuelve a grabar. Cuando el ritmo está, los valores
 * elegidos se escriben en el guion y se deja de usar la variable.
 */
const ESPERA_FIJA = Number(process.env.DEMO_ESPERA) || null


const RECORRIDO = (GUION.paradas ?? []).map((p, i) => {
  if (p.accion && !ACCIONES[p.accion]) salir(
    `La parada ${i + 1} ("${p.titulo ?? ''}") pide la acción "${p.accion}", que no existe.\n`
    + `   Las disponibles son: ${Object.keys(ACCIONES).join(', ')}`)
  return { ...p, hacer: p.accion ? ACCIONES[p.accion] : undefined }
})

if (!RECORRIDO.length) salir(`El guion no tiene ninguna parada (${ARCHIVO_GUION}).`)

// ── Cartel sobreimpreso ────────────────────────────────────────────────────
// Se dibuja DENTRO de la página porque Playwright graba lo que el navegador muestra: un
// cartel puesto por fuera no saldría en el video.
// Los nombres de clase van con prefijo PROPIO y el cartel se resetea a mano. No es
// prolijidad: `.t` chocó con una clase `.t` de la página y el título salió pintado como un
// rectángulo blanco —el fondo y el borde redondeado de la otra regla— durante toda una
// grabación. El cartel se inyecta en una página que no controla este archivo, así que no
// puede dar por sentado que hereda nada.
/**
 * El color del cartel, configurable desde el guion (`"estilo": { "fondo": "…" }`).
 *
 * El azul oscuro original era casi el mismo de la barra lateral de la aplicación y el
 * cartel se confundía con ella. El gris oscuro que lo reemplazó seguía siendo oscuro, y
 * a la distancia leía igual: una franja oscura abajo de una pantalla con una franja
 * oscura al costado. El gris CLARO se despega de las dos cosas, y de cualquier color que
 * tenga la app — que además cambia de un cliente a otro.
 *
 * Se declara en tres componentes sueltos y no como un color entero porque el fondo es un
 * degradado: el mismo color aparece opaco abajo y transparente arriba.
 */
const FONDO = GUION.estilo?.fondo ?? '205,206,213'

/**
 * El color del texto se deduce del fondo, salvo que el guion diga otra cosa.
 *
 * Probar tonos es la forma de dar con el que va, y cada vez que se cruza el punto en que
 * el fondo deja de ser oscuro, el texto del color anterior se vuelve ilegible. Elegirlo a
 * mano significa descubrirlo recién al mirar el video, y volver a grabar.
 *
 * El cálculo es el de la norma de accesibilidad web: se mide cuánta luz emite el color y
 * se elige el texto que más contrasta. El umbral 0,18 es el punto donde negro y blanco
 * contrastan parejo.
 */
function textoSegunFondo(rgb) {
  const [r, g, b] = rgb.split(',').map(n => Number(n.trim()) / 255)
  const lineal = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luz = 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b)
  return luz > 0.18 ? '#18181b' : '#ffffff'
}

const TEXTO = GUION.estilo?.texto ?? textoSegunFondo(FONDO)

const ESTILOS = `
  #demo-cartel {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
    margin: 0; padding: 62px 40px 30px; border: 0; border-radius: 0;
    /* El tramo opaco tiene que tapar el título entero: con el degradado arrancando más
       abajo, el título caía sobre la parte clara de la pantalla y el blanco sobre blanco
       no se leía. El desvanecido vive en el padding de arriba, donde no hay texto. */
    background: linear-gradient(to top, rgba(${FONDO},.97) 78%, rgba(${FONDO},0));
    color: ${TEXTO}; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    text-align: left; text-transform: none;
    opacity: 0; transition: opacity .45s ease; pointer-events: none;
  }
  #demo-cartel.visible { opacity: 1; }
  #demo-cartel .demo-titulo, #demo-cartel .demo-texto {
    margin: 0; padding: 0; border: 0; border-radius: 0;
    background: none; box-shadow: none; color: inherit; min-width: 0; display: block;
  }
  #demo-cartel .demo-titulo { font-size: 30px; font-weight: 700; letter-spacing: -.02em; margin-bottom: 7px; }
  #demo-cartel .demo-texto { font-size: 18px; line-height: 1.45; opacity: .9; max-width: 940px; font-weight: 400; }
`

/**
 * Esconde el cartelito de Next que dice "2 errores" o muestra el rayo de compilación.
 *
 * Existe SOLO en modo desarrollo: en el sitio publicado no está. Pero la grabación se hace
 * contra el modo desarrollo, así que saldría en el video — y un cartel de errores arriba
 * de una demostración de venta dice justo lo que no se quiere decir.
 *
 * Esto lo saca de la IMAGEN, no de la existencia: los errores siguen apareciendo en la
 * terminal de `npm run dev`, que es donde corresponde mirarlos.
 */
const OCULTAR_INDICADOR_DEV = `
  nextjs-portal,
  [data-nextjs-toast],
  [data-nextjs-dialog-overlay],
  #__next-build-watcher,
  #__next-prerender-indicator { display: none !important; }
`

async function prepararCartel(page) {
  await page.addStyleTag({ content: ESTILOS }).catch(() => {})
  await page.evaluate(() => {
    if (document.getElementById('demo-cartel')) return
    const d = document.createElement('div')
    d.id = 'demo-cartel'
    d.innerHTML = '<div class="demo-titulo"></div><div class="demo-texto"></div>'
    document.body.appendChild(d)
  }).catch(() => {})
}

async function mostrarCartel(page, titulo, texto) {
  await page.evaluate(({ titulo, texto }) => {
    const d = document.getElementById('demo-cartel')
    if (!d) return
    d.querySelector('.demo-titulo').textContent = titulo
    d.querySelector('.demo-texto').textContent = texto
    d.classList.add('visible')
  }, { titulo, texto }).catch(() => {})
}

async function ocultarCartel(page) {
  await page.evaluate(() => document.getElementById('demo-cartel')?.classList.remove('visible')).catch(() => {})
  await pausa(SALIDA_CARTEL)
}

// ── Grabación ──────────────────────────────────────────────────────────────
// Se declara en voz alta qué se va a usar. Suena a detalle, pero ahorra vueltas enteras:
// cuando un cambio parece no haber surtido efecto, la pregunta real es si el programa lo
// tomó, y mirar el video para averiguarlo cuesta grabar, convertir y mirar. Acá se ve
// antes de empezar.
console.log(`
🎬 Grabando contra ${URL_BASE}
   guion:  ${ARCHIVO_GUION}
   color:  fondo rgb(${FONDO}) · texto ${TEXTO}${GUION.estilo?.texto ? ' (fijado en el guion)' : ' (elegido según el fondo)'}
   ritmo:  ${ESPERA_FIJA ? `${ESPERA_FIJA} ms en TODAS las paradas (DEMO_ESPERA)` : 'el de cada parada del guion'}
   paradas: ${RECORRIDO.length}
`)

/**
 * ¿Está la aplicación levantada?
 *
 * Sin esta comprobación, una app apagada se descubre recién después del precalentado y de
 * que las diecisiete paradas fallen una por una: cuatro minutos de reintentos para llegar
 * a un video vacío. Un pedido que tarda medio segundo lo dice antes de empezar.
 *
 * El motivo más frecuente no es que esté apagada sino que esté en OTRO PUERTO: Next se
 * corre al 3001 cuando el 3000 está ocupado por un servidor anterior que no se cortó, y lo
 * avisa en una sola línea del arranque que es fácil pasar por alto.
 */
async function comprobarQueEsteLevantada() {
  try {
    await fetch(`${URL_BASE}/login`, { signal: AbortSignal.timeout(8_000) })
  } catch {
    salir(
      `No hay nada escuchando en ${URL_BASE}.\n\n`
      + '   Levantá la aplicación en OTRA ventana:\n'
      + '     cd ..\n'
      + '     npm run dev\n\n'
      + '   Y mirá la línea "Local:" que imprime al arrancar. Si dice 3001, quedó un\n'
      + '   servidor anterior ocupando el 3000. En PowerShell se libera así:\n'
      + '     Get-NetTCPConnection -LocalPort 3000 -State Listen |\n'
      + '       ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n\n'
      + '   O grabá contra el puerto que esté usando:\n'
      + '     $env:DEMO_URL="http://localhost:3001"')
  }
}
await comprobarQueEsteLevantada()

mkdirSync(SALIDA, { recursive: true })

const navegador = await chromium.launch({
  // Con cabeza por defecto: headless a veces dibuja distinto, y acá lo que se ve ES el
  // producto. DEMO_HEADLESS=1 sirve para probar la máquina de grabar en un servidor sin
  // pantalla; el video sale igual, pero para el video final conviene con cabeza.
  headless: process.env.DEMO_HEADLESS === '1',
  // DEMO_CHROMIUM apunta a un Chromium ya instalado, por si `playwright install` no
  // corresponde (una máquina sin lugar para bajar otro navegador, o un Chromium de otra
  // versión que ya está). Vacío = el que Playwright administra.
  ...(process.env.DEMO_CHROMIUM ? { executablePath: process.env.DEMO_CHROMIUM } : {}),
  args: ['--window-size=1600,900', '--force-device-scale-factor=1'],
})

// ── Precalentado ───────────────────────────────────────────────────────────
// `npm run dev` compila cada pantalla LA PRIMERA VEZ que alguien la pide. La más pesada
// tarda más de los 30 segundos que espera el ingreso, así que la primera entrada fallaba
// —y cuando no fallaba, el video mostraba la pantalla pensando—. Acá se recorre todo una
// vez en un contexto SIN grabación: cuando arranca la cámara, ya está todo compilado.
//
// Tarda un minuto largo y no se ve en el video. Es el precio de que el video salga fluido.
//
// Y de paso hace de prueba de las claves: es el primer ingreso de la corrida, así que una
// clave equivocada se descubre acá, antes de encender la cámara, en vez de a mitad del
// recorrido.

/**
 * Espera a que pase una de dos: que entre, o que la app diga que la clave está mal.
 * Devuelve 'ok', 'rechazado' o 'timeout'. Sin esto, una clave equivocada se manifiesta
 * como una espera larguísima que termina en "Timeout exceeded" — un mensaje que manda a
 * buscar el problema a cualquier lado menos al que es.
 */
async function esperarIngreso(p, ms) {
  const nuncaFalla = q => q.catch(() => new Promise(() => {}))
  return Promise.race([
    nuncaFalla(p.waitForURL('**/dashboard**', { timeout: ms }).then(() => 'ok')),
    nuncaFalla(p.getByText(/usuario o contraseña incorrectos/i).first()
      .waitFor({ state: 'visible', timeout: ms }).then(() => 'rechazado')),
    new Promise(r => setTimeout(() => r('timeout'), ms + 5_000)),
  ])
}

/** El mensaje de "clave equivocada", en un solo lugar: lo usan el precalentado y el ingreso. */
const avisoClave = usuario =>
  `La app rechazó el ingreso de "${usuario}": usuario o contraseña incorrectos.\n`
  + '   Un motivo frecuente en PowerShell: si la clave se escribió entre comillas\n'
  + '   DOBLES y tiene un $, se interpreta como variable y llega cortada.\n'
  + "   Con comillas simples no pasa:  $env:DEMO_CLAVE='tu-clave'"

async function precalentar() {
  const ctx = await navegador.newContext({ viewport: { width: 1600, height: 900 } })
  const p = await ctx.newPage()
  const rutas = [...new Set(RECORRIDO.filter(x => x.ruta).map(x => x.ruta))]

  const visitar = async (usuario, clave, destinos) => {
    try {
      await p.goto(`${URL_BASE}/login`, { waitUntil: 'networkidle', timeout: 120_000 })
      await p.locator('#email').fill(usuario)
      await p.locator('#password').fill(clave)
      await p.locator('button[type="submit"]').first().click()
      const r0 = await esperarIngreso(p, 120_000)
      // La clave equivocada se corta acá mismo: reintentarla doce veces durante la
      // grabación solo llena el video de pantallas de login.
      if (r0 === 'rechazado') { await ctx.close(); await navegador.close(); salir(avisoClave(usuario)) }
      if (r0 === 'timeout') throw new Error('el ingreso no respondió')
      for (const r of destinos) {
        await p.goto(`${URL_BASE}${r}`, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => {})
      }
      await ctx.clearCookies()
    } catch (e) {
      // Que falle el precalentado no justifica abortar: se graba igual, más lento.
      console.warn(`   ⚠️  precalentado incompleto: ${e.message.split('\n')[0]}`)
    }
  }

  console.log('→ Precalentando las pantallas (no se graba)…')
  await visitar(USUARIO, CLAVE, rutas)
  if (HAY_CLIENTE) await visitar(CLIENTE_USUARIO, CLIENTE_CLAVE, ['/dashboard/cuenta-corriente'])
  await ctx.close()
  console.log('   listo\n')
}

await precalentar()

const contexto = await navegador.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: SALIDA, size: { width: 1600, height: 900 } },
  locale: 'es-AR',
  timezoneId: 'America/Argentina/Buenos_Aires',
})

// Se inyecta al CARGAR cada pantalla, no después: si se pusiera junto con el cartel, el
// indicador alcanzaría a verse en el video durante el instante que va de la carga a la
// primera parada.
await contexto.addInitScript(css => {
  const poner = () => {
    if (document.getElementById('demo-sin-indicador')) return
    const s = document.createElement('style')
    s.id = 'demo-sin-indicador'
    s.textContent = css
    document.head?.appendChild(s)
  }
  // El `head` puede no existir todavía cuando corre este script.
  if (document.head) poner()
  else document.addEventListener('DOMContentLoaded', poner, { once: true })
}, OCULTAR_INDICADOR_DEV)

const page = await contexto.newPage()
let fallas = 0

/**
 * Un problema que NO tiene sentido reintentar. Una pantalla que cambió de dirección se
 * saltea y el resto del video sirve; una clave equivocada va a fallar las doce veces, y
 * reintentarla solo llena el video de pantallas de login.
 */
class Fatal extends Error {}

/**
 * Entra con un usuario. Se muestra el formulario llenándose porque es parte de lo que se
 * está contando: que cada persona tiene su acceso.
 */
async function entrar(usuario, clave) {
  await page.goto(`${URL_BASE}/login`, { waitUntil: 'networkidle', timeout: 45_000 })
  // Por `id`, no por `type`. El campo de usuario es `type="text"` porque se entra con
  // nombre de usuario y no con una dirección de correo, y el de la clave cambia de
  // `password` a `text` cuando se aprieta el ojito. Buscar por tipo falla en los dos casos.
  await page.locator('#email').fill(usuario)
  await pausa(TIPEO)
  await page.locator('#password').fill(clave)
  await pausa(TIPEO)
  await page.locator('button[type="submit"]').first().click()

  // El timeout es holgado por si el precalentado falló: en ese caso acá se paga la
  // compilación de la pantalla, que puede pasar el minuto.
  const resultado = await esperarIngreso(page, 90_000)
  if (resultado === 'rechazado') throw new Fatal(avisoClave(usuario))
  if (resultado === 'timeout') throw new Fatal(
    `El ingreso de "${usuario}" no terminó ni bien ni mal en 95 segundos.\n`
    + '   Suele ser la app compilando la pantalla por primera vez. Probá de nuevo:\n'
    + '   la segunda corrida encuentra todo compilado.')

  await pausa(TRAS_INGRESAR)
}

/**
 * ¿El navegador ya está mostrando esta pantalla?
 *
 * Se comparan la ruta y los parámetros, que es lo que distingue una pantalla de otra
 * (`/dashboard/ganancias?p=mes` no es lo mismo que `/dashboard/ganancias`). El host no se
 * compara porque siempre es el mismo.
 */
function yaEstamosEn(ruta) {
  try {
    const actual = new URL(page.url())
    const pedida = new URL(ruta, URL_BASE)
    return actual.pathname === pedida.pathname && actual.search === pedida.search
  } catch {
    return false
  }
}

/**
 * Cierra la sesión borrando las cookies, no apretando el botón de salir.
 *
 * El botón sería más fiel, pero vive en un menú que se abre y se cierra, y una grabación
 * guionada no puede depender de eso: si el menú cambia de forma, el recorrido se traba en
 * la mitad. Borrar las cookies logra lo mismo, no se ve en el video, y lo que sí se ve
 * —la pantalla de ingreso— es idéntico.
 */
async function cerrarSesion() {
  await contexto.clearCookies()
}

/**
 * La pantalla de presentación, antes de que se vea la aplicación.
 *
 * Arrancar directo en el login obliga al que mira a entender qué está viendo mientras ya
 * están pasando cosas. Una portada que diga de qué se trata y qué incluye le da el mapa
 * antes de empezar, y de paso da tiempo a que la música entre.
 *
 * Se dibuja en una página en blanco del mismo navegador —no hay una pantalla así en la
 * aplicación— y se arma con los colores del cartel, para que no parezca de otro producto.
 */
/**
 * El fondo de las dos pantallas de texto, la de entrada y la de salida.
 *
 * Es el MISMO de la pantalla de ingreso de la aplicación: así el video empieza y termina
 * dentro del producto y no en dos láminas que podrían ser de cualquier otro.
 */
/** Con qué usuario estamos adentro ahora mismo. */
let sesion = null
/** Si queda cargado, el recorrido se corta y se informa al final. */
let fatal = null

try {
  await mostrarPortada(page, GUION, pausa)

  // Recorrido
  for (const [i, parada] of RECORRIDO.entries()) {
    const n = `${i + 1}/${RECORRIDO.length}`
    try {
      // ¿Hay que cambiar de usuario para esta parada?
      const quiere = parada.como ?? 'staff'
      if (quiere === 'cliente' && !HAY_CLIENTE) {
        console.warn(`   ⚠️  ${n} se saltea: faltan DEMO_CLIENTE_USUARIO y DEMO_CLIENTE_CLAVE`)
        fallas++
        continue
      }
      if (quiere !== sesion) {
        console.log(`→ ${n}  Entrando como ${quiere}…`)
        if (sesion !== null) await cerrarSesion()
        await entrar(
          quiere === 'cliente' ? CLIENTE_USUARIO : USUARIO,
          quiere === 'cliente' ? CLIENTE_CLAVE : CLAVE,
        )
        sesion = quiere
      }

      console.log(`→ ${n}  ${parada.titulo}`)
      // Se navega solo si hace falta. Cuando el ingreso ya dejó la pantalla pedida —el
      // cliente aterriza en su cuenta corriente, el administrador en Inicio— volver a
      // pedirla la cargaba DE NUEVO, y en el video se veía la misma pantalla armándose
      // dos veces seguidas antes de que apareciera el cartel.
      if (parada.ruta && !yaEstamosEn(parada.ruta)) {
        await page.goto(`${URL_BASE}${parada.ruta}`, { waitUntil: 'networkidle', timeout: 45_000 })
        await pausa(RESPIRAR)
      }
      await prepararCartel(page)
      await mostrarCartel(page, parada.titulo, parada.texto)
      await pausa(LEER)
      if (parada.hacer) await parada.hacer(page)
      await pausa(ESPERA_FIJA ?? parada.espera ?? 2500)
      await ocultarCartel(page)
    } catch (e) {
      if (e instanceof Fatal) { fatal = e; break }
      // Una parada que falla no se lleva puesta la grabación entera.
      fallas++
      console.warn(`   ⚠️  ${n} falló y se saltea: ${e.message.split('\n')[0]}`)
    }
  }

  if (!fatal) await mostrarCierre(page, GUION, pausa)
} finally {
  await contexto.close()   // recién acá Playwright escribe el archivo
  await navegador.close()
}

// El corte se informa DESPUÉS de cerrar el contexto, para no dejar el navegador abierto.
if (fatal) salir(fatal.message)

// ── Nombre final ───────────────────────────────────────────────────────────
// Playwright le pone al video un nombre al azar; acá se lo renombra con la fecha.
//
// El más reciente se elige POR FECHA DE ESCRITURA, no por nombre. Ordenar por nombre tenía
// un defecto que costó una tarde: al grabar dos veces el mismo día, en la carpeta quedan
// el video anterior (`demo-AAAA-MM-DD.webm`) y el recién hecho (nombre al azar). Según qué
// letra le tocara al azar, el orden alfabético devolvía el VIEJO, el programa lo anunciaba
// como resultado y el nuevo quedaba ahí con su nombre ilegible. Uno abre el archivo que le
// dijeron y ve la grabación anterior, sin ninguna señal de que algo salió mal.
const webm = readdirSync(SALIDA).filter(f => f.endsWith('.webm')).map(f => join(SALIDA, f))
if (!webm.length) salir('La grabación no produjo ningún archivo.')

const reciente = webm.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs).pop()
const destino = join(SALIDA, `demo-${new Date().toISOString().slice(0, 10)}.webm`)

if (reciente !== destino) {
  // El de la grabación anterior se borra antes de renombrar: es una regrabación del mismo
  // día y lo que importa es que el nombre apunte al video nuevo.
  if (existsSync(destino)) unlinkSync(destino)
  renameSync(reciente, destino)
}

// Los videos sueltos de corridas anteriores confunden: quedan con nombre al azar y nadie
// sabe cuál es cuál. Se van, porque el que vale ya tiene nombre.
for (const f of readdirSync(SALIDA).filter(f => f.endsWith('.webm')).map(f => join(SALIDA, f))) {
  if (f !== destino) { try { unlinkSync(f) } catch {} }
}

console.log(`
✅ Listo: ${destino}
   (grabado recién, a las ${new Date(statSync(destino).mtimeMs).toTimeString().slice(0, 8)})
${fallas ? `\n⚠️  ${fallas} parada(s) se saltearon. Revisá el log de arriba.\n` : ''}
Para pasarlo a MP4 (requiere ffmpeg instalado):

  ffmpeg -y -i "${destino}" -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart \\
    "${destino.replace(/\.webm$/, '.mp4')}"
`)
// El -y es la misma trampa que el nombre del video, un paso más adelante: sin él, ffmpeg
// pregunta si pisa el MP4 que ya está y basta un Enter distraído para quedarse con el de
// la grabación anterior, convencido de estar viendo el nuevo.
