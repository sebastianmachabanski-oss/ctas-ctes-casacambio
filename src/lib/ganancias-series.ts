/**
 * La serie de resultados mes a mes, para el tablero.
 *
 * POR QUÉ UNA SOLA CARGA Y NO TRECE
 * La tentación es llamar trece veces a `cargarGanancias()`, una por mes. Sería trece
 * veces el costo y, peor, trece repartos de transferencias distintos: `repartirTT` decide
 * qué pares están realizados mirando la historia completa hasta el fin del período, y
 * recortar la ventana cambia ese reparto.
 *
 * Acá se trae UNA vez la ventana entera y se parte por mes. Los días que devuelve
 * `cargarGanancias` ya vienen con su `tt` imputado a la fecha en que la transferencia se
 * realizó, así que partirlos por mes reparte las transferencias solas, al mes correcto.
 *
 * POR QUÉ ESTÁ EN `lib`
 * Mismo criterio que el resto del módulo: para poder correrlo sin montar un navegador.
 * Ver `scripts/validar-ganancias-series.mts`.
 */
import { componer, type Composicion, type DiaAgg, type OpcionesComposicion } from '@/lib/ganancias-composicion'

/** Cuántos meses mira el tablero hacia atrás, contando el actual. */
export const MESES_TABLERO = 13

export type MesSerie = {
  /** 'AAAA-MM'. */
  mes: string
  /** 'nov 26' — para el eje. El año solo en enero y en el primero, que es donde informa. */
  etiqueta: string
  /** La composición del mes, con las mismas reglas que la pantalla de composición. */
  c: Composicion
  /** Ganancia por calce, sumando todas las monedas. */
  porSpread: number
  /** Valuación del stock, sumando todas las monedas. */
  porTenencia: number
  /** El resultado del mes: `c.neto`. Se repite acá para no tener que entrar en `c`. */
  neto: number
  /** ¿Hubo alguna operación? Un mes sin nada se dibuja vacío, no en cero. */
  conDatos: boolean
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 'AAAA-MM' del día de una fecha ISO. Sin `Date`: es texto, y así no hay husos de por medio. */
export const mesDe = (iso: string): string => iso.slice(0, 7)

/** Los `MESES_TABLERO` meses que terminan en el mes de `hasta`, del más viejo al más nuevo. */
export function mesesHasta(hasta: string, cuantos = MESES_TABLERO): string[] {
  const [a, m] = hasta.slice(0, 7).split('-').map(Number)
  const salida: string[] = []
  for (let i = cuantos - 1; i >= 0; i--) {
    // Aritmética sobre el índice absoluto de mes: evita el clásico 31 de marzo menos un
    // mes dando el 3 de marzo, que es lo que hace `setMonth` sobre un Date.
    const abs = a * 12 + (m - 1) - i
    salida.push(`${Math.floor(abs / 12)}-${String((abs % 12) + 1).padStart(2, '0')}`)
  }
  return salida
}

/** El primer día del mes que abre la ventana: con eso se pide la carga. */
export const inicioDeVentana = (hasta: string, cuantos = MESES_TABLERO): string =>
  `${mesesHasta(hasta, cuantos)[0]}-01`

/**
 * Parte los días en meses y compone cada uno.
 *
 * `dias` tiene que cubrir la ventana entera, traída de una sola vez con
 * `cargarGanancias(supabase, inicioDeVentana(hasta), fin)`. Los días que caigan fuera de
 * la ventana se ignoran, así que pasar de más no rompe nada.
 */
export function serieMensual(
  dias: DiaAgg[], hasta: string, op: OpcionesComposicion, cuantos = MESES_TABLERO,
): MesSerie[] {
  const porMes = new Map<string, DiaAgg[]>()
  for (const d of dias) {
    const k = mesDe(d.f)
    const xs = porMes.get(k)
    if (xs) xs.push(d); else porMes.set(k, [d])
  }

  const meses = mesesHasta(hasta, cuantos)
  return meses.map((mes, i) => {
    const delMes = porMes.get(mes) ?? []
    const c = componer(delMes, op)
    const [a, m] = mes.split('-').map(Number)
    // El año solo donde informa: en enero, que marca el corte, y en el primero de la
    // serie. Repetirlo en los trece es ruido que no se lee.
    const conAnio = m === 1 || i === 0
    return {
      mes,
      etiqueta: conAnio ? `${MES_CORTO[m - 1]} ${String(a).slice(2)}` : MES_CORTO[m - 1],
      c,
      porSpread: c.monedas.reduce((acc, x) => acc + x.porSpread, 0),
      porTenencia: c.monedas.reduce((acc, x) => acc + x.valuacionStock, 0),
      neto: c.neto,
      conDatos: delMes.length > 0,
    }
  })
}

export type Comparacion = {
  /** El mes que se está mirando. */
  actual: MesSerie
  /** El mes anterior, si está en la ventana y tiene datos. */
  anterior: MesSerie | null
  /** El mismo mes del año pasado, si está en la ventana y tiene datos. */
  anioPasado: MesSerie | null
  /** Variación contra el mes anterior, en tanto por uno. `null` si no se puede calcular. */
  vsAnterior: number | null
  /** Variación contra el mismo mes del año pasado. */
  vsAnioPasado: number | null
}

/**
 * Variación relativa entre dos resultados.
 *
 * Devuelve `null` cuando la base es cero o negativa, en vez de un porcentaje. Un mes que
 * pasó de perder 100.000 a ganar 50.000 no "mejoró un 150 %": el porcentaje sobre una
 * base negativa no significa nada y en pantalla se lee al revés. Para eso está el
 * importe, que sí se puede comparar siempre.
 */
export function variacion(actual: number, base: number): number | null {
  if (base <= 0) return null
  return (actual - base) / base
}

/** Arma la comparación del último mes de la serie contra el anterior y contra el año pasado. */
export function compararUltimo(serie: MesSerie[]): Comparacion | null {
  if (serie.length === 0) return null
  const actual = serie[serie.length - 1]
  const buscar = (mes: string) => serie.find(s => s.mes === mes && s.conDatos) ?? null

  const [a, m] = actual.mes.split('-').map(Number)
  const absAnterior = a * 12 + (m - 1) - 1
  const mesAnterior = `${Math.floor(absAnterior / 12)}-${String((absAnterior % 12) + 1).padStart(2, '0')}`
  const mesAnioPasado = `${a - 1}-${String(m).padStart(2, '0')}`

  const anterior = buscar(mesAnterior)
  const anioPasado = buscar(mesAnioPasado)

  return {
    actual, anterior, anioPasado,
    vsAnterior: anterior ? variacion(actual.neto, anterior.neto) : null,
    vsAnioPasado: anioPasado ? variacion(actual.neto, anioPasado.neto) : null,
  }
}
