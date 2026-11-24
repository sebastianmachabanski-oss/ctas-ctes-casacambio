/**
 * Credenciales de Supabase para los scripts, leídas del `.env.local`.
 *
 * POR QUÉ NO SE TIPEAN EN LA LÍNEA DE COMANDOS
 * Tipear la service_role key en la terminal la deja en el historial, y pegar la URL a
 * mano invita a equivocarse de base — que en un script que ESCRIBE es el error caro.
 * `npm run base <nombre>` ya deja el `.env.local` apuntando a la base elegida, así que
 * alcanza con elegirla antes.
 *
 * Lo que ya venga en el ambiente GANA: si alguien exporta las variables a propósito, esa
 * decisión manda sobre el archivo.
 *
 * Estaba adentro de `sembrar-cheques-demo.mts` y los otros sembradores no la tenían: el
 * 24/11/2026 `continuar-demo.mts` falló por eso, pidiendo variables que el resto de los
 * scripts no necesita. Vive acá para que todos se comporten igual.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

/** La URL del proyecto, sin la barra final (ver la nota en `crear-primer-admin.mts`). */
export const urlDeSupabase = (): string | undefined =>
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, '')

/** La clave de servicio. Es la que saltea RLS: nunca se commitea ni se muestra. */
export const claveDeServicio = (): string | undefined =>
  process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

/** El mensaje cuando faltan, igual en todos los scripts. */
export const FALTAN_CREDENCIALES =
  'No se encontraron las credenciales de Supabase.\n'
  + '   Se buscan en el `.env.local` del proyecto y después en el ambiente.\n'
  + '   Corré el script desde la raíz del proyecto, con `npm run base <base>` hecho antes.\n'
  + '   `npm run base` sin argumentos te dice a cuál está apuntando ahora.'

/**
 * Revisa que la URL sirva ANTES de pasársela al cliente de Supabase.
 *
 * Sin esto, una URL mal formada muere adentro de `@supabase/supabase-js` con un
 * `Invalid supabaseUrl` y siete líneas de stack que no dicen de dónde salió el valor —
 * que es lo que importa, porque son dos lugares distintos y el del ambiente le gana al
 * archivo. Pasó el 24/11/2026 con una variable exportada a mano que todavía tenía el
 * `<ref>` de la plantilla adentro.
 *
 * Devuelve el motivo del rechazo, o `null` si la URL sirve.
 */
export function problemaDeLaUrl(url: string): string | null {
  const delArchivo = leidaDelArchivo.has('SUPABASE_URL')
    || leidaDelArchivo.has('NEXT_PUBLIC_SUPABASE_URL')
  const origen = delArchivo
    ? 'Sale del `.env.local`: revisá esa línea.'
    : 'Sale de una variable del AMBIENTE, que le gana al `.env.local`. Si la exportaste\n'
      + '   a mano, borrala para que mande el archivo:\n'
      + '     Remove-Item Env:SUPABASE_URL, Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue'

  let host: string
  try { host = new URL(url).host } catch {
    return `La URL de Supabase no es válida: ${url}\n   ${origen}\n`
      + '   Tiene que ser como https://abcdefgh.supabase.co, sin < >, comillas ni espacios.'
  }
  if (!/^[a-z0-9-]+\.supabase\.(co|in)$/i.test(host)) {
    return `La URL de Supabase apunta a "${host}", que no parece un proyecto de Supabase.\n   ${origen}`
  }
  return null
}

/** Qué claves salieron del archivo, para poder decir de dónde viene cada valor. */
const leidaDelArchivo = new Set<string>()
