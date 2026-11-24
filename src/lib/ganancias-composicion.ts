/**
 * Cómo se compone la ganancia del período.
 *
 * POR QUÉ ESTÁ ACÁ Y NO EN EL COMPONENTE
 * Mismo criterio que `posicion.ts` y `ganancias-tt.ts`: el cálculo vive en `lib` para
 * poder correrlo sin montar un navegador. Ver `scripts/validar-ganancias-composicion.mts`.
 *
 * Además lo comparten DOS pantallas —Ganancias y la de composición—, y una fórmula de
 * plata duplicada en dos archivos se desincroniza: la primera corrección entra en uno de
 * los dos y nadie se entera, porque los dos siguen mostrando un número plausible.
 *
 * ── EL PROBLEMA QUE RESUELVE `componer()` ──────────────────────────────────
 * La pantalla de Ganancias calcula sobre UNA moneda por vez. Su resultado incluye los
 * gastos y las transferencias enteros, porque son del negocio, no de la moneda. Entonces
 * los números de cada moneda NO SE PUEDEN SUMAR: hacerlo cuenta los gastos tantas veces
 * como monedas haya.
 *
 * `componer()` arma el resultado del negocio entero: suma el aporte de cada moneda —que
 * sí es propio de cada una— y recién después descuenta los gastos y suma las
 * transferencias, UNA SOLA VEZ.
 */

export type ParAgg = {
  vC: number; aC: number; vV: number; aV: number
  vCcc: number; aCcc: number; vVcc: number; aVcc: number
}

/** Neto de las transferencias (op = 'T') del día, por moneda: lo que entra menos lo que sale. */
export type TTAgg = { usd: number; eur: number; brl: number; usdt: number; gbp: number; chq: number; pesos: number }

export type DiaAgg = {
  f: string
  usd: ParAgg; eur: ParAgg; brl: ParAgg; usdt: ParAgg; gbp: ParAgg; chq: ParAgg
  g: number; gcc: number; tt: TTAgg
}

export type ParKey = 'usd' | 'eur' | 'brl' | 'usdt' | 'gbp' | 'chq'

export const PARES: ParKey[] = ['usd', 'eur', 'brl', 'usdt', 'gbp', 'chq']

export const NOMBRE_PAR: Record<ParKey, string> = {
  usd: 'Dólares', eur: 'Euros', brl: 'Reales', usdt: 'USDT', gbp: 'Libras', chq: 'Cheques',
}

export const SIMBOLO: Record<ParKey | 'pesos', string> = {
  usd: 'US$', eur: '€', brl: 'R$', usdt: 'USDT', gbp: '£', chq: 'CH$', pesos: '$',
}

/** Cómo se valúa lo que quedó en stock al cierre del período. */
export type Supuesto = { resid: 'fijo' | 'costo' | 'mtm'; margen: number; cierre: number }

/**
 * Supuestos de valuación del stock, por par.
 *
 * En divisas el estándar del negocio es el margen fijo. CHEQUES es distinto: la ganancia
 * del descuento de documentos se reconoce EN EL MOMENTO DEL DESCUENTO (criterio del
 * cliente, 11/8/2026), no cuando el cheque se cobra. Eso se obtiene valuando la cartera a
 * VALOR NOMINAL —"cotización de cierre" = 1 peso por peso de cheque—: la diferencia entre
 * el nominal y lo pagado cae como ganancia en el período en que se tomó el documento, y
 * el período del cobro queda en cero, sin duplicar.
 *
 * Heredar el default de divisas sería desastroso: con cierre 1.500, un millón de cheques
 * en cartera mostraría más de 1.499 millones de ganancia inexistente.
 */
export const SUPUESTOS_PAR: Record<ParKey, Supuesto> = {
  usd:  { resid: 'fijo', margen: 0.05, cierre: 1500 },
  eur:  { resid: 'fijo', margen: 0.05, cierre: 1500 },
  brl:  { resid: 'fijo', margen: 0.05, cierre: 1500 },
  usdt: { resid: 'fijo', margen: 0.05, cierre: 1500 },
  gbp:  { resid: 'fijo', margen: 0.05, cierre: 1500 },
  chq:  { resid: 'mtm',  margen: 0.05, cierre: 1 },
}

/** Lo que la pantalla de Ganancias deja configurar. */
export type Cfg = {
  ops: Set<string>
  par: ParKey
  cc: boolean
  resid: Supuesto['resid']
  margen: number
  cierre: number
  gastos: boolean
  /** Sumar el resultado de las transferencias (op = 'T'). */
  transferencias: boolean
}

/**
 * Cotización implícita de un par en el período: promedio ponderado por volumen de TODAS
 * sus operaciones (compras y ventas, caja y cuenta corriente).
 *
 * Sale de las operaciones reales, no de una cotización externa ni de la de hoy. Devuelve
 * `null` si en el período no hubo operaciones de ese par de las que derivarla.
 */
export function cotizacionPar(dias: DiaAgg[], par: ParKey): number | null {
  let vol = 0, ars = 0
  for (const d of dias) {
    const p = d[par]
    vol += p.vC + p.vCcc + p.vV + p.vVcc
    ars += p.aC + p.aCcc + p.aV + p.aVcc
  }
  return vol > 0 ? ars / vol : null
}

export const cotizacionUsd = (dias: DiaAgg[]) => cotizacionPar(dias, 'usd')

/**
 * Totales del período para UNA moneda, según la configuración.
 *
 *   ganancia = calzado × (tasa venta − tasa compra) + valuación del stock + gastos + TT
 *
 * La ganancia es de PERÍODO, no de transacción: nace del calce entre lo comprado y lo
 * vendido, así que una compra no genera ganancia hasta que se vende. Ver docs/GANANCIAS.md.
 *
 * OJO: el `neto` que devuelve incluye los gastos y las transferencias ENTEROS, que son del
 * negocio y no de la moneda. Por eso los `neto` de dos monedas no se suman — para eso está
 * `componer()`.
 *
 * `cotPar` es la cotización implícita del par; se necesita para expresar en pesos el
 * resultado de las transferencias, que nace en la moneda de la operación.
 */
export function calcPar(dias: DiaAgg[], cfg: Cfg, cotPar: number | null) {
  let vC = 0, aC = 0, vV = 0, aV = 0, g = 0
  for (const d of dias) {
    const p = d[cfg.par]
    if (cfg.ops.has('COMPRA')) { vC += p.vC + (cfg.cc ? p.vCcc : 0); aC += p.aC + (cfg.cc ? p.aCcc : 0) }
    if (cfg.ops.has('VENTA')) { vV += p.vV + (cfg.cc ? p.vVcc : 0); aV += p.aV + (cfg.cc ? p.aVcc : 0) }
    if (cfg.ops.has('GASTOS') && cfg.gastos) g += d.g + (cfg.cc ? d.gcc : 0)
  }
  // TRANSFERENCIAS (op = 'T'): la ganancia es lo que entra menos lo que sale, sin calce ni
  // spread — no tienen pata en pesos de la que sacar una tasa. El neto nace en la moneda de
  // la operación, así que para sumarlo al total en pesos hay que convertirlo con la
  // cotización del período. Las que YA son en pesos entran directo.
  let ttMoneda = 0, ttEnPesosDirecto = 0
  for (const d of dias) { ttMoneda += d.tt[cfg.par]; ttEnPesosDirecto += d.tt.pesos }
  const ttConvertible = cotPar != null
  const ttEnPesos = cfg.transferencias
    ? (ttConvertible ? ttMoneda * cotPar! : 0) + ttEnPesosDirecto
    : 0

  const t1 = vC ? aC / vC : 0, t2 = vV ? aV / vV : 0
  const spread = (vC && vV) ? t2 - t1 : 0
  const calzado = Math.min(vC, vV), stock = Math.abs(vC - vV)
  let gResid = 0
  if (cfg.resid === 'fijo') gResid = stock * cfg.margen
  else if (cfg.resid === 'mtm') gResid = vC >= vV ? stock * (cfg.cierre - t1) : stock * (t2 - cfg.cierre)
  const neto = calzado * spread + gResid + g + ttEnPesos
  return {
    vC, aC, vV, aV, t1, t2, spread, calzado, stock, gResid, g, neto,
    ttMoneda, ttEnPesos,
    // Hubo transferencias pero no se pudieron pasar a pesos: sin operaciones del par en el
    // período no hay cotización de la cual tomarla. Se avisa en vez de sumar cero como si
    // no hubiera pasado nada.
    ttSinCotizacion: cfg.transferencias && ttMoneda !== 0 && !ttConvertible,
  }
}

// ── La composición del resultado ───────────────────────────────────────────

/** Lo que aporta una moneda al resultado. Acá NO hay gastos ni transferencias. */
export type AporteMoneda = {
  par: ParKey
  nombre: string
  /** Todo lo que pasó por la ventanilla: compras más ventas. */
  operado: number
  /** La parte que se compró Y se vendió: la única que generó spread. */
  calzado: number
  /** La diferencia, que quedó en stock y se valúa con el supuesto. */
  stock: number
  /** Tasa promedio de compra y de venta. */
  t1: number
  t2: number
  /** Spread por unidad: t2 − t1. */
  spread: number
  /** Ganancia del calce: calzado × spread. */
  porSpread: number
  /** Valuación del stock según el supuesto del par. */
  valuacionStock: number
  /** Lo que aporta esta moneda: porSpread + valuacionStock. */
  aporta: number
  /** Cotización implícita del par en el período, o null si no operó. */
  cot: number | null
  /** Neto de transferencias de ESTA moneda, ya pasado a pesos. */
  ttEnPesos: number
  /** Hubo transferencias de esta moneda pero no hay cotización para pasarlas a pesos. */
  ttSinCotizacion: boolean
}

export type Composicion = {
  /** Una entrada por moneda con movimiento, de mayor a menor aporte. */
  monedas: AporteMoneda[]
  /** Monedas sin una sola operación en el período: se listan pero no se muestran. */
  sinMovimiento: ParKey[]
  /** Σ de lo que aporta cada moneda. */
  subtotalMonedas: number
  /** Resultado de las transferencias, en pesos. UNA sola vez. */
  transferencias: number
  /** Gastos del período. Ya vienen negativos. UNA sola vez. */
  gastos: number
  /** subtotalMonedas + transferencias + gastos. */
  neto: number
  /** El mismo resultado en dólares, o null si el período no tuvo operaciones en dólares. */
  netoUsd: number | null
  /** Cotización con la que se expresó en dólares. */
  cotUsd: number | null
  /** Monedas con transferencias que no se pudieron pasar a pesos. */
  ttSinCotizacion: ParKey[]
}

export type OpcionesComposicion = {
  /** Incluir las patas de cuenta corriente. */
  cc: boolean
  /** Descontar los gastos del período. */
  gastos: boolean
  /** Sumar el resultado de las transferencias. */
  transferencias: boolean
  /** Supuesto de valuación por par. Lo que no venga usa `SUPUESTOS_PAR`. */
  supuestos?: Partial<Record<ParKey, Supuesto>>
  /** Monedas a considerar. Por defecto, todas. */
  pares?: ParKey[]
}

/**
 * El resultado del negocio entero en el período.
 *
 * CÓMO SE EVITA CONTAR DOS VECES
 * Cada moneda se calcula con `calcPar()` pero con los gastos y las transferencias
 * APAGADOS: de ahí sale su aporte limpio (spread + valuación del stock), que es lo único
 * que le pertenece. Los gastos y las transferencias se suman una vez al final.
 *
 * Las transferencias sí se reparten por moneda —cada una con su propia cotización— pero
 * las que ya nacen en pesos (`tt.pesos`) se suman una sola vez, fuera del bucle: están
 * repetidas en el `tt` de todos los pares.
 */
export function componer(dias: DiaAgg[], op: OpcionesComposicion): Composicion {
  const pares = op.pares ?? PARES
  const monedas: AporteMoneda[] = []
  const sinMovimiento: ParKey[] = []
  const ttSinCotizacion: ParKey[] = []

  for (const par of pares) {
    const sup = op.supuestos?.[par] ?? SUPUESTOS_PAR[par]
    const cot = cotizacionPar(dias, par)

    // Gastos y transferencias APAGADOS: acá se busca solo lo que aporta la moneda.
    const r = calcPar(dias, {
      ops: new Set(['COMPRA', 'VENTA']), par, cc: op.cc,
      resid: sup.resid, margen: sup.margen, cierre: sup.cierre,
      gastos: false, transferencias: false,
    }, cot)

    const operado = r.vC + r.vV
    // El neto de transferencias DE ESTA MONEDA, sin la parte en pesos: esa se suma aparte
    // porque está repetida en el `tt` de todos los pares.
    let ttMoneda = 0
    for (const d of dias) ttMoneda += d.tt[par]
    const puedeConvertir = cot != null
    const ttDeLaMoneda = op.transferencias && puedeConvertir ? ttMoneda * cot! : 0
    const faltaCot = op.transferencias && ttMoneda !== 0 && !puedeConvertir
    if (faltaCot) ttSinCotizacion.push(par)

    if (operado === 0 && ttMoneda === 0) { sinMovimiento.push(par); continue }

    const porSpread = r.calzado * r.spread
    monedas.push({
      par, nombre: NOMBRE_PAR[par],
      operado, calzado: r.calzado, stock: r.stock,
      t1: r.t1, t2: r.t2, spread: r.spread,
      porSpread, valuacionStock: r.gResid, aporta: porSpread + r.gResid,
      cot, ttEnPesos: ttDeLaMoneda, ttSinCotizacion: faltaCot,
    })
  }

  monedas.sort((a, b) => b.aporta - a.aporta)

  const subtotalMonedas = monedas.reduce((a, m) => a + m.aporta, 0)

  // Transferencias: la parte de cada moneda, más las que ya nacen en pesos UNA vez.
  let ttPesosDirecto = 0
  for (const d of dias) ttPesosDirecto += d.tt.pesos
  const transferencias = op.transferencias
    ? monedas.reduce((a, m) => a + m.ttEnPesos, 0) + ttPesosDirecto
    : 0

  // Gastos: UNA vez. Las columnas ya traen el signo (negativo).
  let gastos = 0
  if (op.gastos) for (const d of dias) gastos += d.g + (op.cc ? d.gcc : 0)

  const neto = subtotalMonedas + transferencias + gastos
  const cotUsd = cotizacionUsd(dias)

  return {
    monedas, sinMovimiento, subtotalMonedas, transferencias, gastos, neto,
    netoUsd: cotUsd ? neto / cotUsd : null,
    cotUsd,
    ttSinCotizacion,
  }
}
