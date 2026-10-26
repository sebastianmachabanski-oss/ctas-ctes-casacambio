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
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, 'salida')
const DESTINO = process.argv[2] || join(SALIDA, 'portada.png')

const fuente = readFileSync(join(AQUI, 'grabar-demo.mjs'), 'utf8')
let GUION
try {
  GUION = JSON.parse(readFileSync(join(AQUI, 'guion.json'), 'utf8'))
} catch (e) {
  console.error(`\n❌ El guion está mal escrito:\n   ${e.message}\n`)
  process.exit(1)
}
if (!GUION.portada) {
  console.error('\n❌ El guion no tiene bloque "portada".\n')
  process.exit(1)
}

const DESDE = 'async function mostrarPortada() {'
const HASTA = '/** Con qué usuario estamos adentro ahora mismo. */'
const cuerpo = fuente.slice(fuente.indexOf(DESDE), fuente.indexOf(HASTA))

mkdirSync(SALIDA, { recursive: true })
const navegador = await chromium.launch({
  headless: true,
  ...(process.env.DEMO_CHROMIUM ? { executablePath: process.env.DEMO_CHROMIUM } : {}),
})
const page = await (await navegador.newContext({ viewport: { width: 1600, height: 900 } })).newPage()

const mostrar = new Function('GUION', 'page', 'pausa',
  `return (${cuerpo.replace(DESDE, 'async function () {')})()`)
// La pausa se anula: acá no hay que esperar los doce segundos, solo dibujar.
await mostrar(GUION, page, async () => {})
// Lo justo para que terminen las animaciones de entrada.
await new Promise(r => setTimeout(r, 2500))
await page.screenshot({ path: DESTINO })
await navegador.close()

console.log(`\n✅ Portada: ${DESTINO}\n   Abrila, mirá si entra todo, y si no ajustá guion.json y volvé a correr esto.\n`)
