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
import { mkdirSync } from 'node:fs'
import { leerGuion } from './leer-guion.mjs'
import { mostrarPortada, mostrarCierre } from './laminas.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, 'salida')
const DESTINO = process.argv[2] || join(SALIDA, 'portada.png')

const GUION = leerGuion()

if (!GUION.portada) {
  console.error('\n❌ El guion no tiene bloque "portada".\n')
  process.exit(1)
}

mkdirSync(SALIDA, { recursive: true })
const navegador = await chromium.launch({
  headless: true,
  ...(process.env.DEMO_CHROMIUM ? { executablePath: process.env.DEMO_CHROMIUM } : {}),
})
const page = await (await navegador.newContext({ viewport: { width: 1600, height: 900 } })).newPage()

/** Dibuja una lámina y saca la foto. La pausa se anula: acá solo se dibuja, no se espera. */
async function foto(nombre, dibujar, archivo) {
  await dibujar(page, GUION, async () => {})
  // Lo justo para que terminen las animaciones de entrada.
  await new Promise(r => setTimeout(r, 2500))
  await page.screenshot({ path: archivo })
  console.log(`   ${nombre}: ${archivo}`)
}

console.log('')
await foto('Entrada', mostrarPortada, DESTINO)
if (GUION.cierre) await foto('Salida ', mostrarCierre, DESTINO.replace(/\.png$/, '-cierre.png'))
await navegador.close()

console.log('\n   Miralas, y si algo no entra ajustá guion.json y volvé a correr esto.\n')
