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
  const donde = texto.indexOf(buscado)
  if (donde < 0) return null
  const antes = texto.slice(0, donde).split('\n')
  return { linea: antes.length, columna: antes[antes.length - 1].length + 1 }
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
    const donde = ubicar(texto, e.message)
    console.error(`\n❌ El guion está mal escrito.\n`)
    console.error(`   ${ARCHIVO_GUION}`)
    if (donde) {
      console.error(`   Renglón ${donde.linea}, columna ${donde.columna}:\n`)
      console.error(alrededor(texto, donde.linea, donde.columna))
    } else {
      console.error(`   ${e.message}`)
    }
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
