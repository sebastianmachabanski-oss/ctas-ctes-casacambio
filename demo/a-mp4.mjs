/**
 * Pasa la grabación a MP4 y le pone música, si hay.
 *
 *   npm run mp4
 *
 * POR QUÉ NO SE GRABA YA EN MP4 Y CON MÚSICA
 * El navegador no sabe hacer ninguna de las dos cosas: graba video solo, en WebM. La
 * música y el formato final son un paso aparte, con ffmpeg.
 *
 * LA MÚSICA
 * Si existe `demo/musica.mp3` (o .m4a, .wav, .ogg), se mezcla sola. No viene ninguna en el
 * repositorio a propósito: la música tiene dueño, y meter un archivo acá sería repartir
 * algo cuya licencia no conocemos. Hay que elegirla y bajarla, verificando que la licencia
 * permita uso comercial — un video de venta lo es, aunque no se cobre por el video.
 *
 * Lo que hace con ella, sin que haya que entender de audio:
 *   · la recorta al largo exacto del video, o la repite si es más corta;
 *   · la baja de volumen, para que no tape nada;
 *   · le hace un cierre suave en los últimos segundos, para que no termine de golpe.
 */
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { prepararVoz } from './pistas-voz.mjs'
import { leerGuion } from './leer-guion.mjs'

const ejecutar = promisify(execFile)
const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, 'salida')

function salir(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1) }

// ── ffmpeg ─────────────────────────────────────────────────────────────────
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  salir('No se encuentra ffmpeg.\n'
    + '   En Windows:  winget install Gyan.FFmpeg\n'
    + '   En Mac:      brew install ffmpeg\n'
    + '   Después hay que CERRAR y volver a abrir la terminal.')
}

// ── El video ───────────────────────────────────────────────────────────────
if (!existsSync(SALIDA)) salir('No hay nada en demo/salida: ¿corriste `npm run grabar`?')
const webm = readdirSync(SALIDA).filter(f => f.endsWith('.webm')).map(f => join(SALIDA, f))
if (!webm.length) salir('No hay ninguna grabación en demo/salida. Corré `npm run grabar`.')

// Por fecha de escritura, no por nombre: el mismo criterio que usa el grabador, y por el
// mismo motivo —el orden alfabético devolvía el video de la corrida anterior.
const video = webm.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs).pop()
const destino = video.replace(/\.webm$/, '.mp4')

/** Duración en segundos, para recortar la música al largo justo. */
async function duracion(archivo) {
  const { stdout } = await ejecutar('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', archivo,
  ])
  return Number(stdout.trim())
}

// ── El relato y la música ──────────────────────────────────────────────────
// El relato manda: si hay voz, la música baja para no competir con ella. Una música al
// mismo volumen que la voz obliga a esforzarse para entender, y quien mira un aviso de
// cuarenta y cinco segundos no se esfuerza: lo cierra.
const buscar = base => ['mp3', 'm4a', 'wav', 'ogg', 'aac']
  .map(e => join(AQUI, `${base}.${e}`)).find(existsSync)

// El relato sale de la misma función que usa el grabador, y no de buscar el archivo a mano.
// Es importante: si el guion pide pausas entre frases, lo que suena en el video es una
// versión ESPACIADA del archivo original, y el grabador sincronizó contra esa. Mezclando
// acá el original, el video volvería a quedar desfasado — y por una diferencia que no se ve
// en ningún lado, porque los dos archivos dicen exactamente lo mismo.
const relato = await prepararVoz(leerGuion(), AQUI)
const RELATO = relato.archivo
const MUSICA = buscar('musica')

const segundos = await duracion(video)
const VOLUMEN = Number(process.env.DEMO_VOLUMEN) || 0.18   // 0 = sin música, 1 = volumen original
const CIERRE = 3                                            // segundos de desvanecido final
const CRUCE = 2                                             // segundos de cruce entre vueltas

/**
 * Prepara la música para que suene CONTINUA durante todo el video.
 *
 * EL PROBLEMA
 * Casi toda la música empieza y termina con un poco de silencio. Repitiendo la pista tal
 * cual, cada vuelta pega el silencio del final con el del comienzo: en el video se escucha
 * que la música frena, hay un bache y vuelve a arrancar. Con una pista de tres minutos en
 * un video de cuatro, eso pasa una vez y se nota muchísimo.
 *
 * LA SOLUCIÓN, EN DOS PASOS
 *  1. Se recorta el silencio de las dos puntas. Esto solo ya elimina el bache.
 *  2. Las vueltas se encadenan con un CRUCE: el final de una se superpone con el comienzo
 *     de la siguiente, así no se escucha dónde empieza de nuevo. Sin esto no hay silencio
 *     pero sí un salto brusco.
 *
 * Devuelve la ruta de un archivo temporal, ya del largo del video.
 */
async function prepararMusica(archivo) {
  const recortada = join(SALIDA, '.musica-recortada.wav')
  const loopeada = join(SALIDA, '.musica-continua.wav')

  // `areverse` en el medio es el modo de recortar también el final: se recorta el
  // comienzo, se da vuelta, se recorta el nuevo comienzo —que era el final— y se
  // endereza. `silenceremove` solo sabe trabajar desde el principio.
  const recorte = 'silenceremove=start_periods=1:start_threshold=-50dB:detection=peak'
  await ejecutar('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', archivo,
    '-af', `${recorte},areverse,${recorte},areverse`,
    '-ar', '48000', '-ac', '2', recortada], { maxBuffer: 1024 * 1024 * 64 })

  const largo = await duracion(recortada)
  if (!isFinite(largo) || largo < 1) salir(`La música ${basename(archivo)} quedó vacía al recortarle los silencios.`)

  // Cada vuelta aporta su largo menos el cruce, que se comparte con la anterior.
  const cruce = Math.min(CRUCE, largo / 4)
  const vueltas = Math.max(1, Math.ceil((segundos + cruce) / (largo - cruce)))

  if (vueltas === 1) return recortada

  // Se encadenan de a dos: [0][1]→x1, [x1][2]→x2, y así.
  const entradas = []
  for (let i = 0; i < vueltas; i++) entradas.push('-i', recortada)
  const cadena = []
  for (let i = 1; i < vueltas; i++) {
    const izq = i === 1 ? '[0:a]' : `[x${i - 1}]`
    cadena.push(`${izq}[${i}:a]acrossfade=d=${cruce.toFixed(2)}[x${i}]`)
  }
  await ejecutar('ffmpeg', ['-nostdin', '-y', '-v', 'error', ...entradas,
    '-filter_complex', cadena.join(';'), '-map', `[x${vueltas - 1}]`,
    loopeada], { maxBuffer: 1024 * 1024 * 64 })

  console.log(`   ${vueltas} vueltas de ${largo.toFixed(0)} s, encadenadas con ${cruce.toFixed(1)} s de cruce`)
  return loopeada
}

const args = ['-y', '-i', video]
const temporales = []

// Con relato, la música va MUY abajo: acompaña, no se escucha como música.
const VOL_MUSICA = RELATO ? (Number(process.env.DEMO_VOLUMEN_MUSICA) || 0.06) : VOLUMEN
const VOL_RELATO = Number(process.env.DEMO_VOLUMEN_VOZ) || 1.0

if (RELATO || MUSICA) {
  const pistas = []
  const filtros = []

  if (RELATO) {
    args.push('-i', RELATO)
    const i = pistas.length + 1
    // El relato NO se repite ni se recorta: dura lo que dura. Si sobra video al final,
    // se ve la lámina de cierre en silencio, que es un final y no un error.
    filtros.push(`[${i}:a]volume=${VOL_RELATO}[voz]`)
    pistas.push('[voz]')
  }
  if (MUSICA) {
    const pista = await prepararMusica(MUSICA)
    temporales.push(join(SALIDA, '.musica-recortada.wav'), join(SALIDA, '.musica-continua.wav'))
    args.push('-i', pista)
    const i = pistas.length + 1
    filtros.push(`[${i}:a]volume=${VOL_MUSICA},afade=t=out:st=${Math.max(0, segundos - CIERRE).toFixed(2)}:d=${CIERRE}[mus]`)
    pistas.push('[mus]')
  }

  // `apad` al final NO es un detalle: sin él, un audio más corto que el video lo CORTA,
  // porque `-shortest` recorta a la pista más breve. Pasó con un relato de 40 segundos
  // sobre un video de 46: se perdían los últimos seis, que son la lámina de cierre, y el
  // video terminaba de golpe a mitad de una pantalla. Rellenando con silencio hasta pasar
  // el largo del video, `-shortest` recorta el audio y nunca la imagen.
  const salida = pistas.length > 1
    ? `${pistas.join('')}amix=inputs=${pistas.length}:duration=longest:dropout_transition=0,volume=2,apad[a]`
    : `${pistas[0]}apad[a]`

  args.push(
    '-filter_complex', [...filtros, salida].join(';'),
    '-map', '0:v', '-map', '[a]',
    '-c:a', 'aac', '-b:a', '160k',
    // El video manda: el audio se corta cuando el video termina.
    '-shortest',
  )
}

args.push(
  '-c:v', 'libx264', '-crf', '23',
  // yuv420p y +faststart no son adornos: sin el primero hay reproductores y celulares que
  // muestran la pantalla en negro, y sin el segundo el video no empieza hasta terminar de
  // descargarse, que es justo lo que pasa al mandarlo por mensaje.
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  destino,
)

console.log(`\n🎬 Convirtiendo ${basename(video)} (${Math.round(segundos)} s)`)
if (RELATO) {
  console.log(`   con relato: ${basename(relato.original)}`)
  if (relato.archivo !== relato.original) {
    console.log(`               con las pausas del guion${relato.antes ? `: ${relato.antes.toFixed(1).replace('.', ',')} s → ${relato.ahora.toFixed(1).replace('.', ',')} s` : ''}`)
  }
}
if (MUSICA) console.log(`   con música: ${basename(MUSICA)} al ${Math.round(VOL_MUSICA * 100)}% de volumen`)
if (!RELATO && !MUSICA) {
  console.log('   sin audio. Poné en la carpeta demo:')
  console.log('     narracion.mp3  — la voz que cuenta el video (ver `npm run revisar`)')
  console.log('     musica.mp3     — música de fondo, opcional')
}

try {
  await ejecutar('ffmpeg', args, { maxBuffer: 1024 * 1024 * 64 })
} catch (e) {
  salir(`ffmpeg no pudo convertir el video:\n   ${String(e.stderr ?? e.message).split('\n').slice(-6).join('\n   ')}`)
}

// Los archivos de trabajo de la música no tienen por qué quedar dando vueltas.
for (const t of temporales) { try { if (existsSync(t)) unlinkSync(t) } catch {} }

const mb = (statSync(destino).size / 1024 / 1024).toFixed(1)
console.log(`\n✅ Listo: ${destino}  (${mb} MB)\n`)
if (MUSICA || RELATO) {
  console.log('   Para ajustar el audio y volver a correr `npm run mp4`:')
  if (MUSICA) console.log('     $env:DEMO_VOLUMEN_MUSICA=0.04   (la música, más baja)')
  if (RELATO) console.log('     $env:DEMO_VOLUMEN_VOZ=1.3       (la voz, más fuerte)')
  console.log('')
}
