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
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor
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
