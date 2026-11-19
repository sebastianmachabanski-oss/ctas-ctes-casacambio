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
