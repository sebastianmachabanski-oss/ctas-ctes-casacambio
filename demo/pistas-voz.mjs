/**
 * Mide el archivo de narración y reparte el video según LO QUE DURA LA VOZ DE VERDAD.
 *
 * ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────────────
 * Hasta acá la duración de cada pantalla se CALCULABA del texto: tantas palabras a tantas
 * palabras por minuto. Eso alcanza para escribir el guion, pero no para sincronizar: la
 * voz grabada no respeta ese cálculo. Una frase sale medio segundo más corta, la siguiente
 * un segundo más larga, y como cada pantalla empieza cuando termina la anterior, los
 * errores SE SUMAN. A la quinta pantalla el relato ya habla de otra cosa; al final la
 * imagen se queda en cuentas corrientes mientras la voz dice el cierre.
 *
 * Ajustar los números a mano no sirve: hay que rehacerlo entero cada vez que se regenera
 * la voz, y un error de medio segundo por frase no se ve hasta que el video está hecho.
 *
 * ── CÓMO LO RESUELVE ───────────────────────────────────────────────────────
 * No se calcula nada: se MIDE el archivo de voz. ffmpeg marca dónde hay silencio, y los
 * silencios largos son las separaciones entre frases. Con eso se sabe en qué segundo
 * exacto arranca cada frase, y el grabador deja cada pantalla puesta hasta el segundo en
 * que arranca la siguiente.
 *
 * Son momentos ABSOLUTOS contra el reloj del video, no duraciones encadenadas. Eso es lo
 * que elimina la acumulación: si una pantalla tarda de más en cargar, se come su propio
 * tiempo y la siguiente aparece igual cuando tiene que aparecer. El desfasaje no pasa de
 * una pantalla a la otra.
 *
 * ── LO QUE NO PUEDE HACER ──────────────────────────────────────────────────
 * No entiende lo que dice la voz: no transcribe. Empareja frases con renglones del guion
 * POR ORDEN y por largo. Si la voz dice las frases en otro orden que el guion, o se saltea
 * una, el emparejamiento sale mal — y por eso `npm run revisar` lo IMPRIME, para poder
 * controlarlo antes de grabar en lugar de descubrirlo en el video.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

/** Los formatos que puede traer el archivo de voz. Los mismos que acepta `npm run mp4`. */
const EXTENSIONES = ['mp3', 'm4a', 'wav', 'ogg', 'aac']

/** Los nombres aceptados, en orden de preferencia. Es el mismo criterio que a-mp4.mjs. */
const NOMBRES = ['narracion', 'relato', 'voz']

/** La ruta del archivo de narración, o null si no hay ninguno. */
export function buscarNarracion(dir) {
  for (const n of NOMBRES) {
    for (const e of EXTENSIONES) {
      const f = join(dir, `${n}.${e}`)
      if (existsSync(f)) return f
    }
  }
  return null
}

/**
 * Los momentos del video que tienen relato, EN EL ORDEN EN QUE SE VEN.
 *
 * Portada, cada parada y cierre. Los que no tienen `voz` quedan afuera, y eso vuelve
 * inservible el plan: una pantalla muda en el medio ocupa tiempo de video que la voz no
 * marca en ninguna parte, así que no hay forma de saber cuándo termina. Se avisa y se
 * vuelve al cálculo por palabras, que no sincroniza pero tampoco miente.
 */
export function compasesDelGuion(GUION) {
  const compases = []
  const mudas = []
  if (GUION.portada) {
    if (GUION.portada.voz) compases.push({ clave: 'portada', voz: GUION.portada.voz, titulo: 'PORTADA' })
    else mudas.push('la portada')
  }
  ;(GUION.paradas ?? []).forEach((p, i) => {
    if (p.voz) compases.push({ clave: i, parada: i, voz: p.voz, titulo: p.titulo ?? `parada ${i + 1}` })
    else mudas.push(`la parada ${i + 1} ("${p.titulo ?? ''}")`)
  })
  if (GUION.cierre) {
    if (GUION.cierre.voz) compases.push({ clave: 'cierre', voz: GUION.cierre.voz, titulo: 'CIERRE' })
    else mudas.push('el cierre')
  }
  return { compases, mudas }
}

/**
 * Los tramos en que de verdad se habla, leídos del archivo con ffmpeg.
 *
 * `detecta` es el silencio más corto que ffmpeg informa, y `corte` el que separa una frase
 * de la siguiente. Son dos cosas distintas a propósito: dentro de una frase hay pausas
 * —una coma, un punto y seguido— de dos o tres décimas, y tomarlas como separación
 * partiría la frase en pedazos. Con el corte en seis décimas, las pausas de adentro se
 * fusionan y las de afuera separan.
 */
export async function tramosDeVoz(archivo, { ruido = -35, detecta = 0.18, corte = 0.6 } = {}) {
  const { stdout } = await ejecutar('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', archivo,
  ])
  const duracion = Number(stdout.trim())
  if (!isFinite(duracion) || duracion <= 0) throw new Error(`no se pudo medir el largo de ${archivo}`)

  // ffmpeg escribe lo que detecta en la salida de ERRORES, no en la normal, y termina con
  // código 0. Así que no es un error: es el resultado.
  let registro = ''
  try {
    const r = await ejecutar('ffmpeg', ['-nostdin', '-i', archivo,
      '-af', `silencedetect=noise=${ruido}dB:d=${detecta}`, '-f', 'null', '-',
    ], { maxBuffer: 1024 * 1024 * 64 })
    registro = r.stderr
  } catch (e) {
    registro = String(e.stderr ?? '')
    if (!registro.includes('silence')) throw e
  }

  const silencios = []
  for (const linea of registro.split('\n')) {
    const a = linea.match(/silence_start:\s*(-?[\d.]+)/)
    if (a) { silencios.push({ desde: Math.max(0, Number(a[1])), hasta: duracion }); continue }
    const b = linea.match(/silence_end:\s*([\d.]+)/)
    if (b && silencios.length) silencios[silencios.length - 1].hasta = Number(b[1])
  }

  // Lo que queda entre silencio y silencio es habla.
  const crudos = []
  let cursor = 0
  for (const s of silencios) {
    if (s.desde - cursor > 0.01) crudos.push({ inicio: cursor, fin: s.desde })
    cursor = s.hasta
  }
  if (duracion - cursor > 0.01) crudos.push({ inicio: cursor, fin: duracion })

  // Las pausas cortas son de adentro de una frase: se fusionan.
  const tramos = []
  for (const t of crudos) {
    const u = tramos[tramos.length - 1]
    if (u && t.inicio - u.fin < corte) u.fin = t.fin
    else tramos.push({ ...t })
  }
  return { duracion, tramos }
}

/**
 * Empareja los tramos de voz con los renglones del guion.
 *
 * Hay más tramos que renglones cuando un renglón tiene dos oraciones —"En la nube. En
 * cualquier dispositivo."— porque la voz hace una pausa entera en el punto. Así que no
 * alcanza con emparejar uno a uno: a cada renglón le puede tocar más de un tramo, siempre
 * seguidos y SIN cambiar el orden.
 *
 * De todos los repartos posibles se elige el que mejor respeta el largo de cada renglón:
 * un renglón de catorce palabras tiene que quedarse con más segundos que uno de cuatro. Se
 * prueban todos los repartos (son pocos) y gana el de menor error total.
 */
export function emparejar(tramos, compases) {
  const N = tramos.length
  const M = compases.length
  if (N < M) return { error: `la voz tiene ${N} frase(s) y el guion ${M} renglón(es)` }

  const palabras = compases.map(c => c.voz.trim().split(/\s+/).filter(Boolean).length)
  const totalPalabras = palabras.reduce((a, b) => a + b, 0)
  const habla = tramos.map(t => t.fin - t.inicio)
  const totalHabla = habla.reduce((a, b) => a + b, 0)
  const esperado = palabras.map(p => p / totalPalabras * totalHabla)

  const INF = Infinity
  const costo = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(INF))
  const vieneDe = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(-1))
  costo[0][0] = 0
  for (let j = 1; j <= M; j++) {
    for (let i = j; i <= N - (M - j); i++) {
      for (let k = j - 1; k < i; k++) {
        if (costo[j - 1][k] === INF) continue
        let suma = 0
        for (let x = k; x < i; x++) suma += habla[x]
        const c = costo[j - 1][k] + Math.abs(suma - esperado[j - 1])
        if (c < costo[j][i]) { costo[j][i] = c; vieneDe[j][i] = k }
      }
    }
  }
  if (costo[M][N] === INF) return { error: 'no se pudo repartir la voz entre los renglones' }

  const bordes = new Array(M + 1)
  bordes[M] = N
  for (let j = M; j >= 1; j--) bordes[j - 1] = vieneDe[j][bordes[j]]

  return {
    renglones: compases.map((c, j) => ({
      ...c,
      inicio: tramos[bordes[j]].inicio,
      fin: tramos[bordes[j + 1] - 1].fin,
      tramos: bordes[j + 1] - bordes[j],
      esperado: esperado[j],
    })),
  }
}

/**
 * El plan completo: en qué segundo del video tiene que aparecer cada pantalla y hasta
 * cuándo se queda.
 *
 * Devuelve null cuando no se puede armar —no hay archivo de voz, no hay ffmpeg, falta un
 * renglón—. En todos esos casos trae `aviso` explicando por qué, porque "el video salió
 * desfasado" es carísimo de diagnosticar mirando el video y baratísimo de leer acá.
 */
export async function planDeVoz(GUION, { dir, anticipo, colita } = {}) {
  const archivo = buscarNarracion(dir)
  if (!archivo) return null

  const T = GUION.tiempos ?? {}
  // Cuánto antes de su frase aparece la pantalla. Que la imagen entre un instante antes
  // de la voz se lee como natural; al revés —la voz antes de la imagen— se lee como error.
  const ANTICIPO = (anticipo ?? T.anticipoVoz ?? 350) / 1000
  // Lo que queda de cierre después de la última palabra.
  const COLITA = (colita ?? T.colitaVoz ?? 900) / 1000

  const { compases, mudas } = compasesDelGuion(GUION)
  if (mudas.length) return {
    archivo,
    aviso: `no tienen relato: ${mudas.join(', ')}.\n`
      + '   Con una pantalla muda en el medio no hay forma de saber cuándo termina, así que\n'
      + '   el video no puede seguir a la voz. Agregá su "voz" en el guion, o saquá la parada.',
  }

  let medido
  try {
    medido = await tramosDeVoz(archivo, {
      ruido: T.ruidoVoz ?? -35,
      detecta: (T.detectaVoz ?? 180) / 1000,
      corte: (T.corteVoz ?? 600) / 1000,
    })
  } catch (e) {
    return { archivo, aviso: `no se pudo medir la voz: ${String(e.message).split('\n')[0]}` }
  }

  const { renglones, error } = emparejar(medido.tramos, compases)
  if (error) return {
    archivo,
    aviso: `${error}.\n`
      + '   Si la voz tiene frases de más o de menos, lo más probable es que el texto que se\n'
      + '   le pasó al generador no sea el que imprime `npm run revisar`.\n'
      + '   Si son las pausas, se ajusta "corteVoz" en el bloque "tiempos" del guion.',
  }

  // Los momentos absolutos. El primero siempre en cero: el video arranca con la portada.
  const conTiempos = renglones.map((r, j) => ({
    ...r,
    aparece: j === 0 ? 0 : Math.max(0, r.inicio - ANTICIPO),
  }))
  conTiempos.forEach((r, j) => {
    r.hasta = j + 1 < conTiempos.length ? conTiempos[j + 1].aparece : medido.duracion + COLITA
    r.dura = r.hasta - r.aparece
  })

  return {
    archivo,
    duracion: medido.duracion,
    tramos: medido.tramos,
    renglones: conTiempos,
    fin: medido.duracion + COLITA,
    anticipo: ANTICIPO,
    porParada: new Map(conTiempos.filter(r => r.parada !== undefined).map(r => [r.parada, r])),
    de: clave => conTiempos.find(r => r.clave === clave),
  }
}
