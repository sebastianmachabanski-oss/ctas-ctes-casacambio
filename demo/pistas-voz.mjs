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
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
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
    if (GUION.portada.voz) compases.push({ clave: 'portada', voz: GUION.portada.voz, titulo: 'PORTADA', pausaDespues: GUION.portada.pausaDespues, frases: GUION.portada.frases })
    else mudas.push('la portada')
  }
  ;(GUION.paradas ?? []).forEach((p, i) => {
    if (p.voz) compases.push({ clave: i, parada: i, voz: p.voz, titulo: p.titulo ?? `parada ${i + 1}`, pausaDespues: p.pausaDespues, frases: p.frases })
    else mudas.push(`la parada ${i + 1} ("${p.titulo ?? ''}")`)
  })
  if (GUION.cierre) {
    if (GUION.cierre.voz) compases.push({ clave: 'cierre', voz: GUION.cierre.voz, titulo: 'CIERRE', pausaDespues: GUION.cierre.pausaDespues, frases: GUION.cierre.frases })
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
/** Cuántas oraciones tiene un renglón. La voz hace una pausa entera en cada punto. */
export function contarOraciones(texto) {
  return Math.max(1, (texto.trim().match(/[^.!?…]+[.!?…]*/g) ?? []).filter(t => t.trim()).length)
}

export function emparejar(tramos, compases) {
  const N = tramos.length
  const M = compases.length

  // Cuántas frases del audio le tocan a cada renglón. `frases` en el guion lo CLAVA; si no
  // está, el piso son sus oraciones —la voz hace una pausa entera en cada punto, así que un
  // renglón con dos oraciones nunca puede ocupar una sola frase— y el techo queda libre.
  const piso = compases.map(c => Math.max(1, c.frases ?? contarOraciones(c.voz)))
  const techo = compases.map(c => c.frases ?? N)
  const minimo = piso.reduce((a, b) => a + b, 0)

  if (N < minimo) return {
    error: `la voz tiene ${N} frase(s) y el guion necesita al menos ${minimo}`,
    detalle: compases.map((c, j) => ({ titulo: c.titulo, piso: piso[j], fijo: c.frases !== undefined })),
  }
  const maximo = techo.reduce((a, b) => a + b, 0)
  if (N > maximo) return {
    error: `la voz tiene ${N} frase(s) y los "frases" del guion suman ${maximo}`,
  }

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
    for (let i = 1; i <= N; i++) {
      for (let k = 0; k < i; k++) {
        if (costo[j - 1][k] === INF) continue
        const cuantas = i - k
        if (cuantas < piso[j - 1] || cuantas > techo[j - 1]) continue
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
    bordes,
    renglones: compases.map((c, j) => ({
      ...c,
      inicio: tramos[bordes[j]].inicio,
      fin: tramos[bordes[j + 1] - 1].fin,
      tramos: bordes[j + 1] - bordes[j],
      oraciones: contarOraciones(c.voz),
      palabras: palabras[j],
      esperado: esperado[j],
      // Lo mínimo que tarda cualquiera en decir ese texto. 260 palabras por minuto es más
      // rápido que un locutor apurado: por debajo de eso no es que quedó justo, es que el
      // reparto le asignó una frase que no es la suya.
      minimoHumano: palabras[j] / 260 * 60,
      // El tiempo HABLADO, sin los silencios de adentro. Un renglón que ocupa tres frases
      // abarca dos silencios de un segundo que no son voz: midiéndolo de punta a punta
      // parecería que le sobra tiempo y se lo marcaría como mal repartido estando bien.
      habla: habla.slice(bordes[j], bordes[j + 1]).reduce((a, b) => a + b, 0),
      // Qué tan lejos quedó de lo que haría falta para decir ese texto. Es lo que delata
      // un reparto equivocado sin tener que escuchar: una frase de diecisiete sílabas no
      // se dice en nueve décimas, y si el reparto dice que sí, el reparto está mal.
      holgura: habla.slice(bordes[j], bordes[j + 1]).reduce((a, b) => a + b, 0) - esperado[j],
    })),
  }
}

/**
 * Estira los silencios ENTRE FRASES del archivo de voz, sin tocar las frases.
 *
 * ── PARA QUÉ ───────────────────────────────────────────────────────────────
 * El relato viene pegado: una frase atrás de la otra con un segundo de aire. En un video
 * de pantallas eso se siente apurado por dos motivos distintos, y los dos se arreglan acá.
 *
 *  · La pantalla TARDA EN CARGAR. Contra una base de verdad son dos o tres segundos. Si el
 *    aire entre frases es un segundo, la pantalla no llega a aparecer antes de que la voz
 *    empiece a hablar de ella.
 *  · Quien mira NO CONOCE el sistema. Una pantalla llena de números necesita un momento de
 *    silencio para que el ojo la recorra antes de que le cuenten qué es.
 *
 * ── POR QUÉ ACÁ Y NO REGENERANDO LA VOZ ────────────────────────────────────
 * Porque las pausas de un generador de voz no se pueden pedir con precisión, y cada vuelta
 * de prueba obliga a volver al generador, bajar el archivo y copiarlo. Estirando el
 * silencio del archivo que ya está, el ritmo se ajusta cambiando un número del guion.
 *
 * La voz no se altera: no se acelera, no se corta, no se vuelve a sintetizar. Se recortan
 * los tramos hablados tal cual están y se los pega con más silencio en el medio.
 *
 * Los silencios de ADENTRO de una frase —una coma, un punto y seguido— no se tocan: si se
 * estiraran, la frase sonaría dictada.
 */
export async function prepararVoz(GUION, dir) {
  const original = buscarNarracion(dir)
  if (!original) return { archivo: null }

  const T = GUION.tiempos ?? {}
  const PAUSA = (T.pausaEntreFrases ?? 0) / 1000
  const { compases, mudas } = compasesDelGuion(GUION)
  const extras = compases.map(c => (c.pausaDespues ?? 0) / 1000)

  // Sin pausas pedidas no hay nada que hacer, y con una parada muda no se sabe a cuál de
  // los silencios le corresponde cada número.
  if ((PAUSA <= 0 && !extras.some(x => x > 0)) || mudas.length) return { archivo: original, original }

  const deteccion = {
    ruido: T.ruidoVoz ?? -35,
    detecta: (T.detectaVoz ?? 180) / 1000,
    corte: (T.corteVoz ?? 600) / 1000,
  }

  const salida = join(dir, 'salida')
  mkdirSync(salida, { recursive: true })
  const destino = join(salida, 'voz-con-pausas.wav')
  const ficha = join(salida, 'voz-con-pausas.json')

  // Se rehace solo si cambió algo: el archivo de voz, las pausas pedidas o la detección.
  // Sin esta comprobación, grabar y convertir lo reconstruirían dos veces por corrida.
  const info = statSync(original)
  const huella = JSON.stringify({
    origen: basename(original), mtime: Math.round(info.mtimeMs), tam: info.size,
    PAUSA, extras, ...deteccion,
  })
  if (existsSync(destino) && existsSync(ficha)) {
    try {
      // La ficha guarda también los dos largos, para poder informarlos sin rehacer el
      // archivo: `npm run mp4` corre después del grabador y encuentra todo hecho.
      const previa = JSON.parse(readFileSync(ficha, 'utf8'))
      if (previa.huella === huella) {
        return { archivo: destino, original, hecho: false, antes: previa.antes, ahora: previa.ahora }
      }
    } catch {}
  }

  const { duracion, tramos } = await tramosDeVoz(original, deteccion)
  const { bordes, error } = emparejar(tramos, compases)
  if (error) return { archivo: original, original, aviso: error }

  // Los silencios que separan FRASES son los que caen en un borde de renglón. A cada uno
  // se le pide la pausa general más la propia de esa parada, y se respeta el que ya venía
  // si era más largo: nunca se acorta el relato.
  const bordeDe = new Map(bordes.slice(1, -1).map((b, j) => [b, j]))
  const piezas = []
  for (let i = 0; i < tramos.length; i++) {
    piezas.push({ tipo: 'voz', desde: tramos[i].inicio, hasta: tramos[i].fin })
    if (i + 1 >= tramos.length) break
    const tenia = tramos[i + 1].inicio - tramos[i].fin
    const j = bordeDe.get(i + 1)
    const pedido = j === undefined ? tenia : PAUSA + (extras[j] ?? 0)
    piezas.push({ tipo: 'silencio', dura: Math.max(tenia, pedido) })
  }
  // La colita del final se conserva tal cual: el cierre ya tiene su propio silencio.
  const cola = duracion - tramos[tramos.length - 1].fin
  if (cola > 0.05) piezas.push({ tipo: 'silencio', dura: cola })

  // Un filtro solo: se recortan los tramos hablados del original, se generan los silencios
  // de una fuente muda y se pega todo en orden.
  const voces = piezas.filter(p => p.tipo === 'voz').length
  const silencios = piezas.filter(p => p.tipo === 'silencio').length
  const formato = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo'
  const filtros = [
    `[0:a]${formato},asplit=${voces}${Array.from({ length: voces }, (_, i) => `[v${i}]`).join('')}`,
    `[1:a]${formato},asplit=${silencios}${Array.from({ length: silencios }, (_, i) => `[m${i}]`).join('')}`,
  ]
  const orden = []
  let nv = 0, ns = 0
  for (const p of piezas) {
    if (p.tipo === 'voz') {
      filtros.push(`[v${nv}]atrim=start=${p.desde.toFixed(3)}:end=${p.hasta.toFixed(3)},asetpts=N/SR/TB[p${orden.length}]`)
      nv++
    } else {
      filtros.push(`[m${ns}]atrim=duration=${p.dura.toFixed(3)},asetpts=N/SR/TB[p${orden.length}]`)
      ns++
    }
    orden.push(`[p${orden.length}]`)
  }
  filtros.push(`${orden.join('')}concat=n=${orden.length}:v=0:a=1[fin]`)

  await ejecutar('ffmpeg', ['-nostdin', '-y', '-v', 'error',
    '-i', original,
    '-f', 'lavfi', '-t', String(Math.ceil(duracion) + 120), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', filtros.join(';'), '-map', '[fin]',
    '-c:a', 'pcm_s16le', destino,
  ], { maxBuffer: 1024 * 1024 * 64 })

  const nueva = await tramosDeVoz(destino, deteccion)
  writeFileSync(ficha, JSON.stringify({ huella, antes: duracion, ahora: nueva.duracion }))
  return { archivo: destino, original, hecho: true, antes: duracion, ahora: nueva.duracion }
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
  if (!buscarNarracion(dir)) return null

  // Primero se le ponen las pausas pedidas; lo que se mide después es el archivo que
  // realmente va a sonar en el video. Medir el original y mezclar el espaciado sería
  // sincronizar contra un archivo que no es el que se escucha.
  const preparada = await prepararVoz(GUION, dir)
  const archivo = preparada.archivo
  if (preparada.aviso) return { archivo, aviso: preparada.aviso }

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
    original: preparada.original,
    espaciada: archivo !== preparada.original,
    duracion: medido.duracion,
    duracionOriginal: preparada.antes,
    tramos: medido.tramos,
    renglones: conTiempos,
    fin: medido.duracion + COLITA,
    anticipo: ANTICIPO,
    porParada: new Map(conTiempos.filter(r => r.parada !== undefined).map(r => [r.parada, r])),
    de: clave => conTiempos.find(r => r.clave === clave),
    /** El renglón que viene después de `r`, o null si es el último. */
    proximo: r => conTiempos[conTiempos.indexOf(r) + 1] ?? null,
  }
}
