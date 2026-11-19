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
 * De dónde salen las credenciales de Supabase, y por qué van DE A PARES.
 *
 * Hay dos juegos de nombres dando vueltas: los que documenta docs/NUEVO-CLIENTE.md y usa
 * el sitio, y los que usaba el sync de la planilla. Eligiendo cada variable por separado
 * —la URL del primer nombre que aparezca, la clave del primero que aparezca— se puede
 * terminar con la dirección de un proyecto y la clave de otro. Supabase contesta
 * `Invalid API key`, que no sugiere en absoluto que el problema sea la URL.
 *
 * Pasó el 19/11/2026: la función leyó las once cotizaciones sin un error y no pudo
 * guardar ninguna. Por eso acá se toman los dos nombres del MISMO juego o ninguno, y se
 * informa cuál se usó.
 */
export function credencialesSupabase(): { url: string; key: string; origen: string; proyecto: string } | null {
  const JUEGOS: [string, string][] = [
    // Las del sitio. Son las que docs/NUEVO-CLIENTE.md manda cargar en todo despliegue.
    ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    // Las del sync y los scripts de línea de comandos.
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
