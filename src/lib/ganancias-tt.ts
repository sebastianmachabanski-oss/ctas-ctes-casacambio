/**
 * Transferencias (op = 'T') en el cálculo de Ganancias.
 *
 * DEFINICIÓN DEL NEGOCIO (confirmada por el cliente el 1/10/2026)
 *
 *  1. Una transferencia tiene lo que INGRESA y lo que EGRESA. Lo habitual es una pata de
 *     cada lado, pero lo que entra de una vez puede salir repartido en varios pagos.
 *  2. El ingreso SIEMPRE es mayor o igual al egreso. Si no, no hay negocio — una
 *     transferencia que da negativa es un error de carga, no una pérdida, y se señala.
 *  3. LA GANANCIA SE COMPUTA CUANDO SE REALIZA: hasta que lo que entró no quedó cubierto
 *     por lo que salió, no pasa nada al resultado. Cuando se cubre, la transferencia
 *     entera cuenta en ESA fecha.
 *
 * El punto 3 es el que cambió el 1/10/2026. Antes cada pata se imputaba a su propia
 * fecha, así que una transferencia con el ingreso en agosto y el egreso en septiembre
 * dejaba el ingreso entero en agosto y el egreso entero —negativo— en septiembre. Los
 * meses quedaban partidos al medio y uno de los dos daba pérdida.
 *
 * El punto 1 es el que cambió el 16/11/2026. Hasta entonces el emparejamiento era UNA
 * PATA CONTRA UNA PATA, y una transferencia repartida en dos salidas dejaba el grupo
 * corrido un lugar para siempre: desde ahí cada par mezclaba patas de transferencias
 * distintas. El total seguía cerrando, pero caía en fechas equivocadas y la última pata
 * quedaba sin pareja y se informaba como "en curso" sin estarlo. Pasó en tres referencias
 * y se vio en "CAR - EDY": el 30/1/2026 entraron 52.330 y salieron 34.780 + 16.830, y la
 * consecuencia recién apareció en noviembre, con US$ (14.198) en curso de una
 * transferencia que había cerrado el mismo día.
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
export type TTAgg = { usd: number; eur: number; brl: number; usdt: number; gbp: number; chq: number; pesos: number }

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
  libras?: number | null
  cheques?: number | null
}

export const ttVacio = (): TTAgg => ({ usd: 0, eur: 0, brl: 0, usdt: 0, gbp: 0, chq: 0, pesos: 0 })

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
 * Cuánto del importe que abrió la transferencia puede quedar SIN CUBRIR y aun así darla
 * por cerrada: eso que sobra es el spread, o sea la ganancia (16/11/2026).
 *
 * Es el único número que distingue "a esta transferencia todavía le falta una salida" de
 * "esta transferencia ya está completa y lo que queda es lo que ganamos". Sobre los datos
 * reales el spread anda entre el 1% y el 3% (5.050/5.000, 39.075/38.695, 14.600/14.198),
 * y lo que queda sin cubrir cuando de verdad falta una pata es de otro orden: en el caso
 * que motivó esto, 17.550 sobre 52.330, un 33%. El 5% separa las dos cosas con margen de
 * sobra para los dos lados.
 *
 * Subirlo hace que una transferencia incompleta se dé por cerrada antes de tiempo y la
 * ganancia se infle; bajarlo deja transferencias completas esperando una salida que no va
 * a llegar. Si alguna vez hay que moverlo, el validador tiene los casos reales.
 */
export const TOLERANCIA_CIERRE = 0.05

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
  t.gbp   += Number(m.libras)  || 0
  t.chq   += Number(m.cheques) || 0
  t.pesos += Number(m.pesos)   || 0
}

/** Suma de todas las monedas de una fila. Solo para detectar un par de signo negativo. */
function netoFila(m: FilaTT): number {
  return (Number(m.dolares) || 0) + (Number(m.euros) || 0) + (Number(m.reales) || 0)
       + (Number(m.usdt) || 0) + (Number(m.libras) || 0) + (Number(m.cheques) || 0) + (Number(m.pesos) || 0)
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
 * las patas se agrupan por ORDEN CRONOLÓGICO y POR IMPORTE:
 *
 *   · Una pata abre una transferencia y queda esperando que la cubran del otro lado.
 *   · Cada pata del lado contrario va contra la transferencia abierta MÁS VIEJA, y le
 *     descuenta su importe. Pueden hacer falta varias: lo que entra de una vez puede
 *     salir repartido en dos o tres pagos.
 *   · La transferencia se cierra cuando lo que falta cubrir cae por debajo de
 *     TOLERANCIA_CIERRE, porque eso que sobra ya no es una salida pendiente: es el spread.
 *   · Una pata del MISMO lado nunca se suma a una transferencia abierta — abre la suya y
 *     se pone en la cola detrás. Dos ingresos seguidos son dos transferencias esperando
 *     su salida, no un ingreso en dos veces.
 *   · Si llega una pata que ya no entra en lo que falta cubrir, la de adelante se da por
 *     terminada con lo que tiene y la nueva pasa a la siguiente de la cola.
 *
 * La transferencia se imputa a la fecha de la pata que la COMPLETA, que es cuando el
 * negocio se realiza. Lo que nunca llegó a tener una pata del otro lado no es ganancia:
 * es plata en tránsito.
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

  /** Una transferencia que todavía espera que la cubran del otro lado. */
  type EnCurso = {
    /** De qué lado se abrió. Todas las de la cola comparten lado: una pata del lado
     *  contrario se consume contra la de adelante antes de poder abrir la suya. */
    lado: 'ing' | 'egr'
    patas: FilaTT[]
    /** Cuántas patas del lado contrario lleva. Con cero, todavía no es un negocio. */
    contra: number
    /** Importe de la pata que la abrió. Es la referencia contra la que se mide lo que falta. */
    base: number
    /** Lo que falta cubrir. Negativo = se pasaron (el egreso superó al ingreso). */
    restante: number
    /** Fecha de la última pata incorporada: con esa se imputa si se cierra por descarte. */
    ultimaFecha: string
  }

  grupos.forEach((filasGrupo, grupo) => {
    /** Transferencias abiertas, de la más vieja a la más nueva. */
    const enCurso: EnCurso[] = []
    /** Filas que no son ni ingreso ni egreso: no pueden cubrir ni ser cubiertas. */
    const sueltas: FilaTT[] = []

    /** Da una transferencia por REALIZADA e imputa todas sus patas a `fecha`. */
    const realizar = (t: EnCurso, fecha: string) => {
      const neto = t.patas.reduce((a, p) => a + netoFila(p), 0)
      if (Math.round(neto) < 0) paresNegativos.push({ grupo, fecha, neto })
      // Solo lo realizado DENTRO del período suma al resultado del período.
      if (fecha >= ini) sumarA(fecha, ...t.patas)
    }

    for (const m of filasGrupo) {
      const p = punta(m)
      if (p === null) { sueltas.push(m); continue }
      const importe = Math.abs(netoFila(m))

      // Pata del MISMO lado que las que esperan: abre su propia transferencia y se pone
      // en la cola. Dos ingresos seguidos son dos transferencias, no un ingreso en dos veces.
      if (enCurso.length === 0 || enCurso[0].lado === p) {
        enCurso.push({
          lado: p, patas: [m], contra: 0,
          base: importe, restante: importe, ultimaFecha: m.fecha,
        })
        continue
      }

      // Pata del lado contrario: cubre la transferencia abierta más vieja.
      let ubicada = false
      while (!ubicada && enCurso.length) {
        const t = enCurso[0]
        // Con una sola pata todavía no hay nada contra qué medir: la primera del lado
        // contrario entra siempre, aunque se pase. Pasarse es el error de carga que se
        // informa aparte, no una razón para dejar la transferencia abierta.
        const entra = t.contra === 0 || importe <= t.restante + TOLERANCIA_CIERRE * t.base
        if (!entra) {
          // Ya no puede crecer: lo que llega no es una salida que le falte. Se termina
          // con lo que tiene, imputada al día de su última pata, y la nueva sigue de largo.
          enCurso.shift()
          realizar(t, t.ultimaFecha)
          continue
        }
        t.patas.push(m)
        t.contra++
        t.restante -= importe
        t.ultimaFecha = m.fecha
        // Lo que queda sin cubrir ya es el spread: la transferencia está completa.
        if (t.restante <= TOLERANCIA_CIERRE * t.base) {
          enCurso.shift()
          realizar(t, m.fecha)
        }
        ubicada = true
      }
      // La cola se vació sin poder ubicarla: abre la suya.
      if (!ubicada) {
        enCurso.push({
          lado: p, patas: [m], contra: 0,
          base: importe, restante: importe, ultimaFecha: m.fecha,
        })
      }
    }

    // Fin del grupo. Lo que tiene patas de los dos lados es un negocio cerrado aunque le
    // falte algo por cubrir: se realiza con lo que tiene, a la fecha de su última pata.
    // Lo que quedó con una sola pata no encontró contrapartida y es posición abierta: un
    // saldo, no un flujo, así que se acumula toda su historia hasta el cierre del período
    // sin importar cuándo entró. Salvo lo anterior al corte, que es histórico sin cierre
    // posible (ver DESDE_EN_CURSO).
    const huerfanas: FilaTT[] = [...sueltas]
    for (const t of enCurso) {
      if (t.contra > 0) realizar(t, t.ultimaFecha)
      else huerfanas.push(...t.patas)
    }
    for (const m of huerfanas) {
      if (m.fecha < desdeEnCurso) continue
      acumular(abiertas, m)
      puntasAbiertas++
    }
  })

  return { porFecha, abiertas, puntasAbiertas, paresNegativos }
}
