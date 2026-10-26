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
import { leerGuion } from './leer-guion.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cargarCredenciales } from './credenciales.mjs'
cargarCredenciales()

const AQUI = dirname(fileURLToPath(import.meta.url))
const ARCHIVO = join(AQUI, 'guion.json')

/** Tiene que coincidir con ACCIONES en grabar-demo.mjs. */
const ACCIONES = ['bajar', 'bajar-despacio', 'cargar-operacion']
const USUARIOS = ['staff', 'cliente']

const guion = leerGuion()

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
// Si está puesta la duración fija, el cálculo tiene que usarla: si no, anuncia una
// duración que no se corresponde con la del video que se va a grabar.
const ESPERA_FIJA = Number(process.env.DEMO_ESPERA) || null
let total = 0

console.log(`\n✅ El guion está bien escrito. ${paradas.length} paradas:\n`)

if (guion.portada) {
  const p = guion.portada
  total += p.espera ?? 9000
  console.log(`   →  PORTADA: ${p.titulo ?? '(sin título)'}`)
  if (p.subtitulo) console.log(`      ${p.subtitulo}`)
  const grupos = p.grupos ?? (p.puntos ? [{ puntos: p.puntos }] : [])
  const cuantas = grupos.reduce((n, g) => n + (g.puntos ?? []).length, 0)
  const dest = (p.destacados ?? []).map(d => d.titulo).filter(Boolean)
  if (dest.length) console.log(`      destacados: ${dest.join(' · ')}`)
  for (const g of grupos) {
    if (g.titulo) console.log(`      ${g.titulo}: ${(g.puntos ?? []).length} puntos`)
  }
  console.log(`      ${cuantas} funcionalidades en total · ${seg(p.espera ?? 9000)} s\n`)
}
paradas.forEach((p, i) => {
  const dura = (ESPERA_FIJA ?? p.espera ?? 2500) + 3200 + 900   // espera + lectura del cartel + respiro
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
