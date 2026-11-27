/**
 * Credenciales de Supabase para los scripts de línea de comandos.
 *
 * DÓNDE SE BUSCAN
 * En el `.env.local`, que es el que `npm run base <base>` deja apuntando a la base
 * elegida, y después en el ambiente —lo que ya venga exportado GANA sobre el archivo, por
 * si alguien lo quiere forzar—.
 *
 * Tipear la service_role key en la terminal la deja en el historial, y pegar la URL a
 * mano invita a equivocarse de base, que en un script que ESCRIBE es el error caro.
 *
 * QUIÉN ELIGE EL PAR
 * `credencialesSupabase()`, que ya existía en `src/lib/cotizaciones/guardar.ts` y tiene
 * su propio validador (ver scripts/validar-cotizaciones.mts, bloque 8). Toma la URL y la
 * clave DE A PARES para no combinar nunca la dirección de un proyecto con la clave de
 * otro —ese error contesta "Invalid API key", que no sugiere mirar la URL— y les hace
 * `trim`, porque una clave copiada con un salto de línea falla igual y no se ve.
 *
 * Este módulo agrega las dos cosas que esa función no hace: leer el archivo, y revisar
 * que la URL sirva antes de que muera adentro del cliente de Supabase.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { credencialesSupabase } from '../src/lib/cotizaciones/guardar'

/** Qué claves salieron del archivo, para poder decir de dónde viene cada valor. */
const leidaDelArchivo = new Set<string>()

export function cargarEnvLocal(archivo = '.env.local'): void {
  let texto: string
  try { texto = readFileSync(resolve(process.cwd(), archivo), 'utf8') } catch { return }
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    const valor = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[m[1]] === undefined) { process.env[m[1]] = valor; leidaDelArchivo.add(m[1]) }
  }
}

export type Credenciales = { url: string; key: string; proyecto: string; origen: string }

/**
 * Las credenciales listas para usar, o el motivo por el que no se puede.
 *
 * Carga el archivo si hace falta, elige el par y revisa la URL. El chequeo de la URL se
 * hace ACÁ y no adentro de `createClient`, que muere con un `Invalid supabaseUrl` y un
 * stack que no dice de cuál de los dos lugares salió el valor — que es lo único que
 * importa, porque son dos y el del ambiente le gana al archivo.
 *
 *     const cred = credenciales()
 *     if ('problema' in cred) salir(cred.problema)
 */
export function credenciales(): Credenciales | { problema: string } {
  cargarEnvLocal()
  const c = credencialesSupabase()
  if (!c) return {
    problema: 'No se encontraron las credenciales de Supabase.\n'
      + '   Se buscan en el `.env.local` del proyecto y después en el ambiente.\n'
      + '   Corré el script desde la raíz del proyecto, con `npm run base <base>` hecho antes.\n'
      + '   `npm run base` sin argumentos te dice a cuál está apuntando ahora.',
  }

  const delArchivo = c.origen.split(' + ').some(n => leidaDelArchivo.has(n))
  const deDonde = delArchivo
    ? `Sale del \`.env.local\` (${c.origen}): revisá esa línea.`
    : `Sale de variables del AMBIENTE (${c.origen}), que le ganan al \`.env.local\`.\n`
      + '   Si las exportaste a mano, borralas para que mande el archivo:\n'
      + '     Remove-Item Env:SUPABASE_URL, Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue'

  let host: string
  try { host = new URL(c.url).host } catch {
    return {
      problema: `La URL de Supabase no es válida: ${c.url}\n   ${deDonde}\n`
        + '   Tiene que ser como https://abcdefgh.supabase.co, sin < >, comillas ni espacios.',
    }
  }
  if (!/^[a-z0-9-]+\.supabase\.(co|in)$/i.test(host)) return {
    problema: `La URL de Supabase apunta a "${host}", que no parece un proyecto de Supabase.\n   ${deDonde}`,
  }
  return c
}
