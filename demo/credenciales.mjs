/**
 * Carga `demo/credenciales.local` en el entorno, si existe.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Las variables de entorno viven solo en la ventana de terminal donde se escribieron: al
 * abrir una nueva se pierden y el grabador corta pidiéndolas. Pasa seguido, porque la
 * ventana del grabador es justamente la que se cierra y se vuelve a abrir mientras se
 * prueba.
 *
 * POR QUÉ ESTÁ APARTE Y NO ADENTRO DEL GRABADOR
 * Lo usan el grabador y el revisor. Si solo lo leyera el grabador, el revisor calcularía
 * la duración con los tiempos del guion mientras la grabación usa otro, y anunciaría un
 * número que no se corresponde con el video. Un revisor que miente es peor que no tenerlo.
 *
 * Lo que ya esté puesto en el entorno MANDA sobre el archivo, así una prueba puntual
 * (`$env:DEMO_ESPERA=5000`) no obliga a editarlo.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

export const ARCHIVO = join(AQUI, 'credenciales.local')

export function cargarCredenciales() {
  if (!existsSync(ARCHIVO)) return false
  for (const linea of readFileSync(ARCHIVO, 'utf8').split('\n')) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue
    const corte = limpia.indexOf('=')
    if (corte < 1) continue
    const nombre = limpia.slice(0, corte).trim()
    // Se admiten comillas alrededor del valor, porque es lo que uno copia de PowerShell.
    const valor = limpia.slice(corte + 1).trim().replace(/^["'](.*)["']$/, '$1')
    if (!process.env[nombre]) process.env[nombre] = valor
  }
  return true
}
