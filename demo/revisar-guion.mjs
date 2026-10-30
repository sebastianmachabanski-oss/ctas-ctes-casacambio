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
import { leerGuion, duracionDeParada } from './leer-guion.mjs'
import { planDeVoz } from './pistas-voz.mjs'
import { join, dirname, basename } from 'node:path'
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
  const esLamina = p.tipo === 'lamina'
  if (!p.titulo) problemas.push(`${donde}: le falta el título.`)
  // Una pantalla puede presentarse con el cartel grande (`texto`) o con la etiqueta del
  // rincón (`etiqueta`). Sin ninguna de las dos, aparece sin que se sepa qué es.
  if (!esLamina && !p.texto && !p.etiqueta) {
    problemas.push(`${donde}: no tiene ni "texto" ni "etiqueta", así que aparece sin nombre.`)
  }
  if (esLamina && p.ruta) problemas.push(`${donde}: es una lámina, no lleva "ruta".`)
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
  // Una lámina se dibuja sobre la misma página: no navega ni muestra cartel, así que no
  // paga la sobrecarga de una pantalla.
  const dura = (ESPERA_FIJA ?? duracionDeParada(p, T)) + (p.tipo === 'lamina' ? 0 : POR_PARADA)
  total += dura
  const quien = (p.como ?? 'staff') === 'cliente' ? '[cliente]' : '         '
  const marca = p.tipo === 'lamina' ? '▌' : ' '
  console.log(`  ${String(i + 1).padStart(2)}.${marca}${quien} ${p.titulo}`)
  if (p.texto) console.log(`      ${p.texto}`)
  else if (p.puntos) console.log(`      ${p.puntos.join('  ·  ')}`)
  // Se muestran los dos números por separado. Con uno solo —el total— uno busca ese
  // valor en el guion para bajarlo y no lo encuentra, porque lo que está escrito ahí es
  // el primero; el segundo le suma lo que tarda la pantalla en aparecer e irse.
  const propio = ESPERA_FIJA ?? duracionDeParada(p, T)
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
const pantallas = paradas.filter(p => p.tipo !== 'lamina')
const seccionesL = paradas.filter(p => p.tipo === 'lamina')
const carteles = pantallas.reduce((n, p) => n + (ESPERA_FIJA ?? duracionDeParada(p, T)), 0)
const laminasT = seccionesL.reduce((n, p) => n + (ESPERA_FIJA ?? duracionDeParada(p, T)), 0)
const entre = pantallas.length * POR_PARADA
const tapas = duracionDeParada(guion.portada ?? {}, T) + duracionDeParada(guion.cierre ?? {}, T)
// Los ingresos ya no se graban: el recorrido arranca con la sesión puesta y el cambio de
// usuario se hace por cookies. Se deja la cuenta en cero para que la duración anunciada
// sea la del video y no la de una versión anterior.
const ingresos = 0

const reloj = ms => `${Math.floor(ms / 60000)} min ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')} s`
const fila = (etiqueta, ms) =>
  console.log(`     ${etiqueta.padEnd(34)} ${reloj(ms).padStart(10)}   ${'█'.repeat(Math.round(ms / (total + ingresos) * 34))}`)

if (ESPERA_FIJA) {
  console.log(`  ⚠️  DEMO_ESPERA=${ESPERA_FIJA} está puesta: TODAS las paradas duran ${(ESPERA_FIJA / 1000).toFixed(1)} s`)
  console.log('      y los tiempos escritos en el guion se ignoran.')
  console.log('      Para usar los del guion, comentá esa línea en demo/credenciales.local.\n')
}

console.log('  En qué se va el tiempo:\n')
fila(`Las pantallas (${pantallas.length})`, carteles)
fila(`Entre pantallas (${pantallas.length} × ${(POR_PARADA / 1000).toFixed(1)} s)`, entre)
if (laminasT) fila(`Las láminas de sección (${seccionesL.length})`, laminasT)
fila('Portada y cierre', tapas)
console.log(`\n     ${'TOTAL APROXIMADO'.padEnd(34)} ${reloj(total + ingresos).padStart(10)}`)
// ── El relato ──────────────────────────────────────────────────────────────
// Se imprime entero y seguido, para copiarlo de una sola vez al generador de voz. Línea
// por línea no sirve: lo que importa es cómo suena de corrido.
const conVoz = [
  guion.portada?.voz && { voz: guion.portada.voz, ms: duracionDeParada(guion.portada, T) },
  ...paradas.map(p => p.voz && { voz: p.voz, ms: ESPERA_FIJA ?? duracionDeParada(p, T) }),
  guion.cierre?.voz && { voz: guion.cierre.voz, ms: duracionDeParada(guion.cierre, T) },
].filter(Boolean)

if (conVoz.length) {
  const palabras = conVoz.reduce((n, l) => n + l.voz.trim().split(/\s+/).length, 0)
  // 145 palabras por minuto es un ritmo de locución tranquilo, que es el que corresponde
  // a alguien que escucha esto por primera vez.
  const hablado = palabras / 145 * 60
  console.log(`\n  ── EL RELATO ─────────────────────────────────────────────────────`)
  console.log(`  ${palabras} palabras · unos ${hablado.toFixed(0)} s hablados\n`)
  for (const l of conVoz) console.log(`  ${l.voz}`)
  console.log('')
  const holgura = (total + ingresos) / 1000 - hablado
  if (holgura < 0) {
    console.log(`  ⚠️  El relato dura más que el video (unos ${(-holgura).toFixed(0)} s de más).`)
    console.log('      Acortá renglones o alargá las esperas.\n')
  } else if (holgura > 16) {
    console.log(`  ⚠️  Sobran unos ${holgura.toFixed(0)} s de imagen sin relato: se va a sentir lento.\n`)
  } else {
    console.log(`  ✓ Entra, con ${holgura.toFixed(0)} s de aire repartidos entre las frases.\n`)
  }
}

// ── La voz grabada, si ya está ─────────────────────────────────────────────
// Todo lo de arriba es un CÁLCULO: palabras divididas por palabras por minuto. Sirve para
// escribir el guion, no para saber cómo va a quedar. En cuanto hay archivo de voz se puede
// medir de verdad, y lo que vale es esto.
//
// Se imprime el reparto completo para poder controlarlo ANTES de grabar. El programa
// empareja frases con renglones por orden y por largo, sin entender lo que dice la voz: si
// el emparejamiento sale mal, acá se ve en dos segundos, y en el video se descubriría
// después de grabar, convertir y mirar.
const PLAN = await planDeVoz(guion, { dir: AQUI })
if (PLAN?.aviso) {
  console.log(`  ⚠️  Está ${basename(PLAN.archivo)} pero el video NO va a poder seguirlo:`)
  console.log(`      ${PLAN.aviso.split('\n').join('\n      ')}\n`)
} else if (PLAN) {
  console.log(`  ── LA VOZ MEDIDA ─────────────────────────────────────────────────`)
  console.log(`  ${basename(PLAN.archivo)} · ${seg(PLAN.duracion * 1000)} s de relato · ${PLAN.tramos.length} frases detectadas\n`)
  console.log('  Cada pantalla, en el segundo del video:\n')
  for (const r of PLAN.renglones) {
    console.log(`    ${seg(r.aparece * 1000).padStart(6)} → ${seg(r.hasta * 1000).padStart(6)} s   ${String(r.titulo).padEnd(30)} ${seg(r.dura * 1000).padStart(5)} s`)
    console.log(`                           «${r.voz}»`)
  }
  console.log(`\n     ${'EL VIDEO VA A DURAR'.padEnd(34)} ${seg(PLAN.fin * 1000).padStart(10)} s`)
  console.log('     (lo manda la voz: los tiempos escritos en el guion quedan de lado)\n')
  // Una pantalla con menos de un segundo pasa como un parpadeo, y encima si la carga tarda
  // más que eso no llega a verse nada. Se avisa acá, donde todavía se puede alargar la frase.
  const cortas = PLAN.renglones.filter(r => r.dura < 1.2 && r.parada !== undefined)
  if (cortas.length) {
    console.log(`  ⚠️  ${cortas.length} pantalla(s) duran menos de 1,2 s: van a pasar como un parpadeo.`)
    for (const c of cortas) console.log(`       ${String(c.titulo).padEnd(30)} ${seg(c.dura * 1000)} s`)
    console.log('      Alargá su "voz" en el guion y volvé a generar la narración.\n')
  }
}

// ── El límite ──────────────────────────────────────────────────────────────
const LIMITE = Number(process.env.DEMO_LIMITE || 55)
const duracionReal = PLAN && !PLAN.aviso ? PLAN.fin : (total + ingresos) / 1000
if (duracionReal > LIMITE) {
  console.log(`  ⚠️  Se pasa del límite de ${LIMITE} s por ${(duracionReal - LIMITE).toFixed(0)} s.\n`)
}

// El consejo depende de quién esté mandando el ritmo. Con la voz puesta, "espera" no hace
// nada, y mandar a tocarla sería mandar a perder el tiempo con un número que se ignora.
console.log(PLAN && !PLAN.aviso ? `
  El ritmo lo manda el relato. Para que vaya más despacio, subí "pausaEntreFrases"
  en el bloque "tiempos" del guion (hoy ${seg((guion.tiempos?.pausaEntreFrases ?? 0))} s): estira los silencios ENTRE
  frases sin tocar la voz. Para una pantalla en particular, su "pausaDespues".

  Para que dure menos, sacá una parada con su renglón de relato. Acortar los
  silencios por debajo de lo que tarda una pantalla en cargar no sirve: la
  pantalla entra igual de tarde, solo que encima con la voz hablando.
` : `
  Si quedó largo, mirá primero el renglón más largo de arriba.
  "Entre pantallas" se acorta en el bloque "tiempos" del guion; los carteles,
  uno por uno, en su "espera".
`)
