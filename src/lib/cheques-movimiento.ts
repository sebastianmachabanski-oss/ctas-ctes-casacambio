/**
 * El movimiento de plata que genera una salida de la cartera de cheques.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Hasta el 27/11/2026 ninguna transición del cheque registraba plata. Solo el alta lo
 * hacía. El cheque salía de la cartera y del calendario, y la caja no se enteraba: la
 * tarjeta CHEQUES de Inicio mostraba todos los cheques comprados en la historia, cobrados
 * incluidos. No era la cartera, era el acumulado de compras.
 *
 * ── LA REGLA QUE ORDENA TODO EL CIRCUITO ───────────────────────────────────
 * Toda salida de la cartera es un movimiento con la pata de CHEQUES en negativo. Lo único
 * que cambia entre un caso y otro es la cotización, que es cuánto se cobró por peso de
 * nominal:
 *
 *   · Acreditado (el banco pagó)   cotización 1       — paga el valor escrito
 *   · Vendido (redescuento)        cotización < 1     — la otra financiera descuenta
 *   · Devuelto al cliente          lo que se pagó     — devuelve lo adelantado
 *   · Rechazado                    según qué se haga con la plata
 *
 * Por eso esto es un helper y no código metido en la acreditación: los otros caminos
 * necesitan exactamente lo mismo con otra cotización.
 *
 * ── POR QUÉ NO CAMBIA GANANCIAS ────────────────────────────────────────────
 * Un cheque de 100 comprado en 88: hoy la pantalla valúa la cartera a NOMINAL y reconoce
 * los 12 el día del descuento. Con el movimiento, el calce da 100 × (1,00 − 0,88) = 12 y
 * el stock queda en cero. El mismo número. Valuar a nominal ES anticipar este cobro, así
 * que registrarlo no agrega ganancia: le saca el supuesto.
 *
 * ── DOS COSAS QUE NO SE PUEDEN OLVIDAR ─────────────────────────────────────
 * 1. `diario` Y `movimientos_caja`, con el mismo `vinculo`. Es la regla del dominio del
 *    1/9/2026 y la respeta el alta; saltearla deja el saldo mal sin señal en pantalla.
 * 2. `origen: 'app'`. Esta fila NO existe en la planilla —la genera la app al marcar el
 *    cheque— así que un sync la borraría igual que borraría las de USDT. Por lo mismo no
 *    se escribe al Sheet: si la oficina además carga el cobro allá, se duplicaría.
 */
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularMovimiento, validarOperacion } from '@/lib/motor-calculo'
import { hayColumnaVinculo } from '@/lib/diario'
import { CONCEPTO_INCOBRABLE, type ChequeNuevo } from '@/lib/cheques'

export type SalidaDeCheques = {
  /** Fecha del hecho, no del día en que se carga. */
  fecha: string
  /** Con quién se liquidó. En una acreditación, el banco del cheque. */
  cliente: string
  /** Nominal que sale de la cartera. Siempre positivo. */
  nominal: number
  /** Pesos por peso de nominal. 1 en una acreditación. */
  cotizacion: number
  /** Qué fue. Va en `evento` y en `notas`, como manda la regla del 1/9/2026. */
  referencia: string
  /** Nombre del autor para el listado. */
  autor: string
}

export type ResultadoSalida = { id: string } | { error: string }

export const registrarSalidaDeCheques = (
  supabase: SupabaseClient<any, any, any>,
  s: SalidaDeCheques,
) => registrarMovimientoDeCheques(supabase, s, 'VENTA')

/**
 * La COMPRA del cheque que se recibe en un canje.
 *
 * Es el mismo movimiento que una salida con la pata de cheques al revés, así que comparte
 * todo: el motor, las dos tablas, el vínculo y el manejo de errores. Lo que la hace un
 * canje es que los pesos que salen son exactamente los que entraron por la salida del
 * cheque rechazado, de modo que se cancelan y la casa no pone plata.
 */
export const registrarCompraDeCheques = (
  supabase: SupabaseClient<any, any, any>,
  s: SalidaDeCheques,
) => registrarMovimientoDeCheques(supabase, s, 'COMPRA')

async function registrarMovimientoDeCheques(
  supabase: SupabaseClient<any, any, any>,
  s: SalidaDeCheques,
  operacion: 'VENTA' | 'COMPRA',
): Promise<ResultadoSalida> {
  if (!(s.nominal > 0)) return { error: 'El nominal tiene que ser mayor a cero' }
  if (!(s.cotizacion > 0)) return { error: 'La cotización tiene que ser mayor a cero' }

  const datos = {
    tipo: 'CAJA' as const,
    operacion,
    propio: 'CHEQUES',
    externo: 'PESOS',
    monto: s.nominal,
    cotizacion: s.cotizacion,
    costoPorcentaje: null,
  }

  // El impacto lo calcula el MOTOR, nunca se arma a mano: hacerlo a mano ya produjo el
  // signo invertido el 1/9/2026.
  const errorNegocio = validarOperacion({ operacion: datos.operacion, propio: datos.propio })
  if (errorNegocio) return { error: errorNegocio }
  let impacto: { cuenta: string | null; valores: Record<string, number> }
  try {
    impacto = calcularMovimiento(datos)
  } catch (e: any) {
    return { error: e?.message ?? 'Operación inválida' }
  }

  const vinculo = (await hayColumnaVinculo(supabase)) ? randomUUID() : null
  const conVinculo = vinculo ? { vinculo } : {}

  const comunes = {
    fecha: s.fecha,
    tipo: datos.tipo,
    operacion: datos.operacion,
    monto: s.nominal,
    cc_pesos: Number(impacto.valores['CC PESOS'] ?? 0),
    cc_dolares: Number(impacto.valores['CC DOLARES'] ?? 0),
    cc_euros: Number(impacto.valores['CC EUROS'] ?? 0),
    cc_reales: Number(impacto.valores['CC REALES'] ?? 0),
    cc_usdt: Number(impacto.valores['CC USDT'] ?? 0),
    cc_libras: Number(impacto.valores['CC LIBRAS'] ?? 0),
    origen: 'app',
    notas: s.referencia,
  }

  // `evento` SOLO va en `diario`: `movimientos_caja` no tiene esa columna, y mandársela
  // haría fallar el insert entero. Es la misma asimetría que respeta el alta — la regla
  // del 1/9/2026 ("la referencia va en evento Y en notas") aplica a `diario`; del lado de
  // caja la referencia vive en `notas` y nada más.
  const { error: errorDiario } = await (supabase as any).from('diario').insert({
    ...conVinculo,
    ...comunes,
    evento: s.referencia,
    cuenta_cte: s.cliente,
    concepto: `${datos.propio} → ${datos.externo}`,
    detalle: 'C',
    moneda: 'CHEQUES',
    cotizacion: s.cotizacion,
    creado_por: s.autor,
    anulado: false,
  })
  if (errorDiario) return { error: `No se pudo escribir el movimiento: ${errorDiario.message}` }

  const { data: fila, error: errorCaja } = await (supabase as any)
    .from('movimientos_caja').insert({
      ...conVinculo,
      ...comunes,
      fila_sheet: null,
      op: 'C',
      cliente: s.cliente,
      propio: datos.propio,
      externo: datos.externo,
      cot: s.cotizacion,
      cot_efectiva: s.cotizacion,
      costo_pct: null,
      debe: null,
      cuenta: impacto.cuenta,
      creado_por: s.autor,
      creado_at: new Date().toISOString(),
      ...Object.fromEntries(
        Object.entries(impacto.valores).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), v]),
      ),
    }).select('id').single()

  // ACÁ NO HAY TOLERANCIA, a diferencia del alta. En el alta `movimientos_caja` se puede
  // recuperar con el próximo sync porque la fila existe en la planilla; esta no existe en
  // ningún lado. Si falla hay que deshacer `diario` y avisar, o quedaría un saldo sin su
  // contrapartida en caja.
  if (errorCaja || !fila) {
    if (vinculo) await (supabase as any).from('diario').delete().eq('vinculo', vinculo)
    return {
      error: 'No se pudo registrar el movimiento en caja'
        + (errorCaja ? `: ${errorCaja.message}` : '')
        + (vinculo ? '. No quedó nada a medias.' : '. Revisá `diario`: puede haber quedado la mitad.'),
    }
  }

  return { id: (fila as { id: string }).id }
}

/**
 * Debita en la cuenta corriente de un cliente.
 *
 * Es la segunda pata de "se lo debito": el cheque sale de la caja con una VENTA y acá el
 * cliente queda debiendo. Son DOS filas y no una porque el motor no tiene columna
 * `CC CHEQUES` —corta con un error explícito— así que un `CTA CTE · VENTA · CHEQUES`
 * no existe. No es un rodeo: es la única forma.
 *
 * `EGRESAN` y no `INGRESAN`: en la planilla un EGRESAN deja la cuenta en POSITIVO, que es
 * el cliente debiéndole a la casa. El signo lo pone el motor, nunca se arma a mano.
 */
export async function registrarEgresoCuenta(
  supabase: SupabaseClient<any, any, any>,
  s: { fecha: string; cuenta: string; monto: number; referencia: string; autor: string },
): Promise<{ ok: true } | { error: string }> {
  if (!(s.monto > 0)) return { error: 'El importe tiene que ser mayor a cero' }
  if (!s.cuenta.trim()) return { error: 'Falta la cuenta corriente a debitar' }

  let impacto: { cuenta: string | null; valores: Record<string, number> }
  try {
    impacto = calcularMovimiento({
      tipo: 'CTA CTE', operacion: 'EGRESAN', propio: 'PESOS', externo: '',
      monto: s.monto, cotizacion: null, costoPorcentaje: null,
    })
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudo calcular el débito' }
  }

  const vinculo = (await hayColumnaVinculo(supabase)) ? randomUUID() : null
  const conVinculo = vinculo ? { vinculo } : {}
  const comunes = {
    fecha: s.fecha,
    tipo: 'CTA CTE',
    operacion: 'EGRESAN',
    monto: s.monto,
    origen: 'app',
    notas: s.referencia,
    cc_pesos: Number(impacto.valores['CC PESOS'] ?? 0),
    cc_dolares: 0, cc_euros: 0, cc_reales: 0, cc_usdt: 0, cc_libras: 0,
  }

  const { error: errorDiario } = await (supabase as any).from('diario').insert({
    ...conVinculo, ...comunes,
    evento: s.referencia,
    cuenta_cte: s.cuenta.trim(),
    concepto: 'PESOS',
    detalle: 'C',
    moneda: 'PESOS',
    creado_por: s.autor,
    anulado: false,
  })
  if (errorDiario) return { error: `No se pudo debitar la cuenta: ${errorDiario.message}` }

  const { error: errorCaja } = await (supabase as any).from('movimientos_caja').insert({
    ...conVinculo, ...comunes,
    fila_sheet: null,
    op: 'C',
    cliente: s.cuenta.trim(),
    propio: 'PESOS',
    externo: null,
    cot: null,
    cot_efectiva: 1,
    cuenta: impacto.cuenta,
    creado_por: s.autor,
    creado_at: new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(impacto.valores).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), v]),
    ),
  })
  if (errorCaja) {
    if (vinculo) await (supabase as any).from('diario').delete().eq('vinculo', vinculo)
    return { error: `No se pudo debitar la cuenta en caja: ${errorCaja.message}` }
  }
  return { ok: true }
}

/**
 * Inserta los cheques de una operación y su primer evento.
 *
 * Lo usan el alta y el canje por otro cheque. Está acá y no copiado en los dos porque son
 * las filas de las que después cuelga toda la cartera: dos versiones se desincronizan y la
 * primera corrección entra en una sola, sin que nada falle.
 *
 * `vinculoCanje` ata el cheque nuevo al que rebotó. Sin eso, meses después nadie puede
 * reconstruir que el cheque B existe porque el A no se pagó, que es el dato que dice qué
 * clientes patean el problema para adelante.
 */
export async function insertarCheques(
  supabase: SupabaseClient<any, any, any>,
  p: {
    movimientoId: string
    cheques: readonly ChequeNuevo[]
    fecha: string
    creadoPor: string
    nota: string
    vinculoCanje?: string | null
  },
): Promise<{ ids: string[] } | { error: string }> {
  const limpio = (v: string | null | undefined) => {
    const s = String(v ?? '').trim()
    return s ? s : null
  }

  const { data: insertados, error } = await (supabase as any)
    .from('cheques')
    .insert(p.cheques.map(c => ({
      movimiento_id: p.movimientoId,
      numero: c.numero.trim(),
      importe: Number(c.importe),
      fecha_pago: c.fecha_pago,
      fecha_emision: c.fecha_emision || null,
      estado: 'en_cartera',
      tipo: c.tipo,
      librador: limpio(c.librador),
      cuit_librador: limpio(c.cuit_librador),
      banco: limpio(c.banco),
      sucursal: limpio(c.sucursal),
      cuenta: limpio(c.cuenta),
      // La RUTA dentro del bucket privado, no una URL: una firmada vence.
      archivo_url: limpio(c.archivo_url),
      origen_datos: 'manual',
      creado_por: p.creadoPor,
      notas: p.vinculoCanje ? `Reemplaza al cheque rechazado ${p.vinculoCanje}` : null,
    })))
    .select('id')
  if (error) return { error: error.message }

  const ids = ((insertados ?? []) as { id: string }[]).map(r => r.id)
  const { error: errorEventos } = await (supabase as any).from('cheques_eventos').insert(
    ids.map(id => ({
      cheque_id: id, fecha: p.fecha, estado: 'en_cartera',
      movimiento_id: p.movimientoId, notas: p.nota, creado_por: p.creadoPor,
    })))
  if (errorEventos)
    return { error: `Los cheques se guardaron pero sin su primer evento: ${errorEventos.message}` }

  return { ids }
}

/**
 * La baja de un cheque incobrable: DOS movimientos, no uno.
 *
 * ── POR QUÉ DOS ────────────────────────────────────────────────────────────
 * Lo natural sería una venta a cotización cero, pero el motor convierte el cero en uno
 * (`cotBase = !cotizacion || cotizacion === 0 ? 1 : cotizacion`, réplica de la planilla) y
 * registraría un cobro que nunca pasó. Y un `FALTANTE` deja la caja bien pero Ganancias
 * peor: esa operación no entra al cálculo, así que el cheque seguiría contando como stock
 * valuado a nominal y mostraría una ganancia por algo que nunca se cobró.
 *
 * La baja de un activo son dos asientos, y acá también:
 *
 *   1. VENTA de CHEQUES a nominal   → el cheque sale de la cartera
 *   2. GASTOS en PESOS por el nominal → se da de baja contra pérdida
 *
 * Con un cheque de 100.000 comprado en 88.000:
 *
 *   caja      −88.000 (compra) +100.000 (salida) −100.000 (gasto) = −88.000
 *   ganancias +12.000 (calce)                    −100.000 (gasto) = −88.000
 *
 * Las dos dan la plata que se sacó y no se recuperó. El gasto es por el NOMINAL y no por
 * lo pagado porque los 12.000 de descuento ya se habían reconocido al comprar: dar de baja
 * el documento entero borra la ganancia que no existió y el capital que sí se puso.
 *
 * ── EL CONCEPTO DEL GASTO ──────────────────────────────────────────────────
 * Va en el campo CLIENTE, que es por donde la pantalla de Gastos busca. Así la pérdida por
 * cheques se puede consultar aparte del alquiler y los sueldos.
 */
export async function registrarBajaIncobrable(
  supabase: SupabaseClient<any, any, any>,
  s: Omit<SalidaDeCheques, 'cotizacion'>,
): Promise<{ idSalida: string } | { error: string }> {
  // 1. El cheque sale a nominal.
  const salida = await registrarSalidaDeCheques(supabase, { ...s, cotizacion: 1 })
  if ('error' in salida) return salida

  // 2. El gasto que lo da de baja. Lleva la MISMA referencia que la salida: es lo que
  //    después permite encontrarlo para deshacer sin adivinar por importe y fecha.
  const gasto = await registrarGastoIncobrable(supabase, s)
  if ('error' in gasto) {
    await borrarSalidaDeCheques(supabase, salida.id)
    return { error: `${gasto.error}. La salida del cheque se deshizo; no quedó nada a medias.` }
  }

  return { idSalida: salida.id }
}

async function registrarGastoIncobrable(
  supabase: SupabaseClient<any, any, any>,
  s: Omit<SalidaDeCheques, 'cotizacion'>,
): Promise<{ ok: true } | { error: string }> {
  let impacto: { cuenta: string | null; valores: Record<string, number> }
  try {
    impacto = calcularMovimiento({
      tipo: 'CAJA', operacion: 'GASTOS', propio: 'PESOS', externo: '',
      monto: s.nominal, cotizacion: null, costoPorcentaje: null,
    })
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudo calcular el gasto' }
  }

  const vinculo = (await hayColumnaVinculo(supabase)) ? randomUUID() : null
  const conVinculo = vinculo ? { vinculo } : {}
  const comunes = {
    fecha: s.fecha,
    tipo: 'CAJA',
    operacion: 'GASTOS',
    monto: s.nominal,
    origen: 'app',
    notas: s.referencia,
  }

  const { error: errorDiario } = await (supabase as any).from('diario').insert({
    ...conVinculo, ...comunes,
    evento: s.referencia,
    cuenta_cte: CONCEPTO_INCOBRABLE,
    concepto: 'PESOS',
    detalle: 'C',
    moneda: 'PESOS',
    creado_por: s.autor,
    anulado: false,
  })
  if (errorDiario) return { error: `No se pudo registrar la pérdida: ${errorDiario.message}` }

  const { error: errorCaja } = await (supabase as any).from('movimientos_caja').insert({
    ...conVinculo, ...comunes,
    fila_sheet: null,
    op: 'C',
    cliente: CONCEPTO_INCOBRABLE,
    propio: 'PESOS',
    externo: null,
    cot: null,
    cot_efectiva: 1,
    cuenta: impacto.cuenta,
    creado_por: s.autor,
    creado_at: new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(impacto.valores).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), v]),
    ),
  })
  if (errorCaja) {
    if (vinculo) await (supabase as any).from('diario').delete().eq('vinculo', vinculo)
    return { error: `No se pudo registrar la pérdida en caja: ${errorCaja.message}` }
  }
  return { ok: true }
}

/**
 * Deshace una baja: borra la salida del cheque y su gasto.
 *
 * El gasto se ubica por CONTENIDO —misma referencia, mismo concepto— porque el evento
 * guarda un solo `movimiento_id` y ahí va el de la salida. Es el mismo criterio que usa
 * `diario.ts` para la fila gemela: se borra solo si la coincidencia es ÚNICA, y con cero o
 * varias se avisa en vez de adivinar. La referencia incluye el número de cheque, así que
 * en la práctica siempre es una.
 */
export async function borrarBajaIncobrable(
  supabase: SupabaseClient<any, any, any>,
  movimientoSalida: string,
  referencia: string,
): Promise<{ ok: true; avisos: string[] } | { error: string }> {
  const avisos: string[] = []

  const { data: gastos } = await (supabase as any)
    .from('movimientos_caja').select('id')
    .eq('operacion', 'GASTOS').eq('cliente', CONCEPTO_INCOBRABLE).eq('notas', referencia)
  const filas = ((gastos ?? []) as { id: string }[])

  if (filas.length === 1) {
    const res = await borrarSalidaDeCheques(supabase, filas[0].id)
    if ('error' in res) return { error: `No se pudo borrar la pérdida: ${res.error}` }
    if (res.avisoDiario) avisos.push(res.avisoDiario)
  } else {
    avisos.push(filas.length === 0
      ? 'No se encontró el gasto de la baja: borralo a mano si existe.'
      : `Hay ${filas.length} gastos con la misma referencia: no se borró ninguno. Revisalos a mano.`)
  }

  const res = await borrarSalidaDeCheques(supabase, movimientoSalida)
  if ('error' in res) return { error: res.error }
  if (res.avisoDiario) avisos.push(res.avisoDiario)
  return { ok: true, avisos }
}

/**
 * Deshace una salida: borra el movimiento de las DOS tablas.
 *
 * Se borra por `vinculo` cuando está —es el uuid compartido y no hay nada que deducir— y
 * si la base todavía no tiene esa columna, solo de `movimientos_caja`, avisando: preferible
 * a adivinar por contenido, que es exactamente lo que falló en producción el 30/10/2026
 * con dos ingresos idénticos el mismo día.
 */
export async function borrarSalidaDeCheques(
  supabase: SupabaseClient<any, any, any>,
  movimientoId: string,
): Promise<{ ok: true; avisoDiario?: string } | { error: string }> {
  const { data: mov } = await (supabase as any)
    .from('movimientos_caja').select('id,vinculo').eq('id', movimientoId).maybeSingle()
  if (!mov) return { error: 'El movimiento ya no existe' }

  const vinculo = (mov as { vinculo?: string | null }).vinculo ?? null
  let avisoDiario: string | undefined

  if (vinculo) {
    const { error } = await (supabase as any).from('diario').delete().eq('vinculo', vinculo)
    if (error) return { error: `No se pudo borrar el movimiento de \`diario\`: ${error.message}` }
  } else {
    avisoDiario = 'El movimiento se borró de caja, pero no tenía vínculo con `diario`: '
      + 'revisá esa tabla a mano.'
  }

  const { error } = await (supabase as any).from('movimientos_caja').delete().eq('id', movimientoId)
  if (error) return { error: `No se pudo borrar el movimiento: ${error.message}` }
  return { ok: true, avisoDiario }
}
