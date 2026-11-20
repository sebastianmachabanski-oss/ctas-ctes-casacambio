/**
 * Compara las fuentes de cotizaciones entre sí y dice SI YA SE PUEDE DECIDIR.
 *
 * ── LA DECISIÓN QUE ESTO RESUELVE ──────────────────────────────────────────
 * El cliente mira dolarhoy, que no tiene API y hay que leer scrapeando su HTML: se rompe
 * el día que cambien el diseño. dolarapi es una API y no tiene ese problema. Si dolarapi
 * reproduce a dolarhoy, el lector de HTML se tira y nos quedamos solo con APIs.
 *
 * ── POR QUÉ NO ALCANZA CON ESPERAR DOS SEMANAS ─────────────────────────────
 * Porque en un mercado quieto dos fuentes cualesquiera coinciden. La diferencia aparece
 * cuando el dólar se mueve de verdad y una actualiza más lento que la otra. Dos semanas
 * planas no prueban nada, y decidir sobre eso es decidir sobre ruido.
 *
 * Por eso además de medir, esto exige evidencia: días suficientes, mediciones suficientes
 * y AL MENOS UN DÍA MOVIDO. Si falta algo, lo dice y no da veredicto.
 *
 * El cálculo vive acá y no en el script para poder probarlo con casos armados, igual que
 * `posicion.ts` y `ganancias-tt.ts`. El validador es scripts/validar-cotizaciones.mts.
 */
import type { Clave, Fuente } from './tipos'

/**
 * Cuánto puede separarse dolarapi de dolarhoy y seguir sirviendo como reemplazo.
 *
 * Sale del spread de la operación, que anda en el 1,2% —20 pesos sobre 1.640—. Un
 * referencial corrido 0,3% son 5 pesos sobre un margen de 20: ensucia la conclusión en un
 * cuarto, que es tolerable. Corrido 1,5% son 24 pesos sobre 20: la da vuelta. La raya está
 * donde el error del referencial queda por debajo de un cuarto de lo que se está midiendo.
 */
export const TOLERANCIA_PCT = 0.30

/** Variación intradiaria a partir de la cual un día cuenta como "movido". */
export const MOVIMIENTO_FUERTE_PCT = 1.0

/** Mínimos de evidencia antes de dar un veredicto. */
export const DIAS_MINIMOS = 7
export const MEDICIONES_MINIMAS = 100

export type FilaGuardada = {
  tomada_en: string
  fuente: Fuente
  clave: Clave | string
  venta: number | null
}

export type Comparacion = {
  clave: string
  mediciones: number
  promedio: number
  peor: number
  /** La diferencia se mantuvo siempre bajo la tolerancia. */
  sirve: boolean
}

export type Veredicto = {
  comparaciones: Comparacion[]
  desde: string | null
  hasta: string | null
  dias: number
  diasMovidos: number
  mediciones: number
  /** Hay evidencia suficiente para decidir. */
  alcanza: boolean
  /** Si no alcanza, qué falta. */
  faltan: string[]
}

/** El día en Argentina, que es el que importa para agrupar: el servidor corre en UTC. */
export function diaArgentino(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

/**
 * Compara `fuente` contra `referencia` y mide si hubo días movidos.
 *
 * Las dos fuentes casi nunca tienen la misma marca de tiempo, porque solo se guarda lo que
 * cambia. Así que para cada lectura de la referencia se busca el valor de la otra VIGENTE
 * EN ESE MOMENTO, que es lo que una persona habría visto mirando las dos pantallas a la vez.
 */
export function compararFuentes(
  filas: FilaGuardada[],
  referencia: Fuente = 'dolarhoy',
  fuente: Fuente = 'dolarapi',
): Veredicto {
  const utiles = filas
    .filter(f => f.venta != null && Number.isFinite(Number(f.venta)))
    .sort((a, b) => a.tomada_en.localeCompare(b.tomada_en))

  const claves = Array.from(new Set(utiles.map(f => String(f.clave)))).sort()
  const comparaciones: Comparacion[] = []
  let mediciones = 0

  for (const clave of claves) {
    const deRef = utiles.filter(f => f.fuente === referencia && String(f.clave) === clave)
    const deOtra = utiles.filter(f => f.fuente === fuente && String(f.clave) === clave)
    if (!deRef.length || !deOtra.length) continue

    const difs: number[] = []
    let i = 0, vigente: number | null = null
    for (const r of deRef) {
      // Avanza la otra fuente hasta el último valor anterior o igual a esta lectura.
      while (i < deOtra.length && deOtra[i].tomada_en <= r.tomada_en) {
        vigente = Number(deOtra[i].venta); i++
      }
      if (vigente == null) continue // la otra fuente todavía no había publicado nada
      const v = Number(r.venta)
      if (v === 0) continue
      difs.push(Math.abs(v - vigente) / v * 100)
    }
    if (!difs.length) continue

    const peor = Math.max(...difs)
    comparaciones.push({
      clave,
      mediciones: difs.length,
      promedio: difs.reduce((a, b) => a + b, 0) / difs.length,
      peor,
      sirve: peor < TOLERANCIA_PCT,
    })
    mediciones += difs.length
  }

  // ── Días movidos ──────────────────────────────────────────────────────────
  // Se mide sobre el blue, que es el que manda, y con las dos fuentes juntas: lo que
  // interesa es si el mercado se movió, no cuál de las dos lo vio primero.
  const porDia = new Map<string, number[]>()
  for (const f of utiles) {
    if (String(f.clave) !== 'blue') continue
    const d = diaArgentino(f.tomada_en)
    const g = porDia.get(d)
    if (g) g.push(Number(f.venta)); else porDia.set(d, [Number(f.venta)])
  }
  let diasMovidos = 0
  porDia.forEach(vals => {
    const min = Math.min(...vals), max = Math.max(...vals)
    if (min > 0 && (max - min) / min * 100 >= MOVIMIENTO_FUERTE_PCT) diasMovidos++
  })

  const fechas = utiles.map(f => diaArgentino(f.tomada_en)).sort()
  const dias = new Set(fechas).size

  const faltan: string[] = []
  if (dias < DIAS_MINIMOS) faltan.push(`solo ${dias} día(s) medido(s); hacen falta ${DIAS_MINIMOS}`)
  if (mediciones < MEDICIONES_MINIMAS)
    faltan.push(`solo ${mediciones} medición(es); hacen falta ${MEDICIONES_MINIMAS}`)
  if (diasMovidos === 0)
    faltan.push('ningún día con movimiento fuerte: en un mercado quieto dos fuentes '
      + 'cualesquiera coinciden, así que todavía no probó nada')
  if (!comparaciones.length) faltan.push('no hay ninguna moneda con las dos fuentes a la vez')

  return {
    comparaciones,
    desde: fechas[0] ?? null,
    hasta: fechas[fechas.length - 1] ?? null,
    dias,
    diasMovidos,
    mediciones,
    alcanza: faltan.length === 0,
    faltan,
  }
}
