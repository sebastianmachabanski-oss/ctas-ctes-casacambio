/**
 * Transferencias (op = 'T') en el cálculo de Ganancias.
 *
 * La ganancia de una transferencia NO sale del calce de compras y ventas: no hay pata en
 * pesos y por lo tanto no hay tasa de la que sacar un spread. Es, simplemente, lo que
 * ENTRA menos lo que SALE de cada par de movimientos — criterio confirmado por el cliente
 * el 1/9/2026.
 *
 * Las columnas de caja ya traen el signo puesto (INGRESAN suma, EGRESAN resta), así que
 * sumarlas da la diferencia directamente. Se suma la pata de CAJA y no la de cuenta
 * corriente: en una fila de cta cte las dos son la misma plata con signo opuesto y sumar
 * ambas daría siempre cero.
 *
 * ESTO VIVE EN `lib` Y NO EN LA PÁGINA a propósito, por la misma razón que `posicion.ts`:
 * reparte importes entre "ganancia del período" y "posición abierta", y hace falta poder
 * correrlo de punta a punta sin montar un navegador ni tener la base delante. El
 * validador es `scripts/validar-ganancias-tt.mts`.
 */

/** Neto de las transferencias por moneda: lo que entra menos lo que sale. */
export type TTAgg = { usd: number; eur: number; brl: number; usdt: number; chq: number; pesos: number }

/** Una fila de `movimientos_caja` con op = 'T', recortada a lo que esta cuenta mira. */
export type FilaTT = {
  id?: string | number | null
  fecha: string
  notas?: string | null
  operacion?: string | null
  pesos?: number | null
  dolares?: number | null
  euros?: number | null
  reales?: number | null
  usdt?: number | null
  cheques?: number | null
}

export const ttVacio = (): TTAgg => ({ usd: 0, eur: 0, brl: 0, usdt: 0, chq: 0, pesos: 0 })

/**
 * Grupo al que pertenece una fila. La NOTA nombra a los participantes de la transferencia
 * ("BOH - GRA") y es lo único que vincula las dos puntas.
 *
 * UNA FILA SIN NOTA NO SE AGRUPA CON NINGUNA OTRA (22/9/2026).
 * Antes todas las filas sin nota compartían la clave '(sin nota)'. Ese cajón junta
 * movimientos que no tienen nada que ver entre sí, así que terminaba teniendo ingresos Y
 * egresos, pasaba la prueba de "cerrado" y entraba al resultado como si fuera una
 * transferencia completa. En septiembre de 2026 eso metió US$ (24.725) —tres filas de
 * septiembre fundidas con dos de junio— y dio vuelta el signo del mes: los 21 grupos con
 * nota sumaban US$ 11.726 y la pantalla mostraba US$ (12.999).
 *
 * Sin nota no hay con qué parear, así que cada fila es su propio grupo: queda con una sola
 * punta, nunca cierra y sale del resultado hacia "Transferencias en curso". Es la lectura
 * honesta —no sabemos qué cancela— y además las deja A LA VISTA en pantalla en lugar de
 * esconderlas adentro de la ganancia. Se corrigen cargándoles la nota.
 */
export function claveGrupo(m: FilaTT): string {
  const nota = (m.notas ?? '').trim()
  return nota || `(sin nota) #${m.id ?? `${m.fecha}|${m.operacion ?? ''}|${m.dolares ?? ''}`}`
}

/**
 * Un grupo está CERRADO cuando tiene las dos puntas: al menos un INGRESAN y al menos un
 * EGRESAN en toda su historia.
 */
export function puntasPorGrupo(filas: FilaTT[]): Map<string, { ing: boolean; egr: boolean }> {
  const puntas = new Map<string, { ing: boolean; egr: boolean }>()
  for (const m of filas) {
    const k = claveGrupo(m)
    const p = puntas.get(k) ?? { ing: false, egr: false }
    const op = String(m.operacion ?? '').toUpperCase()
    if (op.includes('INGRES')) p.ing = true
    else if (op.includes('EGRES')) p.egr = true
    puntas.set(k, p)
  }
  return puntas
}

function acumular(t: TTAgg, m: FilaTT) {
  t.usd   += Number(m.dolares) || 0
  t.eur   += Number(m.euros)   || 0
  t.brl   += Number(m.reales)  || 0
  t.usdt  += Number(m.usdt)    || 0
  t.chq   += Number(m.cheques) || 0
  t.pesos += Number(m.pesos)   || 0
}

export type ResultadoTT = {
  /** Neto por FECHA de las transferencias cerradas que caen dentro del período. */
  porFecha: Map<string, TTAgg>
  /** Posición acumulada de los grupos sin cerrar, de toda su historia. */
  abiertas: TTAgg
  /** Cuántos grupos quedaron sin cerrar. */
  gruposAbiertos: number
}

/**
 * Reparte las transferencias entre el resultado del período y la posición abierta.
 *
 * `filas` tiene que traer TODAS las transferencias hasta el fin del período, no solo las
 * del período: para saber si un grupo tiene sus dos puntas hay que mirar su historia
 * completa, y una punta puede haberse cargado meses antes.
 *
 * POR QUÉ NO SE IMPUTA TODO AL MOVIMIENTO QUE CIERRA
 * Los grupos se REPITEN: "MATI - EDY" no es una transferencia, es una contraparte que
 * aparece decenas de veces (164 patas en 19 meses, al 22/9/2026). Llevar la ganancia de
 * toda su historia a la fecha del último movimiento inventaría un pico enorme en un día y
 * vaciaría todos los meses anteriores. Cada movimiento cuenta en SU fecha; lo que decide
 * el grupo es si cuenta o no.
 */
export function repartirTT(filas: FilaTT[], ini: string): ResultadoTT {
  const puntas = puntasPorGrupo(filas)
  const cerrado = (m: FilaTT) => {
    const p = puntas.get(claveGrupo(m))
    return !!p && p.ing && p.egr
  }

  const porFecha = new Map<string, TTAgg>()
  const abiertas = ttVacio()
  const gruposAbiertos = new Set<string>()

  for (const m of filas) {
    if (cerrado(m)) {
      // Solo lo que ocurrió DENTRO del período suma al resultado del período.
      if (m.fecha >= ini) {
        let t = porFecha.get(m.fecha)
        if (!t) { t = ttVacio(); porFecha.set(m.fecha, t) }
        acumular(t, m)
      }
    } else {
      // Los grupos con UNA SOLA punta no son ganancia: son plata que entró y todavía no se
      // entregó (o al revés). Es una POSICIÓN ABIERTA, un saldo y no un flujo, así que se
      // acumula toda su historia hasta el cierre del período sin importar cuándo entró.
      acumular(abiertas, m)
      gruposAbiertos.add(claveGrupo(m))
    }
  }

  return { porFecha, abiertas, gruposAbiertos: gruposAbiertos.size }
}
