import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Mantener `diario` a la par de `movimientos_caja` al editar y al borrar.
 *
 * POR QUE HACE FALTA
 * Un movimiento de cuenta corriente vive en las DOS tablas: `movimientos_caja` es el
 * espejo completo de la planilla (lo que ven Transacciones, Inicio, Ganancias) y `diario`
 * guarda las patas que mueven el saldo del cliente (lo que ve Cuentas Corrientes).
 *
 * El alta y el sync escriben en las dos. El borrado y la edición, hasta el 1/9/2026,
 * tocaban solo `movimientos_caja`: el movimiento desaparecía del listado o cambiaba de
 * monto, y en `diario` seguía intacto sumando al saldo. Quedaba mal SIN NINGUNA SEÑAL en
 * pantalla, que es lo peor de todo — nadie tenía cómo enterarse.
 *
 * COMO SE ENCUENTRA LA FILA GEMELA
 * Las dos tablas no comparten un id: `diario` es anterior y el sync regenera los uuid en
 * cada corrida full, así que un vínculo por id no sobreviviría. Se identifica por
 * CONTENIDO, con el mismo criterio que la limpieza de la planilla: solo se toca si la
 * coincidencia es UNICA. Con cero o con varias no se adivina — se informa y que lo
 * resuelva una persona.
 */

export type ResultadoDiario =
  | { estado: 'no_aplica' }            // el movimiento no es de cuenta corriente
  | { estado: 'ok'; id: string }
  | { estado: 'no_encontrada' }
  | { estado: 'multiple'; candidatas: number }
  | { estado: 'error'; error: string }

/** Datos mínimos para ubicar la fila de `diario` que corresponde a un movimiento. */
export type Movimiento = {
  tipo: string | null
  cliente: string | null
  fecha: string
  operacion: string | null
  monto: number | string | null
}

const esCtaCte = (m: Movimiento) => (m.tipo ?? '').toUpperCase() === 'CTA CTE'

/**
 * Ubica la fila de `diario` que corresponde a un movimiento de cuenta corriente.
 * Devuelve 'no_aplica' si el movimiento es de caja: ahí no hay gemela y no falta nada.
 */
export async function buscarEnDiario(
  supabase: SupabaseClient<any, any, any>,
  mov: Movimiento,
): Promise<ResultadoDiario> {
  if (!esCtaCte(mov)) return { estado: 'no_aplica' }

  const { data, error } = await supabase
    .from('diario')
    .select('id')
    .eq('tipo', 'CTA CTE')
    .eq('anulado', false)
    .eq('cuenta_cte', mov.cliente ?? '')
    .eq('fecha', mov.fecha)
    .eq('operacion', (mov.operacion ?? '').toUpperCase())
    .eq('monto', Number(mov.monto))

  if (error) return { estado: 'error', error: error.message }
  const filas = (data ?? []) as { id: string }[]
  if (filas.length === 0) return { estado: 'no_encontrada' }
  if (filas.length > 1) return { estado: 'multiple', candidatas: filas.length }
  return { estado: 'ok', id: filas[0].id }
}

/** Borra la fila de `diario` que acompaña a un movimiento de cuenta corriente. */
export async function borrarDeDiario(
  supabase: SupabaseClient<any, any, any>,
  mov: Movimiento,
): Promise<ResultadoDiario> {
  const encontrada = await buscarEnDiario(supabase, mov)
  if (encontrada.estado !== 'ok') return encontrada

  const { error } = await supabase.from('diario').delete().eq('id', encontrada.id)
  if (error) return { estado: 'error', error: error.message }
  return encontrada
}

/** Campos de `diario` que cambian al editar un movimiento. */
export type CambiosDiario = {
  fecha: string
  cuenta_cte: string | null
  operacion: string
  concepto: string
  moneda: string
  monto: number
  cotizacion: number | null
  cc_pesos: number
  cc_dolares: number
  cc_euros: number
  cc_reales: number
  cc_usdt: number
  evento: string | null
  notas: string | null
}

/**
 * Aplica en `diario` la misma edición que se hizo en `movimientos_caja`.
 * `mov` son los datos ORIGINALES (con los que se ubica la fila); `cambios`, los nuevos.
 */
export async function actualizarEnDiario(
  supabase: SupabaseClient<any, any, any>,
  mov: Movimiento,
  cambios: CambiosDiario,
): Promise<ResultadoDiario> {
  const encontrada = await buscarEnDiario(supabase, mov)
  if (encontrada.estado !== 'ok') return encontrada

  const { error } = await supabase.from('diario').update(cambios).eq('id', encontrada.id)
  if (error) return { estado: 'error', error: error.message }
  return encontrada
}

/** Aviso para el operador cuando la fila de cuenta corriente no se pudo tocar. */
export function avisoDiario(r: ResultadoDiario, accion: 'borrar' | 'editar'): string | null {
  if (r.estado === 'ok' || r.estado === 'no_aplica') return null
  const que = accion === 'borrar' ? 'se borró' : 'se editó'
  if (r.estado === 'no_encontrada') {
    return `El movimiento ${que}, pero no se encontró su registro en la cuenta corriente. Verificá el saldo de la cuenta.`
  }
  if (r.estado === 'multiple') {
    return `El movimiento ${que}, pero en la cuenta corriente hay ${r.candidatas} registros idénticos y no se puede saber cuál corresponde: el saldo puede quedar mal. Avisale al administrador.`
  }
  return `El movimiento ${que}, pero falló la actualización de la cuenta corriente (${r.error}). El saldo puede quedar mal.`
}
