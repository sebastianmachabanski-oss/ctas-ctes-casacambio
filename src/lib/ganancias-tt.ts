/**
 * Transferencias (op = 'T') en el cálculo de Ganancias.
 *
 * DEFINICIÓN DEL NEGOCIO (confirmada por el cliente el 1/10/2026)
 *
 *  1. Una transferencia tiene DOS PATAS: lo que ingresa y lo que egresa.
 *  2. El ingreso SIEMPRE es mayor o igual al egreso. Si no, no hay negocio — un par que
 *     da negativo es un error de carga, no una pérdida, y por eso se señala aparte.
 *  3. LA GANANCIA SE COMPUTA CUANDO SE REALIZA: hasta que no está la segunda pata, no
 *     pasa nada al resultado. Cuando llega, el par entero cuenta en ESA fecha.
 *
 * El punto 3 es el que cambió el 1/10/2026. Antes cada pata se imputaba a su propia
 * fecha, así que una transferencia con el ingreso en agosto y el egreso en septiembre
 * dejaba el ingreso entero en agosto y el egreso entero —negativo— en septiembre. Los
 * meses quedaban partidos al medio y uno de los dos daba pérdida.
 *
 * Las columnas de caja ya traen el signo puesto (INGRESAN suma, EGRESAN resta), así que
 * sumar las dos patas de un par da la diferencia directamente. Se suma la pata de CAJA y
 * no la de cuenta corriente: en una fila de cta cte las dos son la misma plata con signo
 * opuesto y sumar ambas daría siempre cero.
 *
 * ESTO VIVE EN `lib` Y NO EN LA PÁGINA a propósito, por la misma razón que `posicion.ts`:
 * reparte importes entre "ganancia del período" y "posición abierta", y hace falta poder
 * correrlo de punta a punta sin montar un navegador ni tener la base delante. El validador
 * es `scripts/validar-ganancias-tt.mts`.
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
 * Desde cuándo se reportan las transferencias en curso (2/10/2026).
 *
 * Antes de esta fecha hay patas sueltas que vienen del histórico migrado y que NUNCA van a
 * encontrar pareja: el movimiento que las cancelaba no se cargó en su momento y ya nadie lo
 * va a cargar. Mostrarlas como "en curso" es decir que hay plata en tránsito que en realidad
 * no está en tránsito: es ruido permanente en un panel cuyo valor es justamente avisar lo
 * que falta cerrar HOY.
 *
 * Las patas anteriores al corte **no se reportan y tampoco se computan**: no son ganancia
 * (nunca se realizaron) ni posición abierta (no hay nada que esperar). Siguen en la base y
 * siguen pudiendo parearse: si algún día aparece el movimiento que falta, el par se arma y
 * cuenta en la fecha en que se completó. El corte solo decide QUÉ SE AVISA, no qué existe.
 */
export const DESDE_EN_CURSO = '2026-09-01'

/**
 * Grupo al que pertenece una fila. La NOTA nombra a los participantes de la transferencia
 * ("BOH - GRA") y es lo único que vincula las dos puntas.
 *
 * UNA FILA SIN NOTA NO SE AGRUPA CON NINGUNA OTRA (22/9/2026).
 * Antes todas las filas sin nota compartían la clave `'(sin nota)'`. Ese cajón junta
 * movimientos que no tienen nada que ver entre sí, así que terminaba teniendo ingresos Y
 * egresos, se tomaba por una transferencia completa y entraba al resultado. En septiembre
 * de 2026 eso metió US$ (24.725) y dio vuelta el signo del mes.
 *
 * Sin nota no hay con qué parear, así que cada fila es su propio grupo: queda sin pareja,
 * nunca se realiza y sale del resultado hacia "Transferencias en curso". Desde el
 * 1/10/2026 el alta exige la nota cuando Op = T, así que esto cubre el histórico.
 */
export function claveGrupo(m: FilaTT): string {
  const nota = (m.notas ?? '').trim()
  return nota || `(sin nota) #${m.id ?? `${m.fecha}|${m.operacion ?? ''}|${m.dolares ?? ''}`}`
}

/** Qué punta es la fila. `null` = ninguna de las dos: no puede parearse con nada. */
export function punta(m: FilaTT): 'ing' | 'egr' | null {
  const op = String(m.operacion ?? '').toUpperCase()
  if (op.includes('INGRES')) return 'ing'
  if (op.includes('EGRES')) return 'egr'
  return null
}

function acumular(t: TTAgg, m: FilaTT) {
  t.usd   += Number(m.dolares) || 0
  t.eur   += Number(m.euros)   || 0
  t.brl   += Number(m.reales)  || 0
  t.usdt  += Number(m.usdt)    || 0
  t.chq   += Number(m.cheques) || 0
  t.pesos += Number(m.pesos)   || 0
}

/** Suma de todas las monedas de una fila. Solo para detectar un par de signo negativo. */
function netoFila(m: FilaTT): number {
  return (Number(m.dolares) || 0) + (Number(m.euros) || 0) + (Number(m.reales) || 0)
       + (Number(m.usdt) || 0) + (Number(m.cheques) || 0) + (Number(m.pesos) || 0)
}

export type ResultadoTT = {
  /** Resultado de los pares REALIZADOS, por la fecha en que se completó cada uno. */
  porFecha: Map<string, TTAgg>
  /** Posición de las patas que todavía no encontraron pareja, de toda su historia. */
  abiertas: TTAgg
  /** Cuántas patas quedaron sin parear. */
  puntasAbiertas: number
  /**
   * Pares realizados cuyo egreso superó al ingreso. Por definición del negocio no
   * deberían existir: es un error de carga y se señala para corregirlo, no se esconde.
   */
  paresNegativos: { grupo: string; fecha: string; neto: number }[]
}

/**
 * Reparte las transferencias entre el resultado del período y la posición abierta.
 *
 * `filas` tiene que traer TODAS las transferencias hasta el fin del período, no solo las
 * del período: una transferencia que se realiza hoy puede tener su primera pata cargada
 * meses atrás, y sin esa pata el resultado saldría mal.
 *
 * CÓMO SE PAREA. Las notas son contrapartes que se REPITEN —"MATI - EDY" tiene 164 patas
 * en 19 meses—, así que la nota sola no identifica una transferencia. Dentro de cada nota
 * las patas se parean por ORDEN CRONOLÓGICO: el ingreso más viejo sin pareja se cancela
 * con el egreso más viejo sin pareja. Es lo que haría una persona mirando la planilla, y
 * sobre los datos reales cierra: todos los grupos tienen la misma cantidad de ingresos
 * que de egresos.
 *
 * El par se imputa a la fecha de la pata que lo COMPLETA, que es cuando el negocio se
 * realiza. Lo que queda sin pareja no es ganancia: es plata en tránsito.
 */
export function repartirTT(
  filas: FilaTT[],
  ini: string,
  /** Desde cuándo se avisan las patas sin pareja. Ver DESDE_EN_CURSO. */
  desdeEnCurso: string = DESDE_EN_CURSO,
): ResultadoTT {
  const porFecha = new Map<string, TTAgg>()
  const abiertas = ttVacio()
  const paresNegativos: ResultadoTT['paresNegativos'] = []
  let puntasAbiertas = 0

  const sumarA = (fecha: string, ...patas: FilaTT[]) => {
    let t = porFecha.get(fecha)
    if (!t) { t = ttVacio(); porFecha.set(fecha, t) }
    for (const p of patas) acumular(t, p)
  }

  // Las filas vienen ordenadas por fecha; dentro de un grupo se conserva ese orden.
  const grupos = new Map<string, FilaTT[]>()
  for (const m of filas) {
    const k = claveGrupo(m)
    const g = grupos.get(k)
    if (g) g.push(m); else grupos.set(k, [m])
  }

  grupos.forEach((filasGrupo, grupo) => {
    // Colas FIFO de patas esperando pareja.
    const esperandoIng: FilaTT[] = []
    const esperandoEgr: FilaTT[] = []
    const sueltas: FilaTT[] = []

    for (const m of filasGrupo) {
      const p = punta(m)
      if (p === null) { sueltas.push(m); continue }
      const contraria = p === 'ing' ? esperandoEgr : esperandoIng
      const propia    = p === 'ing' ? esperandoIng : esperandoEgr

      const pareja = contraria.shift()
      if (!pareja) { propia.push(m); continue }

      // Par REALIZADO. Cuenta entero en la fecha de la pata que lo completó, que es `m`
      // por venir después en el orden cronológico.
      const neto = netoFila(pareja) + netoFila(m)
      if (Math.round(neto) < 0) paresNegativos.push({ grupo, fecha: m.fecha, neto })
      // Solo lo realizado DENTRO del período suma al resultado del período.
      if (m.fecha >= ini) sumarA(m.fecha, pareja, m)
    }

    // Lo que no encontró pareja es posición abierta: un saldo, no un flujo, así que se
    // acumula toda su historia hasta el cierre del período sin importar cuándo entró.
    // Salvo lo anterior al corte, que es histórico sin cierre posible (ver DESDE_EN_CURSO).
    for (const m of [...esperandoIng, ...esperandoEgr, ...sueltas]) {
      if (m.fecha < desdeEnCurso) continue
      acumular(abiertas, m)
      puntasAbiertas++
    }
  })

  return { porFecha, abiertas, puntasAbiertas, paresNegativos }
}
