/**
 * Guardado de una toma de cotizaciones.
 *
 * Vive acá y no en el script ni en la función programada porque lo usan los dos: el script
 * para correrlo a mano, y la función para hacerlo cada quince minutos. Duplicarlo sería
 * garantizar que en algún momento dejen de guardar lo mismo.
 *
 * SOLO SE INSERTA LO QUE CAMBIÓ. Una foto cada quince minutos durante un año son cientos
 * de miles de filas casi todas repetidas. Comparando contra la última guardada de esa
 * fuente y esa moneda, la tabla pasa a ser la historia de los CAMBIOS, que ocupa una
 * fracción y además es lo que se quiere consultar: cuándo se movió y cuánto.
 */
import type { Cotizacion, Toma } from './index'

/**
 * De dónde salen las credenciales de Supabase.
 *
 * ── EL MISMO ORDEN QUE LA APP, Y NO OTRO (19/11/2026) ──────────────────────
 * Hay dos nombres posibles para la clave de servicio, y `createAdminClient` —que escribe
 * en producción todos los días y funciona— elige así:
 *
 *     process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
 *
 * Esta función hacía lo inverso: prefería `SERVICE_ROLE_KEY`. Con las dos variables
 * cargadas y la vieja ya sin valor útil, el resultado fue que la app andaba y la función
 * programada no: leyó las once cotizaciones sin un error y falló las once escrituras con
 * `Invalid API key`, apuntando al mismo proyecto que la app.
 *
 * La regla, entonces, es copiar la de la app en vez de inventar una. Y los nombres se
 * toman DE A PARES para no combinar nunca la dirección de un proyecto con la clave de
 * otro: ese error contesta "clave inválida", que no sugiere mirar la URL.
 */
export function credencialesSupabase(): { url: string; key: string; origen: string; proyecto: string } | null {
  const JUEGOS: [string, string][] = [
    // Las del sitio, en el MISMO orden que createAdminClient.
    ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    ['NEXT_PUBLIC_SUPABASE_URL', 'SERVICE_ROLE_KEY'],
    // Las de los scripts de línea de comandos, donde no hay NEXT_PUBLIC_* cargadas.
    ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    ['SUPABASE_URL', 'SERVICE_ROLE_KEY'],
  ]
  for (const [nombreUrl, nombreKey] of JUEGOS) {
    // El `trim` no es decorativo: una clave copiada con un salto de línea al final da el
    // mismo `Invalid API key` y es de las cosas más difíciles de ver mirando el panel.
    const url = process.env[nombreUrl]?.trim().replace(/\/+$/, '')
    const key = process.env[nombreKey]?.trim()
    if (url && key) {
      return {
        url, key,
        origen: `${nombreUrl} + ${nombreKey}`,
        // La referencia del proyecto, que no es secreta, para ver de un vistazo si la
        // dirección es la que se esperaba.
        proyecto: url.replace(/^https?:\/\//, '').split('.')[0],
      }
    }
  }
  return null
}

/** Lo mínimo que se necesita de un cliente de Supabase, para poder probar esto sin uno. */
type Db = {
  from: (tabla: string) => any
}

export type Guardado = { nuevas: number; repetidas: number; errores: string[] }

/** Dos cotizaciones son la misma si coinciden compra y venta, nulos incluidos. */
export function sinCambios(ultima: any, c: Cotizacion): boolean {
  if (!ultima) return false
  const igual = (a: any, b: number | null) =>
    (a == null && b == null) || (a != null && b != null && Number(a) === Number(b))
  return igual(ultima.compra, c.compra) && igual(ultima.venta, c.venta)
}

export async function guardarToma(db: Db, toma: Toma): Promise<Guardado> {
  const out: Guardado = { nuevas: 0, repetidas: 0, errores: [] }

  for (const c of toma.cotizaciones) {
    const { data: ultima, error: eSel } = await db
      .from('cotizaciones_mercado')
      .select('compra, venta')
      .eq('fuente', c.fuente).eq('clave', c.clave)
      .order('tomada_en', { ascending: false })
      .limit(1).maybeSingle()

    if (eSel) { out.errores.push(`${c.fuente}/${c.clave}: al leer la última — ${eSel.message}`); continue }
    if (sinCambios(ultima, c)) { out.repetidas++; continue }

    const { error } = await db.from('cotizaciones_mercado').insert({
      tomada_en: toma.tomadaEn,
      fuente: c.fuente,
      clave: c.clave,
      compra: c.compra,
      venta: c.venta,
      actualizado: c.actualizado,
      actualizado_texto: c.actualizadoTexto,
    })
    if (error) { out.errores.push(`${c.fuente}/${c.clave}: al guardar — ${error.message}`); continue }
    out.nuevas++
  }

  return out
}
