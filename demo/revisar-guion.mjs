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

// Los mismos valores por defecto que usa el grabador. Si no coincidieran, el revisor
// anunciaría una duración que no es la del video, que es peor que no anunciar ninguna.
const T = guion.tiempos ?? {}
const LEER = T.leer ?? 1800
const RESPIRAR = T.respirar ?? 500
const SALIDA_CARTEL = T.salidaCartel ?? 300
const POR_PARADA = LEER + RESPIRAR + SALIDA_CARTEL
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
  const dura = (ESPERA_FIJA ?? p.espera ?? 2500) + POR_PARADA
  total += dura
  const quien = (p.como ?? 'staff') === 'cliente' ? '[cliente]' : '         '
  console.log(`  ${String(i + 1).padStart(2)}. ${quien} ${p.titulo}`)
  console.log(`      ${p.texto}`)
  // Se muestran los dos números por separado. Con uno solo —el total— uno busca ese
  // valor en el guion para bajarlo y no lo encuentra, porque lo que está escrito ahí es
  // el primero; el segundo le suma lo que tarda la pantalla en aparecer e irse.
  const propio = ESPERA_FIJA ?? p.espera ?? 2500
  console.log(`      espera ${seg(propio)} s  ·  en pantalla ${seg(dura)} s  ·  ${p.ruta ?? '(sigue en la misma pantalla)'}\n`)
})

if (guion.cierre) {
  total += (guion.cierre.espera ?? 4200) + 3200
  console.log(`  →  CIERRE: ${guion.cierre.titulo}`)
  console.log(`      ${guion.cierre.texto}\n`)
}

// ── En qué se va el tiempo ─────────────────────────────────────────────────
// Sin este desglose uno acorta los textos, que es lo único visible, mientras la mayor
// parte del tiempo se va en algo que ni se ve: la pausa entre pantalla y pantalla.
const carteles = paradas.reduce((n, p) => n + (ESPERA_FIJA ?? p.espera ?? 2500), 0)
const entre = paradas.length * POR_PARADA
const tapas = (guion.portada?.espera ?? 0) + (guion.cierre?.espera ?? 0)
const ingresos = 3 * ((T.tipeo ?? 300) * 2 + (T.trasIngresar ?? 1100) + 3000)

const reloj = ms => `${Math.floor(ms / 60000)} min ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')} s`
const fila = (etiqueta, ms) =>
  console.log(`     ${etiqueta.padEnd(34)} ${reloj(ms).padStart(10)}   ${'█'.repeat(Math.round(ms / (total + ingresos) * 34))}`)

if (ESPERA_FIJA) {
  console.log(`  ⚠️  DEMO_ESPERA=${ESPERA_FIJA} está puesta: TODAS las paradas duran ${(ESPERA_FIJA / 1000).toFixed(1)} s`)
  console.log('      y los tiempos escritos en el guion se ignoran.')
  console.log('      Para usar los del guion, comentá esa línea en demo/credenciales.local.\n')
}

console.log('  En qué se va el tiempo:\n')
fila('Los carteles (lo que se lee)', carteles)
fila(`Entre pantallas (${paradas.length} × ${(POR_PARADA / 1000).toFixed(1)} s)`, entre)
fila('Portada y cierre', tapas)
fila('Los tres ingresos', ingresos)
console.log(`\n     ${'TOTAL APROXIMADO'.padEnd(34)} ${reloj(total + ingresos).padStart(10)}`)
console.log(`
  Si quedó largo, mirá primero el renglón más largo de arriba.
  "Entre pantallas" se acorta en el bloque "tiempos" del guion; los carteles,
  uno por uno, en su "espera".
`)
