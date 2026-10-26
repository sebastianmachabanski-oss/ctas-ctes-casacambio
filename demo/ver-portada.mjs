/**
 * Saca una foto de la portada, sin grabar el video.
 *
 *   npm run portada
 *
 * PARA QUÉ
 * Ajustar la portada —un título más corto, un punto de más, otro color— es cuestión de
 * probar. Probar grabando los cuatro minutos enteros y después convirtiendo a MP4 hace
 * que uno no pruebe: deja lo primero que salió. Esto responde en segundos y no necesita
 * la aplicación levantada.
 *
 * Dibuja EXACTAMENTE la misma portada que el grabador, reusando su función en vez de
 * copiarla. Una copia se despega del original y termina mostrando algo que no es lo que
 * va a salir en el video, que es peor que no tener vista previa.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { leerGuion } from './leer-guion.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, 'salida')
const DESTINO = process.argv[2] || join(SALIDA, 'portada.png')

const fuente = readFileSync(join(AQUI, 'grabar-demo.mjs'), 'utf8')
const GUION = leerGuion()

if (!GUION.portada) {
  console.error('\n❌ El guion no tiene bloque "portada".\n')
  process.exit(1)
}

// Se recortan del grabador las dos funciones y el fondo que comparten, para dibujar
// EXACTAMENTE lo que va a salir en el video. Copiarlas acá seria garantizar que en algun
// momento la vista previa muestre algo distinto de lo grabado.
const trozo = (desde, hasta) => fuente.slice(fuente.indexOf(desde), fuente.indexOf(hasta))
const FONDO = trozo('const FONDO_LAMINA = `', '/**\n * La pantalla de cierre')
const CIERRE = trozo('async function mostrarCierre() {', 'async function mostrarPortada() {')
const PORTADA = trozo('async function mostrarPortada() {', '/** Con qué usuario estamos adentro ahora mismo. */')

mkdirSync(SALIDA, { recursive: true })
const navegador = await chromium.launch({
  headless: true,
  ...(process.env.DEMO_CHROMIUM ? { executablePath: process.env.DEMO_CHROMIUM } : {}),
})
const page = await (await navegador.newContext({ viewport: { width: 1600, height: 900 } })).newPage()

/** Dibuja una de las dos láminas y saca la foto. La pausa se anula: acá solo se dibuja. */
async function foto(nombre, cuerpo, marca, archivo) {
  const dibujar = new Function('GUION', 'page', 'pausa', 'FONDO_LAMINA',
    `return (${cuerpo.replace(marca, 'async function () {')})()`)
  const fondo = new Function(`${FONDO}\nreturn FONDO_LAMINA`)()
  await dibujar(GUION, page, async () => {}, fondo)
  // Lo justo para que terminen las animaciones de entrada.
  await new Promise(r => setTimeout(r, 2500))
  await page.screenshot({ path: archivo })
  console.log(`   ${nombre}: ${archivo}`)
}

console.log('')
await foto('Entrada', PORTADA, 'async function mostrarPortada() {', DESTINO)
if (GUION.cierre) {
  await foto('Salida ', CIERRE, 'async function mostrarCierre() {', DESTINO.replace(/\.png$/, '-cierre.png'))
}
await navegador.close()

console.log('\n   Miralas, y si algo no entra ajustá guion.json y volvé a correr esto.\n')
