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
import { mkdirSync, existsSync, renameSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, 'salida')

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
  'Faltan DEMO_USUARIO y DEMO_CLAVE: el usuario de la base de DEMOSTRACIÓN.\n'
  + '   Si no lo creaste todavía, está en el paso 2 de docs/NUEVO-CLIENTE.md.')

// ── Tiempos ────────────────────────────────────────────────────────────────
// Más lentos de lo que uno leería solo: el que mira el video no conoce la pantalla y
// necesita ubicarse antes de que el cartel le diga qué mirar.
const LEER = 3200      // cuánto queda un cartel en pantalla
const RESPIRAR = 900   // pausa después de cada acción, para que no se vea atropellado

const pausa = ms => new Promise(r => setTimeout(r, ms))

/**
 * El recorrido. Cada parada: con qué usuario, a dónde ir, qué decir y qué hacer.
 *
 * `como` elige con qué usuario se mira la pantalla: 'staff' (el administrador) o 'cliente'
 * (el cliente de la casa de cambio mirando su propia cuenta). Cuando una parada pide un
 * usuario distinto del que está adentro, el recorrido cierra la sesión y vuelve a entrar.
 * Eso se ve en el video, y conviene que se vea: es parte de lo que se está mostrando.
 *
 * `hacer` es opcional y recibe la página. Todo lo que pueda fallar va envuelto: si una
 * pantalla cambió de nombre, la grabación sigue y se nota en el log, en lugar de cortarse
 * a la mitad y perder los cinco minutos anteriores.
 *
 * EL ORDEN NO ES EL DE LAS PANTALLAS, ES EL DEL ARGUMENTO. Primero quién entra y qué ve
 * cada uno, porque ordena todo lo que viene después. Después lo que el cliente puede hacer
 * solo, que es lo que distingue al producto. Recién entonces la operación diaria. Y al
 * final el control: ganancias y auditoría.
 */
const RECORRIDO = [
  // ── 1. Quién entra y qué ve cada uno ─────────────────────────────────────
  {
    como: 'staff',
    ruta: '/dashboard/admin/usuarios',
    titulo: 'Cada uno ve lo que le toca',
    texto: 'Cuatro roles: operador, administrador, dueño y cliente. El rol decide qué pantallas abre cada persona, y se controla en el servidor — no alcanza con conocer la dirección.',
    espera: 5200,
  },

  // ── 2. Lo que el cliente hace sin llamar a nadie ─────────────────────────
  {
    como: 'cliente',
    ruta: '/dashboard/cuenta-corriente',
    titulo: 'El cliente consulta su cuenta solo',
    texto: 'Entra con su propio usuario y ve su saldo y sus movimientos cuando quiere. Sin llamar ni esperar a que alguien le arme un resumen.',
    espera: 5600,
    hacer: async page => { await pausa(1400); await page.mouse.wheel(0, 420) },
  },
  {
    como: 'cliente',
    ruta: null,
    titulo: 'Y solo la suya',
    texto: 'No ve la caja, ni las demás cuentas, ni cuánto ganó el negocio. El mismo sistema, con otra puerta.',
    espera: 4200,
  },

  // ── 3. La operación diaria ───────────────────────────────────────────────
  {
    como: 'staff',
    ruta: '/dashboard/inicio',
    titulo: 'Todo el dinero, en una pantalla',
    texto: 'Saldos por moneda al instante: lo que hay en caja, lo que está en la calle y lo que debe cada cuenta corriente.',
    espera: 4200,
  },
  {
    como: 'staff',
    ruta: '/dashboard/inicio',
    titulo: 'Las operaciones del día',
    texto: 'Debajo de los saldos, cada movimiento con su impacto. Se filtra por fecha, cliente, tipo o monto.',
    espera: 3800,
    hacer: async page => { await page.mouse.wheel(0, 520); await pausa(1200) },
  },

  // ── 4. Cargar una operación ──────────────────────────────────────────────
  {
    como: 'staff',
    ruta: '/dashboard/nueva-transaccion',
    titulo: 'Cargar una operación',
    texto: 'Se elige el tipo, la moneda y el monto. El sistema calcula el resto.',
    espera: 2600,
  },
  {
    como: 'staff',
    ruta: null,   // sigue en la misma pantalla
    titulo: 'El impacto se ve ANTES de guardar',
    texto: 'Mientras se escribe, la previsualización muestra exactamente cómo queda la caja. Sin sorpresas después.',
    espera: 5200,
    hacer: async page => {
      // Se completa una compra de dólares como la cargaría un operador.
      const escribir = async (sel, valor) => {
        const campo = page.locator(sel).first()
        if (await campo.count()) { await campo.click(); await campo.fill(valor); await pausa(420) }
      }
      await escribir('input[placeholder="Nombre del cliente"]', 'J. MARTINEZ')
      await escribir('input[inputmode="decimal"]', '5000')
      await pausa(900)
      await page.mouse.wheel(0, 420)
    },
  },

  // ── 5. Transferencias ────────────────────────────────────────────────────
  {
    como: 'staff',
    ruta: '/dashboard/transferencias',
    titulo: 'Transferencias',
    texto: 'Las dos patas se cargan juntas, así no quedan operaciones a medio registrar. La ganancia se computa cuando la transferencia se cierra, no antes.',
    espera: 5200,
  },

  // ── 6. Gastos ────────────────────────────────────────────────────────────
  {
    como: 'staff',
    ruta: '/dashboard/gastos',
    titulo: 'Los gastos también salen de la caja',
    texto: 'Alquiler, sueldos, servicios. Se cargan acá y descuentan del saldo igual que cualquier otra salida: lo que muestra la caja ya los tiene adentro.',
    espera: 4800,
    hacer: async page => { await pausa(1400); await page.mouse.wheel(0, 380) },
  },

  // ── 7. Resultado ─────────────────────────────────────────────────────────
  {
    como: 'staff',
    ruta: '/dashboard/ganancias',
    titulo: 'Cuánto se ganó',
    texto: 'Por día, semana, mes o año. Y el detalle de cómo se llegó a ese número, abierto paso a paso.',
    espera: 5200,
    hacer: async page => { await pausa(1600); await page.mouse.wheel(0, 380) },
  },

  // ── 8. Control ───────────────────────────────────────────────────────────
  {
    como: 'staff',
    ruta: '/dashboard/admin/auditoria',
    titulo: 'Quién hizo qué, y cuándo',
    texto: 'Cada alta, cada corrección y cada borrado queda registrado con su autor y su hora.',
    espera: 4600,
  },
  {
    como: 'staff',
    ruta: null,
    titulo: 'Y qué decía antes',
    texto: 'En una corrección se guardan los dos valores, el viejo y el nuevo. El registro no se puede editar ni borrar: la base lo impide.',
    espera: 5200,
    hacer: async page => { await pausa(1200); await page.mouse.wheel(0, 420) },
  },
]

// ── Cartel sobreimpreso ────────────────────────────────────────────────────
// Se dibuja DENTRO de la página porque Playwright graba lo que el navegador muestra: un
// cartel puesto por fuera no saldría en el video.
// Los nombres de clase van con prefijo PROPIO y el cartel se resetea a mano. No es
// prolijidad: `.t` chocó con una clase `.t` de la página y el título salió pintado como un
// rectángulo blanco —el fondo y el borde redondeado de la otra regla— durante toda una
// grabación. El cartel se inyecta en una página que no controla este archivo, así que no
// puede dar por sentado que hereda nada.
const ESTILOS = `
  #demo-cartel {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
    margin: 0; padding: 62px 40px 30px; border: 0; border-radius: 0;
    /* El tramo opaco tiene que tapar el título entero: con el degradado arrancando más
       abajo, el título caía sobre la parte clara de la pantalla y el blanco sobre blanco
       no se leía. El desvanecido vive en el padding de arriba, donde no hay texto. */
    background: linear-gradient(to top, rgba(8,13,24,.97) 78%, rgba(8,13,24,0));
    color: #fff; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
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
  await pausa(500)
}

// ── Grabación ──────────────────────────────────────────────────────────────
console.log(`\n🎬 Grabando contra ${URL_BASE}\n`)
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

const contexto = await navegador.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: SALIDA, size: { width: 1600, height: 900 } },
  locale: 'es-AR',
  timezoneId: 'America/Argentina/Buenos_Aires',
})

const page = await contexto.newPage()
let fallas = 0

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
  await pausa(500)
  await page.locator('#password').fill(clave)
  await pausa(500)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL('**/dashboard**', { timeout: 30_000 })
  await pausa(1800)
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

/** Con qué usuario estamos adentro ahora mismo. */
let sesion = null

try {
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
      if (parada.ruta) {
        await page.goto(`${URL_BASE}${parada.ruta}`, { waitUntil: 'networkidle', timeout: 45_000 })
        await pausa(RESPIRAR)
      }
      await prepararCartel(page)
      await mostrarCartel(page, parada.titulo, parada.texto)
      await pausa(LEER)
      if (parada.hacer) await parada.hacer(page)
      await pausa(parada.espera ?? 2500)
      await ocultarCartel(page)
    } catch (e) {
      // Una parada que falla no se lleva puesta la grabación entera.
      fallas++
      console.warn(`   ⚠️  ${n} falló y se saltea: ${e.message.split('\n')[0]}`)
    }
  }

  // Cierre
  await prepararCartel(page)
  await mostrarCartel(page, 'Todo en un solo lugar',
    'Caja, cuentas corrientes, transferencias y resultados. Sin planillas sueltas.')
  await pausa(4200)
} finally {
  await contexto.close()   // recién acá Playwright escribe el archivo
  await navegador.close()
}

// ── Nombre final ───────────────────────────────────────────────────────────
const webm = readdirSync(SALIDA).filter(f => f.endsWith('.webm')).map(f => join(SALIDA, f))
if (!webm.length) salir('La grabación no produjo ningún archivo.')

const reciente = webm.sort().pop()
const destino = join(SALIDA, `demo-${new Date().toISOString().slice(0, 10)}.webm`)
if (existsSync(destino) && destino !== reciente) { /* se pisa, es una regrabación */ }
if (reciente !== destino) renameSync(reciente, destino)

console.log(`
✅ Listo: ${destino}
${fallas ? `\n⚠️  ${fallas} parada(s) se saltearon. Revisá el log de arriba.\n` : ''}
Para pasarlo a MP4 (requiere ffmpeg instalado):

  ffmpeg -i "${destino}" -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart \\
    "${destino.replace(/\.webm$/, '.mp4')}"
`)
