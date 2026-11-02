/**
 * Corta la narración en frases sueltas, para poder ESCUCHAR cuál es cuál.
 *
 *   npm run frases
 *
 * ── PARA QUÉ ───────────────────────────────────────────────────────────────
 * El video sigue a la voz, y para eso hay que saber qué frase del audio corresponde a qué
 * renglón del guion. El programa lo deduce por orden y por largo, SIN entender lo que dice:
 * y cuando la voz no dice exactamente el texto del guion —porque el generador lo reescribió,
 * porque partió una frase en dos, porque agregó una— esa deducción se equivoca, y una
 * pantalla se queda siete segundos mientras la voz ya habla de otra.
 *
 * Deducirlo mejor no tiene arreglo: sin entender el audio, no hay forma. Lo que sí tiene
 * arreglo es poder COMPROBARLO en un minuto. Esto deja una carpeta con las frases numeradas,
 * cada una en su archivo: se escuchan de a una y se ve enseguida cuál no está donde debería.
 *
 * Después se arregla en el guion, poniéndole a cada renglón cuántas frases ocupa:
 *
 *     { "titulo": "Auditoría", "voz": "...", "frases": 2 }
 *
 * Con eso el reparto deja de ser una deducción y pasa a ser un dato.
 */
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { leerGuion } from './leer-guion.mjs'
import { buscarNarracion, tramosDeVoz, emparejar, compasesDelGuion, contarOraciones } from './pistas-voz.mjs'

const ejecutar = promisify(execFile)
const AQUI = dirname(fileURLToPath(import.meta.url))

function salir(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1) }

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  salir('No se encuentra ffmpeg.\n'
    + '   En Windows:  winget install Gyan.FFmpeg\n'
    + '   En Mac:      brew install ffmpeg\n'
    + '   Después hay que CERRAR y volver a abrir la terminal.')
}

const original = buscarNarracion(AQUI)
if (!original) salir(
  'No hay archivo de narración en demo/.\n\n'
  + '   Tiene que llamarse narracion.mp3 (o .m4a, .wav, .ogg).\n'
  + '   El texto para generarlo lo imprime `npm run revisar`.')

const GUION = leerGuion()
const T = GUION.tiempos ?? {}
const deteccion = {
  ruido: T.ruidoVoz ?? -35,
  detecta: (T.detectaVoz ?? 180) / 1000,
  corte: (T.corteVoz ?? 600) / 1000,
}

// Se mide el archivo ORIGINAL, no el espaciado: las frases son las mismas y así se puede
// correr antes de haber elegido las pausas.
const { duracion, tramos } = await tramosDeVoz(original, deteccion)
const { compases } = compasesDelGuion(GUION)
const reparto = emparejar(tramos, compases)

const CARPETA = join(AQUI, 'salida', 'frases')
if (existsSync(CARPETA)) rmSync(CARPETA, { recursive: true, force: true })
mkdirSync(CARPETA, { recursive: true })

/**
 * ¿Este renglón quedó con una frase que no es la suya?
 *
 * Dos señales. La primera es imposible de discutir: el tiempo que le tocó no alcanza ni
 * hablando más rápido de lo que habla nadie. La segunda es de sospecha: le sobra o le falta
 * casi la mitad de lo que ese texto necesita.
 */
const dudoso = r => r.habla < r.minimoHumano
  || Math.abs(r.holgura) > Math.max(1.2, r.esperado * 0.45)

// Un respiro a cada lado para que no se escuche cortado al principio ni al final.
const AIRE = 0.12
const seg = n => n.toFixed(1).replace('.', ',')

console.log(`\n✂️  ${basename(original)} · ${seg(duracion)} s · ${tramos.length} frases\n`)

for (const [i, t] of tramos.entries()) {
  const n = String(i + 1).padStart(2, '0')
  const desde = Math.max(0, t.inicio - AIRE)
  const dura = Math.min(duracion, t.fin + AIRE) - desde
  await ejecutar('ffmpeg', ['-nostdin', '-y', '-v', 'error',
    '-ss', desde.toFixed(3), '-t', dura.toFixed(3), '-i', original,
    '-c:a', 'libmp3lame', '-q:a', '5', join(CARPETA, `${n}.mp3`),
  ], { maxBuffer: 1024 * 1024 * 32 })
}

// A quién le tocó cada frase, con el renglón al lado. Es la tabla que hay que comprobar.
if (reparto.error) {
  console.log(`⚠️  No se pudo repartir: ${reparto.error}.\n`)
  for (const [i, t] of tramos.entries()) {
    console.log(`   ${String(i + 1).padStart(2, '0')}.mp3   ${seg(t.inicio).padStart(5)} → ${seg(t.fin).padStart(5)} s   (${seg(t.fin - t.inicio)} s)`)
  }
} else {
  const { bordes, renglones } = reparto
  console.log('   Escuchá los archivos en orden y comprobá que digan esto:\n')
  renglones.forEach((r, j) => {
    const nums = []
    for (let k = bordes[j]; k < bordes[j + 1]; k++) nums.push(String(k + 1).padStart(2, '0'))
    const sospecha = dudoso(r) ? '  ← revisar' : ''
    console.log(`   ${nums.map(n => `${n}.mp3`).join(' + ').padEnd(22)} ${seg(r.fin - r.inicio).padStart(5)} s  «${r.voz}»${sospecha}`)
  })

  const dudosos = renglones.filter(dudoso)
  console.log(`\n   Archivos en: ${CARPETA}\n`)
  if (dudosos.length) {
    console.log(`⚠️  ${dudosos.length} renglón(es) marcados con "revisar": el tiempo que les tocó no da`)
    console.log('   para decir ese texto, o sobra de más. Casi seguro el reparto está corrido.\n')
    for (const r of dudosos) {
      console.log(`     «${r.voz}»`)
      console.log(`        le tocaron ${seg(r.habla)} s de voz y necesita alrededor de ${seg(r.esperado)} s`)
      if (r.habla < r.minimoHumano) console.log(`        no entra ni hablando al doble: ${r.palabras} palabras no se dicen en ${seg(r.habla)} s`)
      console.log('')
    }
  }
  console.log('   Si alguno no coincide, poné en el guion cuántas frases ocupa cada renglón:\n')
  console.log('     { "titulo": "...", "voz": "...", "frases": 2 }\n')
  console.log(`   Tienen que sumar ${tramos.length}. Los que no lo lleven se reparten lo que sobre;`)
  console.log('   poniéndoselo a todos, el reparto queda clavado y deja de adivinarse.\n')
  const oraciones = compases.reduce((n, c) => n + contarOraciones(c.voz), 0)
  if (oraciones !== tramos.length) {
    console.log(`   Ojo: el guion tiene ${oraciones} oraciones y la voz dice ${tramos.length} frases.`)
    console.log('   Si la diferencia es grande, lo más probable es que la voz NO esté diciendo el')
    console.log('   texto del guion —hay generadores que lo reescriben— y entonces ningún reparto')
    console.log('   va a quedar bien. Se arregla generando la voz con el texto tal cual.\n')
  }
}
