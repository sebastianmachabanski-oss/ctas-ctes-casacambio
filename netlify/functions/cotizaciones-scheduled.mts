/**
 * Foto periódica de las cotizaciones de mercado. Ver src/lib/cotizaciones.
 *
 * Cada quince minutos lee dolarhoy, dolarapi y monitorargy, y guarda lo que cambió. Es lo
 * que va juntando la serie con la que después se mide cuánto se separan las fuentes entre
 * sí — y, con eso, si el lector de HTML de dolarhoy hace falta o se puede tirar.
 *
 * ── POR QUÉ CADA QUINCE MINUTOS ────────────────────────────────────────────
 * Para que cada operación se pueda comparar contra la cotización que estaba vigente a la
 * hora en que se cargó, y no contra un promedio del día. En una casa de cambio el dólar se
 * mueve dentro de la jornada, y un promedio diario borra justamente lo que se quiere ver.
 * Como solo se guarda lo que cambió, la frecuencia alta no infla la tabla.
 *
 * ── NO ES UNA FUNCIÓN BACKGROUND ───────────────────────────────────────────
 * Las programadas tienen 30 segundos. Alcanza: son seis pedidos en paralelo con 15 a 20
 * segundos de tope cada uno. El sync de la planilla sí necesita una background porque
 * puede tardar minutos; esto no.
 *
 * ── SI ALGO FALLA ──────────────────────────────────────────────────────────
 * Una fuente caída NO interrumpe a las otras: se guarda lo que haya y el problema queda en
 * el log de la función. Lo que nunca pasa es guardar un valor que no pasó los controles
 * (ver `problemaDe` en src/lib/cotizaciones/tipos.ts): un dato que falta se nota al
 * mirarlo, uno equivocado se usa para decidir.
 */
import { createClient } from '@supabase/supabase-js'
import { tomarCotizaciones } from '../../src/lib/cotizaciones/index'
import { guardarToma } from '../../src/lib/cotizaciones/guardar'

export const config = { schedule: '*/15 * * * *' }

export default async function handler() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[cotizaciones] faltan SUPABASE_URL y SERVICE_ROLE_KEY')
    return new Response('sin credenciales', { status: 500 })
  }

  const toma = await tomarCotizaciones()
  for (const p of toma.problemas) console.warn(`[cotizaciones] ${p}`)
  for (const f of toma.fuentesCaidas) console.error(`[cotizaciones] sin datos válidos de ${f}`)

  const db = createClient(url, key, { auth: { persistSession: false } })
  const g = await guardarToma(db, toma)
  for (const e of g.errores) console.error(`[cotizaciones] ${e}`)

  const resumen = {
    tomadaEn: toma.tomadaEn,
    leidas: toma.cotizaciones.length,
    nuevas: g.nuevas,
    repetidas: g.repetidas,
    fuentesCaidas: toma.fuentesCaidas,
    problemas: toma.problemas.length,
    errores: g.errores.length,
  }
  console.log('[cotizaciones]', JSON.stringify(resumen))

  // Las tres caídas a la vez es un problema de red nuestro, no de los sitios: se devuelve
  // error para que quede marcada la ejecución y no pase por una corrida normal.
  const todoMal = toma.fuentesCaidas.length === 3
  return new Response(JSON.stringify(resumen), {
    status: todoMal ? 503 : 200,
    headers: { 'content-type': 'application/json' },
  })
}
