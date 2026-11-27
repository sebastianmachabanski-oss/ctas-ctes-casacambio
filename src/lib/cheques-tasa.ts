/**
 * La tasa de un descuento de cheques.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * Hasta el 27/11/2026 el módulo guardaba el nominal y lo pagado, y la tasa quedaba
 * implícita: no se calculaba, no se mostraba y no se podía comparar. Para una oficina que
 * descuenta documentos, "¿a qué tasa lo tomé?" es LA pregunta —es cómo cotiza, cómo
 * decide y cómo se compara contra la competencia—, así que una cartera sin tasa es una
 * lista de papeles, no una herramienta.
 *
 * POR QUÉ EN `lib` Y NO EN EL COMPONENTE
 * Mismo criterio que `posicion.ts` y `ganancias-composicion.ts`: es plata, así que se
 * calcula donde se puede correr un validador sin montar un navegador. Ver
 * `scripts/validar-tasa-cheques.mts`.
 *
 * ── LAS DOS TASAS, QUE NO SON LA MISMA ─────────────────────────────────────
 * Un cheque de $ 100 tomado en $ 88 deja $ 12 de descuento. Ese 12 se puede mirar de dos
 * maneras, y confundirlas es el error clásico:
 *
 *   · TASA DIRECTA (o de descuento) = 12 / 100 = 12,00 %
 *     Sobre el VALOR DEL DOCUMENTO. Es la que se habla en el mostrador: "te lo tomo al
 *     cuatro por ciento mensual".
 *
 *   · TASA EFECTIVA del período     = 12 /  88 = 13,64 %
 *     Sobre la PLATA QUE SE PUSO. Es el rendimiento real de la operación, y es la única
 *     que se puede comparar contra un plazo fijo o una caución.
 *
 * La directa siempre da menor que la efectiva. Se informan las dos a propósito: la
 * primera para hablar con el cliente, la segunda para decidir.
 *
 * ── CÓMO SE ANUALIZA ───────────────────────────────────────────────────────
 * La mensual escala la DIRECTA a 30 días en forma lineal, que es como se cotiza en la
 * calle (no capitaliza: "4 % mensual" a 60 días es 8 %, no 8,16 %).
 * La TNA escala la EFECTIVA a 365 días, también lineal, que es la convención bancaria
 * argentina para tasa nominal anual.
 * La TEA sí capitaliza, porque para eso existe: es la que compara contra otra colocación.
 *
 * Si algún cliente usa otra convención —360 días, o mensual sobre la efectiva— se cambia
 * acá y las tres pantallas siguen.
 */
import { diasHasta, type Cheque } from './cheques'

/** Días del mes y del año con los que se anualiza. Convención bancaria argentina. */
export const DIAS_MES = 30
export const DIAS_ANIO = 365

/** La operación de la que salió un cheque. Es de donde sale lo que se pagó. */
export type Origen = {
  id: string
  fecha: string
  /** Nominal de la operación: la columna CHEQUES del movimiento. */
  cheques: number | null
  /** Lo que se entregó: la columna PESOS del movimiento, que viene en negativo. */
  pesos: number | null
}

export type Tasa = {
  /** Lo que se pagó por el documento. */
  pagado: number
  /** Nominal menos pagado. Negativo si se pagó de más. */
  descuento: number
  /** Días entre la operación y el vencimiento. */
  dias: number
  /** descuento / nominal. Sobre el valor del documento. */
  directa: number
  /** descuento / pagado. Sobre la plata puesta. */
  efectiva: number
  /** La directa llevada a 30 días, lineal. `null` si el plazo no lo permite. */
  mensual: number | null
  /** La efectiva llevada a 365 días, lineal. `null` si el plazo no lo permite. */
  tna: number | null
  /** La efectiva capitalizada a 365 días. `null` si el plazo no lo permite. */
  tea: number | null
}

/**
 * La tasa de un documento tomado en `pagado`, con nominal `nominal`, a `dias` de plazo.
 *
 * Devuelve `null` cuando no hay nada que calcular: sin nominal no hay documento, y sin
 * plata entregada la operación no es un descuento (sería un regalo o un error de carga).
 * Se devuelve `null` en vez de cero porque cero es una tasa, y mostrar 0 % donde en
 * realidad no se sabe es peor que no mostrar nada.
 *
 * El PLAZO EN CERO O NEGATIVO no anula la tasa: un cheque al día, o uno que se descontó
 * después de vencido, tiene descuento aunque no tenga plazo. Lo que no se puede es
 * anualizarlo —dividir por cero—, así que `mensual`, `tna` y `tea` vuelven `null` y las
 * dos tasas del período se informan igual.
 */
export function calcularTasa(nominal: number, pagado: number, dias: number): Tasa | null {
  if (!(nominal > 0) || !(pagado > 0)) return null

  const descuento = nominal - pagado
  const directa = descuento / nominal
  const efectiva = descuento / pagado
  const anualizable = dias > 0

  // La TEA solo tiene sentido con efectiva > −100 %: por debajo de eso la base de la
  // potencia es negativa y el resultado sería NaN. No puede pasar con pagado > 0, pero la
  // guarda queda porque el día que entre un dato raro es preferible un null a un NaN
  // propagándose por la pantalla.
  const tea = anualizable && efectiva > -1
    ? Math.pow(1 + efectiva, DIAS_ANIO / dias) - 1
    : null

  return {
    pagado,
    descuento,
    dias,
    directa,
    efectiva,
    mensual: anualizable ? directa * (DIAS_MES / dias) : null,
    tna: anualizable ? efectiva * (DIAS_ANIO / dias) : null,
    tea,
  }
}

/**
 * Lo que costó UN cheque dentro de su operación.
 *
 * ── EL PRORRATEO, Y POR QUÉ NO HAY MEJOR OPCIÓN HOY ────────────────────────
 * Una operación trae N cheques y una sola cifra de lo pagado: no se guarda cuánto se
 * pagó por cada uno. Si los N vencen el mismo día da igual, pero si vencen en fechas
 * distintas el descuento de cada uno no es proporcional a su importe — el que vence más
 * lejos debería costar más.
 *
 * Se prorratea por importe porque es lo único derivable del dato que existe, y se avisa
 * con `prorrateado` para que la pantalla lo pueda decir en vez de presentarlo como un
 * número exacto. Guardar el costo por cheque es un cambio de modelo, anotado en el
 * roadmap junto con la venta de cheques, que es la que lo necesita de verdad.
 */
export type Costo = { tasa: Tasa; prorrateado: boolean }

export function costoDeCheque(c: Cheque, origen: Origen | null): Costo | null {
  if (!origen) return null

  const nominalOp = Math.abs(Number(origen.cheques) || 0)
  const pagadoOp = Math.abs(Number(origen.pesos) || 0)
  if (!(nominalOp > 0) || !(pagadoOp > 0)) return null

  // Parte del cheque dentro de la operación. Con un solo cheque da 1 y no hay prorrateo.
  const parte = c.importe / nominalOp
  const prorrateado = Math.abs(c.importe - nominalOp) > 0.005

  const tasa = calcularTasa(c.importe, pagadoOp * parte, diasHasta(c.fecha_pago, origen.fecha))
  return tasa ? { tasa, prorrateado } : null
}

/**
 * La tasa de un conjunto de cheques: la de la cartera, o la de una operación.
 *
 * NO es el promedio de las tasas. Es la tasa que sale de los totales: todo el nominal
 * contra toda la plata puesta, al plazo promedio. Promediar porcentajes le daría el mismo
 * peso a un cheque de mil pesos que a uno de un millón, que es exactamente al revés de lo
 * que importa.
 *
 * El PLAZO se promedia ponderado por nominal, y se mide desde `hoy` y no desde la fecha
 * de cada operación: la pregunta de la cartera es "a qué tasa está colocada la plata que
 * tengo HOY", no a qué tasa se tomó cada papel en su momento. Un cheque que ya venció
 * aporta plazo cero, no plazo negativo: ya no falta nada para cobrarlo.
 */
export type TasaCartera = Tasa & {
  nominal: number
  cheques: number
  /** Cuántos quedaron afuera por no tener de dónde sacar el costo. */
  sinCosto: number
}

export function tasaDeCartera(
  cheques: Cheque[],
  origenes: Map<string, Origen>,
  hoy: string,
): TasaCartera | null {
  let nominal = 0, pagado = 0, diasPonderados = 0, contados = 0, sinCosto = 0

  for (const c of cheques) {
    const costo = costoDeCheque(c, origenes.get(c.movimiento_id) ?? null)
    if (!costo) { sinCosto++; continue }
    nominal += c.importe
    pagado += costo.tasa.pagado
    diasPonderados += Math.max(0, diasHasta(c.fecha_pago, hoy)) * c.importe
    contados++
  }

  if (!contados || !(nominal > 0)) return null

  const tasa = calcularTasa(nominal, pagado, diasPonderados / nominal)
  if (!tasa) return null
  return { ...tasa, nominal, cheques: contados, sinCosto }
}

/** "12,00 %" — una tasa como fracción, en formato argentino. */
const nfTasa = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const tasaTexto = (v: number | null): string =>
  v === null ? '—' : `${nfTasa.format(v * 100)} %`

/** "a 45 días" / "al día" / "vencido hace 3 días" — el plazo en palabras. */
export function plazoTexto(dias: number): string {
  const d = Math.round(dias)
  if (d > 1) return `a ${d} días`
  if (d === 1) return 'a 1 día'
  if (d === 0) return 'al día'
  return d === -1 ? 'vencido hace 1 día' : `vencido hace ${-d} días`
}
