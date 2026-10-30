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
import { leerGuion, ARCHIVO_GUION, duracionDeParada } from './leer-guion.mjs'
import { mostrarPortada, mostrarCierre, mostrarLamina, mostrarEtiqueta } from './laminas.mjs'
import { planDeVoz } from './pistas-voz.mjs'

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
/** Lo mínimo que una pantalla tiene que quedar a la vista, aunque haya tardado en cargar. */
const MINIMO_VISIBLE = T.minimoVisible ?? 700

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

// ── El relato manda el ritmo ───────────────────────────────────────────────
// Si está el archivo de voz, el video se arma siguiéndolo: cada pantalla aparece en el
// segundo en que la voz empieza a hablar de ella. Ver demo/pistas-voz.mjs.
//
// Sin archivo de voz —o con DEMO_ESPERA puesta, que es un pedido explícito de otra cosa—
// se vuelve al cálculo por palabras de antes. Sincroniza peor, pero sigue sirviendo para
// probar el recorrido sin tener la voz todavía.
const PLAN = ESPERA_FIJA ? null : await planDeVoz(GUION, { dir: AQUI })
if (PLAN?.aviso) {
  console.warn(`\n⚠️  Hay archivo de voz (${PLAN.archivo.split(/[/\\]/).pop()}) pero NO se puede seguir:`)
  console.warn(`   ${PLAN.aviso}`)
  console.warn('   Se graba con los tiempos calculados del texto, que no van a coincidir.\n')
}
/** El plan solo se usa si se pudo armar entero. */
const VOZ = PLAN && !PLAN.aviso ? PLAN : null

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
   ritmo:  ${ESPERA_FIJA
    ? `${ESPERA_FIJA} ms en TODAS las paradas (DEMO_ESPERA)`
    : VOZ
      ? `el del relato: ${VOZ.archivo.split(/[/\\]/).pop()}, ${VOZ.duracion.toFixed(1).replace('.', ',')} s medidos`
      : 'calculado del texto (no hay archivo de voz en demo/)'}
   paradas: ${RECORRIDO.length}
`)
if (VOZ) {
  // Se imprime el reparto antes de grabar. Es lo único que delata un emparejamiento
  // equivocado sin tener que hacer el video y mirarlo.
  console.log('   Cada pantalla, en el segundo del relato:\n')
  for (const r of VOZ.renglones) {
    console.log(`     ${r.aparece.toFixed(1).padStart(5)}s → ${r.hasta.toFixed(1).padStart(5)}s  ${String(r.titulo).padEnd(30)} «${r.voz}»`)
  }
  console.log('')
}

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

/**
 * Lo que tarda cada pantalla en aparecer, MEDIDO, no estimado.
 *
 * Sirve para empezar a pedirla antes de que le toque. Ver PEDIR ANTES, más abajo.
 */
const CARGAS = new Map()

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
      // Segunda vuelta, YA COMPILADO y con el mismo criterio que usa la grabación. Esto es
      // lo que tarda de verdad cada pantalla contra la base, y es el dato con el que se
      // decide cuánto antes hay que pedirla. La primera vuelta no sirve para medir: incluye
      // la compilación, que no se vuelve a pagar.
      for (const r of destinos) {
        const desde = Date.now()
        await p.goto(`${URL_BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => {})
        CARGAS.set(r, Math.max(CARGAS.get(r) ?? 0, Date.now() - desde))
      }
      // Se guarda la sesión ya iniciada. Ver SESIONES, más abajo.
      const guardado = await ctx.storageState()
      await ctx.clearCookies()
      return guardado
    } catch (e) {
      // Que falle el precalentado no justifica abortar: se graba igual, más lento.
      console.warn(`   ⚠️  precalentado incompleto: ${e.message.split('\n')[0]}`)
    }
  }

  console.log('→ Precalentando las pantallas (no se graba)…')
  const staff = await visitar(USUARIO, CLAVE, rutas)
  const cliente = HAY_CLIENTE
    ? await visitar(CLIENTE_USUARIO, CLIENTE_CLAVE, ['/dashboard/cuenta-corriente'])
    : null
  await ctx.close()
  if (CARGAS.size) {
    const peor = [...CARGAS.entries()].sort((a, b) => b[1] - a[1])[0]
    console.log(`   listo · la más lenta es ${peor[0]} con ${(peor[1] / 1000).toFixed(1).replace('.', ',')} s de carga\n`)
  } else {
    console.log('   listo\n')
  }
  return { staff, cliente }
}

const SESIONES = await precalentar()

/**
 * SESIONES
 *
 * El contexto que graba arranca con la sesión del administrador YA iniciada, y el cambio
 * al usuario del cliente se hace poniéndole las cookies de la otra sesión, no entrando de
 * nuevo por la pantalla de ingreso.
 *
 * POR QUÉ
 * Cada ingreso son cuatro o cinco segundos de video mirando un formulario que se llena
 * solo. En un recorrido de dos minutos se tolera; en uno de cuarenta y cinco segundos son
 * veinte por ciento del aviso gastados en algo que no muestra el producto.
 *
 * Las dos sesiones se consiguen en el precalentado, que no se graba. Si por lo que sea no
 * se consiguieron, el recorrido entra por la pantalla de ingreso como antes.
 */
const contexto = await navegador.newContext({
  viewport: { width: 1600, height: 900 },
  ...(SESIONES.staff ? { storageState: SESIONES.staff } : {}),
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

/**
 * EL SEGUNDO CERO DEL VIDEO.
 *
 * Playwright empieza a grabar al crear la página, así que este instante es el comienzo del
 * archivo — y también el comienzo del relato, porque `npm run mp4` pega el audio desde el
 * principio del video.
 *
 * Tener un cero común es lo que permite trabajar con momentos ABSOLUTOS en lugar de
 * duraciones encadenadas, y es lo único que evita que los errores se sumen: cada pantalla
 * tiene su segundo de aparición fijo, así que una que tarda de más no corre a las demás.
 *
 * Se toma ANTES de pedir la página y no después: `newPage()` tarda medio segundo en
 * volver, y la cámara ya está grabando durante ese rato. Tomándolo después, todo el video
 * quedaba medio segundo corrido respecto del audio — poco, pero del lado que se nota,
 * porque la voz entraba antes que la imagen.
 */
const T0 = Date.now()
const page = await contexto.newPage()

/** Cuánto se corre el audio respecto del video, si hiciera falta. En general, nada. */
const DESFASE = T.desfaseVoz ?? 0

/**
 * Espera hasta el segundo `cuando` del video. Devuelve lo que sobró —negativo si se
 * llegó tarde—, que es el dato con el que se avisa al final.
 */
async function esperarHasta(cuando) {
  const sobra = T0 + Math.round(cuando * 1000) + DESFASE - Date.now()
  if (sobra > 0) await pausa(sobra)
  return sobra
}

// ── PEDIR ANTES ────────────────────────────────────────────────────────────
// Sincronizar con la voz no alcanza si la pantalla tarda tres segundos en aparecer y su
// frase dura tres y medio: se ve medio segundo y pasa como un parpadeo. Es lo que se vio en
// el video: "las pantallas están pasando rápido".
//
// Dentro del compás no hay nada que hacer —ese tiempo ya está gastado—, así que la pantalla
// se pide ANTES, durante el final de la anterior. Mientras el servidor contesta, el
// navegador sigue mostrando la pantalla vieja; cuando contesta, la nueva aparece. No hay
// parpadeo en blanco, y las dos se ven el tiempo que les toca.
//
// Cuánto antes lo dice la medición del precalentado, no una estimación.

/** Lo que se le suma a la carga medida, por si esta vez tarda un poco más. */
const COJIN = T.cojinVoz ?? 250

/**
 * ¿La parada `i` va a tener que pedirle la pantalla al servidor?
 *
 * Si no —porque ya está en esa misma pantalla— no hay nada que adelantar, y adelantarlo
 * igual le robaría tiempo a la anterior sin ganar nada.
 */
function pedirAlServidor(i) {
  const p = RECORRIDO[i]
  if (!p || p.tipo === 'lamina' || !p.ruta) return false
  const anterior = RECORRIDO[i - 1]
  if (!anterior) return true                                            // la primera
  if (anterior.tipo === 'lamina') return true                           // la lámina tapó la página
  if ((anterior.como ?? 'staff') !== (p.como ?? 'staff')) return true   // cambió el usuario
  return anterior.ruta !== p.ruta
}

/** Lo mínimo que algo tiene que quedar a la vista antes de empezar a pedir lo que sigue. */
const MIN_EN_PANTALLA = T.minimoEnPantalla ?? 1200

/**
 * En qué segundo del video hay que EMPEZAR A PEDIR la parada `i`, para que aparezca
 * justo en `cuando` —el segundo en que la voz empieza a hablar de ella—.
 *
 * PEDIR UNA PANTALLA NO LA PONE EN PANTALLA. Mientras el servidor contesta se sigue viendo
 * la anterior; recién cambia cuando llega la respuesta. Así que adelantarse no le saca ni
 * un instante a lo que se está viendo, y el tope no va sobre cuándo se pide sino sobre
 * cuándo APARECE: lo de antes tiene que haberse visto su rato.
 *
 * El primer intento ponía el tope sobre el momento de pedir, que es lo que parece de
 * sentido común y es justamente al revés: la portada se guardaba 1,2 s que no le servían
 * de nada y la primera pantalla entraba medio segundo tarde, con la voz ya hablando.
 */
function momentoDePedir(i, cuando) {
  if (!pedirAlServidor(i)) return cuando
  const carga = ((CARGAS.get(RECORRIDO[i].ruta) ?? 1200) + COJIN) / 1000
  const visto = enPantalla ? (enPantalla.desde - T0) / 1000 : 0
  // Que lo de antes haya estado su mínimo A LA VISTA, descontando lo que tarda la carga.
  const piso = visto + MIN_EN_PANTALLA / 1000 - carga
  return Math.max(0, Math.min(Math.max(cuando - carga, piso), cuando))
}

/**
 * Cuánto se vio de verdad cada cosa.
 *
 * Se mide de aparición a aparición y no por lo que se esperó: desde que las pantallas se
 * piden antes de tiempo, la anterior sigue a la vista mientras la siguiente carga, y
 * contarlo de otra manera informaría pantallas como invisibles cuando se vieron bien.
 */
let enPantalla = null
function marcar(titulo, previsto, carga = 0) {
  if (enPantalla?.carga) {
    const visible = (Date.now() - enPantalla.desde) / 1000
    if (visible < MINIMO_VISIBLE / 1000) lentas.push({ ...enPantalla, visible })
  }
  enPantalla = { parada: titulo, previsto, carga, desde: Date.now() }
}

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
/** Con qué usuario estamos adentro ahora mismo. Si el precalentado dejó la sesión del
 *  administrador puesta, el recorrido ya empieza adentro. */
let sesion = SESIONES.staff ? 'staff' : null
/** Si queda cargado, el recorrido se corta y se informa al final. */
let fatal = null
/** Si lo último que se dibujó fue una lámina, la pantalla siguiente hay que volver a pedirla. */
let laminaEnPantalla = false
/** Pantallas que tardaron más en cargar que lo que duraban: se informan al final. */
const lentas = []

try {
  // Con relato, la portada no dura lo que dice el guion sino hasta que la voz empieza a
  // hablar de la primera pantalla. Se le pasa espera 0 y se espera acá, contra el reloj
  // del video.
  const portada = VOZ?.de('portada')
  await mostrarPortada(page, portada ? { ...GUION, portada: { ...GUION.portada, espera: 0 } } : GUION, pausa)
  if (portada) {
    marcar('PORTADA', portada.dura)
    await esperarHasta(momentoDePedir(0, portada.hasta))
  }

  // Recorrido
  for (const [i, parada] of RECORRIDO.entries()) {
    const n = `${i + 1}/${RECORRIDO.length}`
    /** El renglón de relato de esta parada, cuando el ritmo lo manda la voz. */
    const compas = VOZ?.porParada.get(i)
    try {
      // ¿Hay que cambiar de usuario para esta parada?
      const quiere = parada.como ?? 'staff'
      if (quiere === 'cliente' && !HAY_CLIENTE) {
        console.warn(`   ⚠️  ${n} se saltea: faltan DEMO_CLIENTE_USUARIO y DEMO_CLIENTE_CLAVE`)
        fallas++
        continue
      }
      if (quiere !== sesion) {
        const guardada = quiere === 'cliente' ? SESIONES.cliente : SESIONES.staff
        if (guardada) {
          // Se cambia de usuario poniendo las cookies de la otra sesión. No se ve nada:
          // la pantalla siguiente ya aparece con el usuario nuevo.
          console.log(`→ ${n}  Cambiando a ${quiere} (sin pasar por el ingreso)`)
          await contexto.clearCookies()
          await contexto.addCookies(guardada.cookies)
          laminaEnPantalla = true   // obliga a volver a pedir la pantalla
        } else {
          console.log(`→ ${n}  Entrando como ${quiere}…`)
          if (sesion !== null) await cerrarSesion()
          await entrar(
            quiere === 'cliente' ? CLIENTE_USUARIO : USUARIO,
            quiere === 'cliente' ? CLIENTE_CLAVE : CLAVE,
          )
        }
        sesion = quiere
      }

      console.log(`→ ${n}  ${parada.seccion ? `[${parada.seccion}] ` : ''}${parada.titulo}`)

      // Una LÁMINA no muestra la aplicación: anuncia la sección que viene. Se dibuja
      // sobre la misma página, así que después hay que volver a pedir la pantalla aunque
      // el navegador crea que ya está ahí.
      if (parada.tipo === 'lamina') {
        await mostrarLamina(page, {
          ...parada,
          espera: compas ? 0 : ESPERA_FIJA ?? duracionDeParada(parada, T),
        }, pausa)
        laminaEnPantalla = true
        if (compas) {
          marcar(parada.titulo, compas.dura)
          await esperarHasta(momentoDePedir(i + 1, compas.hasta))
        }
        continue
      }

      // Se navega solo si hace falta. Cuando el ingreso ya dejó la pantalla pedida —el
      // cliente aterriza en su cuenta corriente, el administrador en Inicio— volver a
      // pedirla la cargaba DE NUEVO, y en el video se veía la misma pantalla armándose
      // dos veces seguidas antes de que apareciera el cartel.
      //
      // EL RELOJ DE LA PARADA ARRANCA ACÁ, ANTES DE PEDIR LA PANTALLA.
      //
      // Este es el punto donde se arruinaba la sincronización con el relato. Antes se
      // esperaba a que la pantalla cargara y RECIÉN AHÍ empezaba a contar su duración, así
      // que lo que tardaba en cargar se sumaba por fuera. Contra una base de verdad eso
      // son dos a cuatro segundos por pantalla: ocho pantallas convirtieron un video de
      // 46 segundos en uno de 75, con el relato terminando treinta segundos antes que la
      // imagen. En mi máquina no se veía, porque la aplicación de prueba responde al
      // instante — el defecto solo aparecía con datos reales.
      //
      // Contando desde acá, la parada dura lo mismo en cualquier máquina: lo que tarde la
      // carga se descuenta de su tiempo en pantalla, no se agrega al video.
      const arranque = Date.now()

      if (parada.ruta && (laminaEnPantalla || !yaEstamosEn(parada.ruta))) {
        // `domcontentloaded` y no `networkidle`: la aplicación dibuja la pantalla en el
        // servidor, así que cuando llega el documento YA se ve con sus datos. Esperar a
        // que no quede ni un pedido en vuelo agrega segundos que no cambian lo que se ve
        // —hay un sondeo periódico que nunca deja la red del todo quieta—.
        await page.goto(`${URL_BASE}${parada.ruta}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await pausa(RESPIRAR)
      }
      laminaEnPantalla = false
      if (compas) marcar(parada.titulo, compas.dura, (Date.now() - arranque) / 1000)

      // Dos maneras de presentar una pantalla, según para qué esté:
      //  · con `texto`, el cartel grande de siempre, para lo que hay que explicar;
      //  · con `etiqueta`, solo el nombre en un rincón, para las que pasan rápido
      //    después de una lámina que ya dijo lo que se va a ver. Un cartel grande ahí
      //    taparía justo lo que se quiere mostrar, y nadie llega a leerlo.
      await mostrarEtiqueta(page, parada.etiqueta)
      if (parada.texto) {
        await prepararCartel(page)
        await mostrarCartel(page, parada.titulo, parada.texto)
        await pausa(LEER)
      }
      if (parada.hacer) await parada.hacer(page)

      if (compas) {
        // CON RELATO: se espera hasta el segundo del video en que arranca la frase
        // siguiente. No se encadena ninguna duración, así que una pantalla lenta no corre
        // a las que vienen: se come su propio tiempo y nada más.
        //
        // Tampoco se le garantiza un mínimo en pantalla, y es a propósito. Un mínimo acá
        // volvería a correr todo lo que sigue —medio segundo por pantalla, ocho pantallas,
        // y la voz otra vez hablando sobre la imagen equivocada—. Si una pantalla no llega
        // a verse, el arreglo es alargar su frase en el guion, y para eso se avisa abajo.
        await esperarHasta(momentoDePedir(i + 1, compas.hasta))
      } else {
        // SIN RELATO: lo que ya se consumió cargando y actuando se descuenta. El mínimo
        // existe para que una pantalla lenta igual llegue a verse: mejor perder medio
        // segundo de sincronía que mostrar un parpadeo.
        const total = ESPERA_FIJA ?? duracionDeParada(parada, T)
        const consumido = Date.now() - arranque
        if (consumido > total) {
          lentas.push({ parada: parada.titulo, visible: MINIMO_VISIBLE / 1000, previsto: total / 1000, carga: consumido / 1000 })
        }
        await pausa(Math.max(MINIMO_VISIBLE, total - consumido))
      }
      if (parada.texto) await ocultarCartel(page)
    } catch (e) {
      if (e instanceof Fatal) { fatal = e; break }
      // Una parada que falla no se lleva puesta la grabación entera.
      fallas++
      console.warn(`   ⚠️  ${n} falló y se saltea: ${e.message.split('\n')[0]}`)
    }
  }

  if (!fatal) {
    // El cierre se queda hasta que termine la voz, más la colita de silencio. Así la
    // última imagen del video es el mensaje final y no una pantalla cualquiera.
    const cierre = VOZ?.de('cierre')
    if (cierre) marcar('CIERRE', cierre.dura)
    await mostrarCierre(page, cierre ? { ...GUION, cierre: { ...GUION.cierre, espera: 0 } } : GUION, pausa)
    if (cierre) await esperarHasta(VOZ.fin)
  }
  // Cierra la cuenta de la última cosa que quedó en pantalla.
  marcar(null, 0)
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

if (lentas.length) {
  const s = n => n.toFixed(1).replace('.', ',')
  console.log(`\n⚠️  ${lentas.length} pantalla(s) tardaron MÁS en cargar que lo que les toca en el video.`)
  console.log(VOZ
    ? '   El relato NO se corre por eso —cada pantalla tiene su segundo fijo—, pero esas\n   se ven muy poco:\n'
    : '   Se ven lo mínimo y el video se alarga, así que el relato se va corriendo:\n')
  for (const l of lentas) {
    console.log(`     ${String(l.parada).padEnd(30)} cargó en ${s(l.carga)} s · le tocaban ${s(l.previsto)} s · se vio ${s(l.visible)} s`)
  }
  console.log(VOZ
    ? '\n   El arreglo es darle más relato a esa frase: alargá su "voz" en el guion,\n   volvé a generar la narración y grabá de nuevo.\n'
    : '\n   Alargá esas paradas en el guion, o acortá el relato de esa frase.\n')
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
