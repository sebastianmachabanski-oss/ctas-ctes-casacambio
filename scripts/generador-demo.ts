/**
 * El día de operaciones de la casa de cambio ficticia.
 *
 * POR QUÉ ESTÁ ACÁ
 * Lo usan `sembrar-demo.mts` (siembra inicial) y `continuar-demo.mts` (la pone al día y
 * la extiende hacia atrás). Duplicado, el primer ajuste al modelo entra en uno de los dos
 * y la demo queda con dos tramos que se notan distintos en cualquier gráfico — justo en
 * la pantalla que se usa para mostrar la tendencia.
 */

export type MovimientoDemo = {
  fecha: string; tipo: 'CAJA' | 'CTA CTE'; cliente: string; operacion: string
  propio: string; externo: string; monto: number; cotizacion?: number | null
  op?: 'C' | 'T'; notas?: string | null; debe?: string | null
}

export type ContextoDia = {
  fecha: string
  /** Índice del día dentro de la corrida: mueve la deriva de las cotizaciones. */
  indice: number
  azar: () => number
  /** Cotización de la moneda para este día. */
  cotizacion: (moneda: string, indice: number) => number
  /** ¿Conviene que ENTRE esta moneda, según el desvío contra el stock objetivo? */
  convieneQueEntre: (moneda: string) => boolean
  /** Marca el mes y devuelve true la primera vez: para el gasto fijo mensual. */
  tomarGastoFijoDelMes: (mes: string) => boolean
  registrar: (m: MovimientoDemo) => void
  elenco: {
    CUENTAS: string[]; EVENTUALES: string[]; REPARTIDORES: string[]
    CONTRAPARTES_TT: string[]; CONCEPTOS_GASTO: string[]
  }
}

/**
 * El gasto fijo del mes: alquiler, sueldos y servicios, todo junto.
 *
 * ESTE NÚMERO ES EL QUE HACE QUE LA DEMO SE VEA REAL. El modelo anterior sorteaba, todos
 * los días con la misma probabilidad, un gasto de entre 150.000 y 3.500.000. Un mes podía
 * sacar cero y el siguiente cuatro: el resultado saltaba 500 % de un mes a otro y el
 * tablero mostraba una tendencia imposible. Ningún negocio con empleados y un local
 * fluctúa así, porque el grueso de sus gastos es el MISMO todos los meses.
 *
 * Acá el grueso cae una vez por mes, en los primeros días hábiles, con una variación de
 * ±3 % — lo que se mueve un alquiler indexado o una liquidación con horas extra.
 */
const GASTO_FIJO_MENSUAL = 2_400_000

/** Genera las operaciones de un día hábil. El llamador ya descartó sábados y domingos. */
export function generarDia(c: ContextoDia): void {
  const { fecha, indice, azar, cotizacion, convieneQueEntre, registrar, elenco } = c
  const { CUENTAS, EVENTUALES, REPARTIDORES, CONTRAPARTES_TT, CONCEPTOS_GASTO } = elenco

  const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))
  const uno = <T,>(xs: T[]): T => xs[entre(0, xs.length - 1)]
  const redondo = (n: number, paso: number) => Math.max(paso, Math.round(n / paso) * paso)

  // ── Mostrador ────────────────────────────────────────────────────────────
  /**
   * CADA MONEDA TIENE SU PROPIA OPERATORIA DIARIA, no se sortea una por operación.
   *
   * El modelo anterior elegía la moneda al azar en cada operación: 72 % dólar y el resto
   * repartido entre cuatro. A euros, USDT y libras les tocaba una operación cada tres
   * días, y con tan pocas el calce mensual —`min(compras, ventas)`— salía puro azar: su
   * aporte variaba hasta VEINTE VECES de un mes a otro y arrastraba el resultado total,
   * que saltaba 60 % sin ninguna razón de negocio.
   *
   * Una casa de cambio real cotiza todas las monedas todos los días. Con operaciones
   * diarias, el calce mensual de cada una se promedia y la serie queda creíble.
   *
   * El dólar sigue mandando por VALOR, no por cantidad: su ticket es mucho más grande.
   */
  const MOSTRADOR: [string, number, number, number, number][] = [
    // moneda,    ops mín, ops máx, ticket mín, ticket máx
    ['DOLARES', 4, 9, 200, 12_000],
    ['EUROS',   1, 3, 100,  3_000],
    ['REALES',  1, 3, 500, 15_000],
    ['USDT',    0, 2, 100,  2_500],
    ['LIBRAS',  0, 1,  50,    800],
  ]
  for (const [moneda, opsMin, opsMax, tMin, tMax] of MOSTRADOR) {
    for (let i = 0; i < entre(opsMin, opsMax); i++) {
      const compra = convieneQueEntre(moneda)
      const cot = cotizacion(moneda, indice)
      /**
       * El spread es un PORCENTAJE de la cotización, no una cantidad fija de pesos.
       *
       * Con 8 a 18 pesos planos, el margen dependía de cuánto vale la moneda: 13 pesos
       * sobre un real de 290 es 4,5 %, y sobre un dólar de 1.500 es 0,9 %. Los reales
       * terminaban aportando más que los euros y casi la mitad que el dólar, que no es
       * lo que pasa en ninguna casa de cambio.
       */
      const margen = 0.004 + azar() * 0.0035   // 0,4 % a 0,75 % por punta
      const spread = Math.round(cot * margen) * (compra ? -1 : 1)
      registrar({
        fecha, tipo: 'CAJA', cliente: uno(EVENTUALES),
        operacion: compra ? 'COMPRA' : 'VENTA',
        propio: moneda, externo: 'PESOS',
        monto: redondo(entre(tMin, tMax), 50),
        cotizacion: cot + spread,
        // Una parte de lo vendido sale con un repartidor: alimenta "Dinero en calle".
        debe: !compra && azar() < 0.12 ? uno(REPARTIDORES) : null,
      })
    }
  }

  // ── Cuentas corrientes ───────────────────────────────────────────────────
  for (let i = 0; i < entre(1, 4); i++) {
    const moneda = azar() < 0.8 ? 'DOLARES' : uno(['PESOS', 'EUROS'])
    registrar({
      fecha, tipo: 'CTA CTE', cliente: uno(CUENTAS),
      // INGRESAN hace entrar moneda a la caja; EGRESAN la saca.
      operacion: convieneQueEntre(moneda) ? 'INGRESAN' : 'EGRESAN',
      // En CUENTA CORRIENTE `externo` lleva la moneda: el motor le antepone "CC" y arma
      // el código `CTA CTEINGRESANDOLARESCC DOLARES`, que sí está en la tabla. Es al
      // revés que en CAJA, donde estas operaciones van con `externo` VACÍO.
      propio: moneda, externo: moneda,
      monto: redondo(entre(500, 9_000), 100),
      notas: azar() < 0.5 ? 'ENTREGA' : 'RETIRO',
    })
  }

  // ── Transferencias ───────────────────────────────────────────────────────
  // SIEMPRE las dos patas juntas, como las carga el sistema desde el 13/10/2026. Una sola
  // dejaría la demo con un panel de "transferencias en curso" pidiendo explicaciones.
  if (azar() < 0.35) {
    const ref = uno(CONTRAPARTES_TT)
    const entra = redondo(entre(3_000, 40_000), 100)
    const sale = entra - redondo(entra * (entre(4, 12) / 1000), 10)   // margen de 0,4% a 1,2%
    const [a, b] = ref.split(' - ')
    registrar({ fecha, tipo: 'CAJA', cliente: `${a} X TT`, operacion: 'INGRESAN', propio: 'DOLARES', externo: '', monto: entra, op: 'T', notas: ref })
    registrar({ fecha, tipo: 'CAJA', cliente: `${b} X TT`, operacion: 'EGRESAN', propio: 'DOLARES', externo: '', monto: sale, op: 'T', notas: ref })
  }

  // ── Gastos ───────────────────────────────────────────────────────────────
  // Solo en PESOS (regla del dominio). Ver la nota de GASTO_FIJO_MENSUAL: el grueso cae
  // una vez por mes y lo demás son gastos chicos, para que el resultado mensual no salte.
  const diaDelMes = Number(fecha.slice(8, 10))
  if (diaDelMes <= 5 && c.tomarGastoFijoDelMes(fecha.slice(0, 7))) {
    registrar({
      fecha, tipo: 'CAJA', cliente: 'ALQUILER Y SUELDOS', operacion: 'GASTOS',
      propio: 'PESOS', externo: '',
      monto: redondo(GASTO_FIJO_MENSUAL * (0.97 + azar() * 0.06), 10_000),
    })
  }
  if (azar() < 0.18) {
    registrar({
      fecha, tipo: 'CAJA', cliente: uno(CONCEPTOS_GASTO), operacion: 'GASTOS',
      propio: 'PESOS', externo: '', monto: redondo(entre(40_000, 260_000), 5_000),
    })
  }
}

/** Lleva la cuenta de en qué meses ya cayó el gasto fijo. */
export function controlGastoFijo() {
  const vistos = new Set<string>()
  return (mes: string): boolean => {
    if (vistos.has(mes)) return false
    vistos.add(mes)
    return true
  }
}

/** ¿Es un día hábil? La casa no abre los fines de semana. */
export const esHabil = (fecha: string): boolean => {
  const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return dow !== 0 && dow !== 6
}
