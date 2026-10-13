/**
 * Transferencias cargadas de una sola vez, con sus dos patas (13/10/2026).
 *
 * EL PROBLEMA QUE RESUELVE
 * Hasta ahora cada pata de una transferencia se cargaba por separado. Si la segunda no
 * llegaba —por olvido, o porque caía en otro mes y nadie la reclamaba— quedaba una pata
 * suelta. La app lo informa, pero el desvío se descubre días después, y para entonces ya
 * se hizo algún ajuste de caja para que cuadre y nadie quiere revertirlo.
 *
 * LO QUE DE VERDAD LO EVITA NO ES LA PANTALLA, ES EL GUARDADO. Si la primera pata se
 * guarda antes de que exista la segunda, alcanza con cerrar el navegador para volver al
 * mismo problema. Por eso las dos filas se insertan en UNA sola sentencia: Postgres
 * ejecuta un insert de varias filas como una unidad, así que entran las dos o no entra
 * ninguna. No hay estado intermedio posible.
 *
 * TRES COSAS QUE SE GANAN DE REGALO
 *  1. La referencia se escribe UNA vez y va idéntica a las dos patas. La clase de error
 *     que dejó filas sin parear —una nota tipeada distinto en cada pata— desaparece.
 *  2. La ganancia se ve ANTES de guardar, no días después en el módulo de Ganancias.
 *  3. Se puede aplicar la regla del negocio: el ingreso siempre mayor o igual al egreso.
 *
 * DECISIONES TOMADAS CON LOS DATOS A LA VISTA (relevamiento del 13/10/2026)
 *  - Una sola moneda para las dos patas: no hay ni una transferencia histórica con patas
 *    en monedas distintas.
 *  - Siempre tipo CAJA: 1.761 de 1.763 lo son, y las 2 restantes son ruido de la
 *    migración. Por eso el tipo no se elige.
 */

/** Lo que carga el operador en la pantalla. */
export type EntradaTransferencia = {
  fecha: string
  /** Participantes de la transferencia; es lo que vincula las dos patas. */
  referencia: string
  moneda: string
  /** Quién trae la plata y cuánto. */
  entra: { participante: string; monto: number }
  /** Quién se la lleva y cuánto. */
  sale: { participante: string; monto: number }
}

/** Una pata, con la forma que espera el motor de cálculo. */
export type PataTransferencia = {
  tipo: 'CAJA'
  operacion: 'INGRESAN' | 'EGRESAN'
  cliente: string
  propio: string
  externo: string
  monto: number
}

export type TransferenciaArmada = {
  patas: [PataTransferencia, PataTransferencia]
  /** Lo que entra menos lo que sale. Es la ganancia de la operación. */
  ganancia: number
}

const txt = (s: string | null | undefined) => (s ?? '').trim()

/**
 * Revisa lo cargado y devuelve el primer problema, o `null` si está todo bien.
 *
 * NO valida que el ingreso supere al egreso: eso no es un error de carga sino una señal
 * para que el operador confirme (ver `gananciaNegativa`). Son cosas distintas — una
 * impide guardar, la otra pide una confirmación.
 */
export function validarTransferencia(e: EntradaTransferencia): string | null {
  if (!txt(e.fecha)) return 'La fecha es obligatoria'
  if (!txt(e.referencia))
    return 'La referencia es obligatoria: es lo que vincula las dos patas (ej. "BOH - GRA")'
  if (!txt(e.moneda)) return 'La moneda es obligatoria'
  if (!txt(e.entra.participante)) return 'Falta quién entrega la plata'
  if (!txt(e.sale.participante)) return 'Falta quién la recibe'
  if (!isFinite(e.entra.monto) || e.entra.monto <= 0)
    return 'El monto que entra debe ser un número mayor a 0'
  if (!isFinite(e.sale.monto) || e.sale.monto <= 0)
    return 'El monto que sale debe ser un número mayor a 0'
  return null
}

/** Ganancia de la transferencia: lo que entra menos lo que sale. */
export const gananciaDe = (e: EntradaTransferencia) =>
  (Number(e.entra.monto) || 0) - (Number(e.sale.monto) || 0)

/**
 * ¿El egreso superó al ingreso? Por definición del negocio no debería pasar —"si no, no
 * hay negocio"—, así que se pide confirmación en vez de dejarlo entrar en silencio.
 */
export const gananciaNegativa = (e: EntradaTransferencia) => gananciaDe(e) < 0

/**
 * Arma las dos patas listas para el motor de cálculo.
 *
 * `propio` y `externo` llevan la MISMA moneda, igual que cualquier INGRESAN/EGRESAN
 * cargado hasta hoy (se puede ver en la huella de auditoría de los movimientos viejos:
 * `...|INGRESAN|DOLARES|DOLARES|...`). Con monedas iguales el motor no pide cotización,
 * que es lo correcto: en una transferencia no hay cambio de una moneda por otra.
 */
export function armarTransferencia(e: EntradaTransferencia): TransferenciaArmada {
  const moneda = txt(e.moneda).toUpperCase()
  const base = { tipo: 'CAJA' as const, propio: moneda, externo: moneda }
  return {
    patas: [
      { ...base, operacion: 'INGRESAN', cliente: txt(e.entra.participante), monto: Number(e.entra.monto) },
      { ...base, operacion: 'EGRESAN',  cliente: txt(e.sale.participante),  monto: Number(e.sale.monto) },
    ],
    ganancia: gananciaDe(e),
  }
}
