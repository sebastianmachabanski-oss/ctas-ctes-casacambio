/**
 * Revisa `guion.json` sin grabar nada.
 *
 *   npm run revisar
 *
 * PARA QUÉ
 * Editar el guion es editar texto a mano, y un dedazo —una comilla de menos, una coma de
 * más— deja el archivo ilegible. Descubrirlo recién al lanzar la grabación es caro: hay
 * que tener la app levantada, esperar el precalentado y recién ahí enterarse.
 *
 * Esto responde en un segundo y no necesita nada prendido.
 *
 * Además del formato revisa lo que el formato no puede: que cada parada tenga título y
 * texto, que el usuario sea uno de los dos que existen, y que las acciones nombradas
 * estén entre las disponibles. Son los errores que no rompen el archivo pero arruinan el
 * video, y se descubrirían recién al mirarlo.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ARCHIVO = join(AQUI, 'guion.json')

/** Tiene que coincidir con ACCIONES en grabar-demo.mjs. */
const ACCIONES = ['bajar', 'bajar-despacio', 'cargar-operacion']
const USUARIOS = ['staff', 'cliente']

let guion
try {
  guion = JSON.parse(readFileSync(ARCHIVO, 'utf8'))
} catch (e) {
  console.error(`\n❌ El archivo está mal escrito:\n   ${e.message}\n`)
  console.error('   Los dedazos típicos:')
  console.error('     · una comilla que falta o que se reemplazó por una letra')
  console.error('     · una coma de más en el último bloque, o de menos en los otros')
  console.error('     · un acento que quedó adentro de un nombre de campo\n')
  process.exit(1)
}

const problemas = []
const paradas = guion.paradas ?? []

if (!paradas.length) problemas.push('El guion no tiene ninguna parada.')

paradas.forEach((p, i) => {
  const donde = `Parada ${i + 1}${p.titulo ? ` ("${p.titulo}")` : ''}`
  if (!p.titulo) problemas.push(`${donde}: le falta el título.`)
  if (!p.texto) problemas.push(`${donde}: le falta el texto.`)
  if (p.como && !USUARIOS.includes(p.como)) {
    problemas.push(`${donde}: "como" dice "${p.como}". Solo vale ${USUARIOS.map(u => `"${u}"`).join(' o ')}.`)
  }
  if (p.accion && !ACCIONES.includes(p.accion)) {
    problemas.push(`${donde}: la acción "${p.accion}" no existe. Hay: ${ACCIONES.join(', ')}.`)
  }
  if (p.ruta !== null && p.ruta !== undefined && !String(p.ruta).startsWith('/')) {
    problemas.push(`${donde}: la ruta "${p.ruta}" tendría que empezar con "/".`)
  }
  if (p.espera !== undefined && (typeof p.espera !== 'number' || p.espera <= 0)) {
    problemas.push(`${donde}: "espera" tiene que ser un número de milésimas de segundo.`)
  }
})

if (problemas.length) {
  console.error(`\n❌ ${problemas.length} problema(s):\n`)
  for (const p of problemas) console.error(`   · ${p}`)
  console.error('')
  process.exit(1)
}

// ── Todo bien: se muestra el recorrido para leerlo de corrido ───────────────
// El guion se edita parada por parada, pero el que lo mira ve un video seguido. Verlo
// listado ayuda a notar que dos carteles dicen casi lo mismo, o que falta una transición.
const seg = ms => (ms / 1000).toFixed(1).replace('.', ',')
let total = 0

console.log(`\n✅ El guion está bien escrito. ${paradas.length} paradas:\n`)
paradas.forEach((p, i) => {
  const dura = (p.espera ?? 2500) + 3200 + 900   // espera + lectura del cartel + respiro
  total += dura
  const quien = (p.como ?? 'staff') === 'cliente' ? '[cliente]' : '         '
  console.log(`  ${String(i + 1).padStart(2)}. ${quien} ${p.titulo}`)
  console.log(`      ${p.texto}`)
  console.log(`      ${seg(dura)} s · ${p.ruta ?? '(sigue en la misma pantalla)'}\n`)
})

if (guion.cierre) {
  total += (guion.cierre.espera ?? 4200) + 3200
  console.log(`  →  CIERRE: ${guion.cierre.titulo}`)
  console.log(`      ${guion.cierre.texto}\n`)
}

const m = Math.floor(total / 60000)
const s = Math.round((total % 60000) / 1000)
console.log(`  Duración aproximada: ${m} min ${String(s).padStart(2, '0')} s`)
console.log('  (el número real varía unos segundos según lo que tarde cada pantalla)\n')
