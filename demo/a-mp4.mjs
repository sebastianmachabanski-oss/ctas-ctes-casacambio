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

// ── La música ──────────────────────────────────────────────────────────────
const MUSICA = ['musica.mp3', 'musica.m4a', 'musica.wav', 'musica.ogg']
  .map(f => join(AQUI, f)).find(existsSync)

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

if (MUSICA) {
  const pista = await prepararMusica(MUSICA)
  temporales.push(join(SALIDA, '.musica-recortada.wav'), join(SALIDA, '.musica-continua.wav'))
  args.push(
    '-i', pista,
    '-filter_complex',
    `[1:a]volume=${VOLUMEN},afade=t=out:st=${Math.max(0, segundos - CIERRE).toFixed(2)}:d=${CIERRE}[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:a', 'aac', '-b:a', '160k',
    // El video manda: la música se corta cuando el video termina.
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
console.log(MUSICA
  ? `   con música: ${basename(MUSICA)} al ${Math.round(VOLUMEN * 100)}% de volumen`
  : '   sin música (poné un archivo demo/musica.mp3 y volvé a correr esto)')

try {
  await ejecutar('ffmpeg', args, { maxBuffer: 1024 * 1024 * 64 })
} catch (e) {
  salir(`ffmpeg no pudo convertir el video:\n   ${String(e.stderr ?? e.message).split('\n').slice(-6).join('\n   ')}`)
}

// Los archivos de trabajo de la música no tienen por qué quedar dando vueltas.
for (const t of temporales) { try { if (existsSync(t)) unlinkSync(t) } catch {} }

const mb = (statSync(destino).size / 1024 / 1024).toFixed(1)
console.log(`\n✅ Listo: ${destino}  (${mb} MB)\n`)
if (MUSICA) console.log('   Si la música quedó alta o baja:  $env:DEMO_VOLUMEN=0.10  y volvé a correr `npm run mp4`\n')
