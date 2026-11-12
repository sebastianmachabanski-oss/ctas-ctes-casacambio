/**
 * Saca una captura de la pantalla de Inicio con los datos de DEMOSTRACIÓN.
 *
 *   cd demo && npm run captura
 *
 * ── PARA QUÉ ───────────────────────────────────────────────────────────────
 * Para el material de venta. Un dibujo de la pantalla, por prolijo que salga, es un dibujo:
 * si el folleto dice "así se ve el sistema" y lo que muestra no es el sistema, la primera
 * demostración lo desmiente. Una captura de verdad no tiene ese problema, y además se
 * actualiza sola cada vez que la pantalla cambia — basta volver a correr esto.
 *
 * ── LA MISMA GUARDA QUE EL GRABADOR ────────────────────────────────────────
 * Solo contra `localhost`, y con el usuario de la base de DEMOSTRACIÓN. Nunca contra la
 * aplicación de un cliente con sus datos verdaderos: una captura con nombres y saldos
 * reales en un folleto es un problema del que no se vuelve.
 *
 * ── QUÉ DEJA ───────────────────────────────────────────────────────────────
 *   demo/salida/inicio.png          lo que se ve al entrar, sin barras del navegador
 *   demo/salida/inicio-completa.png la pantalla entera, por si hace falta recortar otra cosa
 *
 * Al doble de resolución, para que en papel no se vea pixelada.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cargarCredenciales, ARCHIVO as ARCHIVO_CREDENCIALES } from './credenciales.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, 'salida')

cargarCredenciales()

const URL_BASE = process.env.DEMO_URL ?? 'http://localhost:3000'
const USUARIO = process.env.DEMO_USUARIO
const CLAVE = process.env.DEMO_CLAVE
/** Qué pantalla capturar. Por defecto Inicio, que es la que va en el folleto. */
const RUTA = process.env.DEMO_RUTA ?? '/dashboard/inicio'

function salir(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1) }

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(URL_BASE)) salir(
  `Solo se captura contra localhost, y DEMO_URL es "${URL_BASE}".\n`
  + '   Es a propósito: una captura de la app de un cliente, con sus nombres y saldos\n'
  + '   verdaderos, no puede terminar en un folleto.')

if (!USUARIO || !CLAVE) salir(
  'Faltan DEMO_USUARIO y DEMO_CLAVE: el usuario de la base de DEMOSTRACIÓN.\n\n'
  + `   Se ponen en ${ARCHIVO_CREDENCIALES} (ver demo/credenciales.local.ejemplo).`)

try {
  await fetch(`${URL_BASE}/login`, { signal: AbortSignal.timeout(8_000) })
} catch {
  salir(`No hay nada escuchando en ${URL_BASE}.\n\n`
    + '   Levantá la aplicación en OTRA ventana:\n'
    + '     cd ..\n'
    + '     npm run dev')
}

mkdirSync(SALIDA, { recursive: true })

// El cartelito de Next ("2 errores", el rayo de compilación) solo existe en modo
// desarrollo, pero la captura se saca contra modo desarrollo: saldría en el folleto.
const OCULTAR_INDICADOR_DEV = `
  nextjs-portal,
  [data-nextjs-toast],
  [data-nextjs-dialog-overlay],
  #__next-build-watcher,
  #__next-prerender-indicator { display: none !important; }
`

const navegador = await chromium.launch({ headless: process.env.DEMO_HEADLESS !== '0' })
const contexto = await navegador.newContext({
  viewport: { width: 1600, height: 900 },
  // Al doble: una captura a tamaño justo se ve pixelada impresa y en pantallas buenas.
  deviceScaleFactor: 2,
  locale: 'es-AR',
  timezoneId: 'America/Argentina/Buenos_Aires',
})
await contexto.addInitScript(css => {
  const poner = () => {
    if (document.getElementById('demo-sin-indicador')) return
    const s = document.createElement('style')
    s.id = 'demo-sin-indicador'
    s.textContent = css
    document.head?.appendChild(s)
  }
  if (document.head) poner()
  else document.addEventListener('DOMContentLoaded', poner, { once: true })
}, OCULTAR_INDICADOR_DEV)

const page = await contexto.newPage()

try {
  console.log(`\n📷 Entrando a ${URL_BASE} como ${USUARIO}…`)
  await page.goto(`${URL_BASE}/login`, { waitUntil: 'networkidle', timeout: 120_000 })
  // Por `id`: el campo de usuario es type="text" (se entra con nombre, no con correo) y el
  // de la clave cambia de type cuando se aprieta el ojito. Buscar por tipo falla en los dos.
  await page.locator('#email').fill(USUARIO)
  await page.locator('#password').fill(CLAVE)
  await page.locator('button[type="submit"]').first().click()

  const entro = await Promise.race([
    page.waitForURL('**/dashboard**', { timeout: 120_000 }).then(() => 'ok').catch(() => 'timeout'),
    page.getByText(/usuario o contraseña incorrectos/i).first()
      .waitFor({ state: 'visible', timeout: 120_000 }).then(() => 'rechazado').catch(() => new Promise(() => {})),
  ])
  if (entro === 'rechazado') salir(
    `La app rechazó el ingreso de "${USUARIO}": usuario o contraseña incorrectos.\n`
    + '   En PowerShell, una clave con $ entre comillas DOBLES llega cortada.\n'
    + "   Con comillas simples no pasa:  $env:DEMO_CLAVE='tu-clave'")
  if (entro === 'timeout') salir('El ingreso no terminó en dos minutos. Probá de nuevo: la primera vez se paga la compilación de la pantalla.')

  console.log(`   entrando a ${RUTA}…`)
  await page.goto(`${URL_BASE}${RUTA}`, { waitUntil: 'networkidle', timeout: 120_000 })
  // Un respiro para que terminen las animaciones de entrada y la banda de cotizaciones.
  await new Promise(r => setTimeout(r, 2500))
  await page.evaluate(() => window.scrollTo(0, 0))

  const visible = join(SALIDA, 'inicio.png')
  const completa = join(SALIDA, 'inicio-completa.png')
  await page.screenshot({ path: visible })
  await page.screenshot({ path: completa, fullPage: true })

  console.log(`\n✅ Listo:\n   ${visible}\n   ${completa}\n`)
  console.log('   La primera es la que va en el folleto: las tarjetas de saldos y el')
  console.log('   comienzo del listado, sin barras del navegador.\n')
} finally {
  await contexto.close()
  await navegador.close()
}
