/**
 * Lee `guion.json` y, si está mal escrito, muestra DÓNDE.
 *
 * POR QUÉ EXISTE
 * El guion se edita a mano en el Bloc de notas, así que los dedazos son parte del uso
 * normal, no una excepción. El mensaje que da Node —"Expected ',' or '}' after property
 * value in JSON at position 1174"— es correcto pero inútil para quien está editando: una
 * posición en caracteres no se busca en un editor de texto.
 *
 * Acá se traduce a lo único que sirve: el renglón, con los de alrededor y una marca
 * debajo del carácter exacto. Lo usan los tres comandos, para que el error se vea igual
 * venga de donde venga.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const ARCHIVO_GUION = join(AQUI, 'guion.json')

/** Traduce la posición que informa Node a renglón y columna. */
function ubicar(texto, mensaje) {
  // Node ya los calcula; si el formato cambiara, se recalculan desde la posición.
  const m = mensaje.match(/line (\d+) column (\d+)/)
  if (m) return { linea: Number(m[1]), columna: Number(m[2]) }
  const p = mensaje.match(/position (\d+)/)
  if (p) {
    const antes = texto.slice(0, Number(p[1])).split('\n')
    return { linea: antes.length, columna: antes[antes.length - 1].length + 1 }
  }

  // Algunos errores —"Unexpected token 'O', ...«trozo»... is not valid JSON"— no traen la
  // posición sino un pedazo del texto. Se busca ese pedazo en el archivo. Es el caso de la
  // comilla reemplazada por una letra, que es de los dedazos más frecuentes: sin esto,
  // justo el más común sería el único sin renglón.
  const trozo = mensaje.match(/\.\.\."([\s\S]*?)"\.\.\./)
  if (!trozo) return null
  const buscado = trozo[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')

  // Solo se informa el renglón si ese pedazo aparece UNA sola vez. Apareciendo varias, o
  // ninguna —pasa con los archivos guardados en Windows, que separan los renglones de otra
  // manera que el mensaje—, cualquier elección sería una adivinanza. Y señalar el renglón
  // equivocado es peor que no señalar ninguno: manda a buscar el problema donde no está.
  const donde = texto.indexOf(buscado)
  if (donde < 0 || texto.indexOf(buscado, donde + 1) >= 0) return null

  const antes = texto.slice(0, donde).split('\n')
  return { linea: antes.length, columna: antes[antes.length - 1].length + 1 }
}

/**
 * Busca comas de más: un renglón que termina en coma seguido de uno que cierra.
 *
 * Es el dedazo más frecuente de todos, y es el que peor informa el lector de JSON: dice
 * `Unexpected token ']'` y muestra un pedazo —un corchete y una llave— que en este archivo
 * aparece una vez por cada grupo. Con eso no se puede ubicar nada; buscándolo así, sí.
 *
 * Se informan TODAS las que encuentre, no la primera: si hay dos, arreglar una sola deja
 * el archivo roto igual y la próxima corrida parece decir que no se arregló nada.
 */
function comasDeMas(texto) {
  const lineas = texto.split(/\r?\n/)
  const encontradas = []
  for (let i = 0; i < lineas.length - 1; i++) {
    if (/,\s*$/.test(lineas[i]) && /^\s*[\]}]/.test(lineas[i + 1])) {
      encontradas.push({ linea: i + 1, texto: lineas[i].trim() })
    }
  }
  return encontradas
}

/** El renglón del problema y dos de contexto a cada lado, con una marca abajo. */
function alrededor(texto, linea, columna) {
  const lineas = texto.split('\n')
  const desde = Math.max(0, linea - 3)
  const hasta = Math.min(lineas.length, linea + 2)
  const ancho = String(hasta).length
  const salida = []
  for (let i = desde; i < hasta; i++) {
    const n = String(i + 1).padStart(ancho)
    const marca = i + 1 === linea ? '>' : ' '
    salida.push(`   ${marca} ${n} | ${lineas[i]}`)
    if (i + 1 === linea) salida.push(`     ${' '.repeat(ancho)} | ${' '.repeat(Math.max(0, columna - 1))}^`)
  }
  return salida.join('\n')
}

/**
 * Devuelve el guion ya leído. Si está mal escrito, explica dónde y corta.
 * No devuelve nunca un guion a medias: o está bien, o el programa no sigue.
 */
export function leerGuion() {
  if (!existsSync(ARCHIVO_GUION)) {
    console.error(`\n❌ No existe ${ARCHIVO_GUION}\n`)
    process.exit(1)
  }
  const texto = readFileSync(ARCHIVO_GUION, 'utf8')
  try {
    return JSON.parse(texto)
  } catch (e) {
    console.error(`\n❌ El guion está mal escrito.\n`)
    console.error(`   ${ARCHIVO_GUION}`)

    // Antes que nada, el dedazo más común. Si hay comas de más, es casi seguro la causa, y
    // decirlo acá evita el rodeo de traducir un mensaje que para este caso no ubica nada.
    const sobrantes = comasDeMas(texto)
    if (sobrantes.length) {
      console.error(`\n   ${sobrantes.length === 1 ? 'Sobra una coma' : `Sobran ${sobrantes.length} comas`}: el último de una lista no lleva.\n`)
      for (const s of sobrantes) console.error(`     Renglón ${s.linea}:  ${s.texto}`)
      console.error('\n   Sacá esa(s) coma(s) y volvé a probar.\n')
      process.exit(1)
    }

    const donde = ubicar(texto, e.message)
    if (donde) {
      console.error(`   Renglón ${donde.linea}, columna ${donde.columna}:\n`)
      console.error(alrededor(texto, donde.linea, donde.columna))
    } else {
      console.error('   No se pudo ubicar el renglón exacto.')
    }
    // El mensaje original SIEMPRE, aunque se haya podido ubicar el renglón. Es la única
    // fuente que no pasó por este archivo: si la ubicación estuviera mal, con esto se
    // puede comprobar en vez de salir a buscar a ciegas.
    console.error(`\n   Lo que informa el lector de JSON:\n   ${e.message}`)
    console.error(`
   Los dedazos típicos, en orden de frecuencia:
     · falta una coma al final de un renglón, o sobra en el último de un bloque
     · falta una comilla, o se la reemplazó sin querer por una letra
     · una comilla DENTRO de un texto: va escrita \\" o se usa comilla simple

   El problema suele estar en el renglón marcado o en el ANTERIOR: una coma que
   falta se nota recién al leer el renglón siguiente.

   No se tocó nada. El video que ya tengas sigue intacto.
`)
    process.exit(1)
  }
}

/**
 * Cuánto tiene que durar una parada.
 *
 * LA VOZ MANDA, NO EL RELOJ
 * Antes cada parada tenía su `espera` escrita a mano y el relato se escribía después. El
 * resultado es el previsible y se midió: todas las frases tardaban más en decirse que lo
 * que duraba su pantalla, así que la voz se iba corriendo y terminaba hablando sobre la
 * pantalla siguiente. Arreglarlo a mano, parada por parada, es un trabajo que hay que
 * rehacer entero cada vez que se cambia una palabra.
 *
 * Con `voz`, la duración se calcula del texto: lo que tarda en decirse más un respiro
 * para que no se encimen las frases. `espera` queda como mínimo, para las pantallas que
 * necesitan verse un rato aunque la frase sea corta.
 *
 * Las palabras por minuto son de locución tranquila, que es la que corresponde a alguien
 * que escucha esto por primera vez. Se ajusta en el bloque `tiempos` del guion.
 */
export function duracionDeParada(parada, tiempos = {}) {
  const minimo = parada.espera ?? 2500
  if (!parada.voz) return minimo
  const palabras = parada.voz.trim().split(/\s+/).filter(Boolean).length
  const ppm = tiempos.palabrasPorMinuto ?? 145
  const respiro = tiempos.respiroVoz ?? 600
  return Math.max(minimo, Math.round(palabras / ppm * 60_000) + respiro)
}
