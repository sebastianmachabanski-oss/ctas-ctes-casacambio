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
  /**
   * Referencia del movimiento. No entra en la búsqueda inicial: se usa SOLO para
   * desempatar cuando el contenido deja más de una candidata (ver `desempatar`).
   */
  notas?: string | null
}

const esCtaCte = (m: Movimiento) => (m.tipo ?? '').toUpperCase() === 'CTA CTE'

/** Fila de `diario` con lo necesario para desempatar. */
type Candidata = { id: string; evento: string | null; notas: string | null }

/** Normaliza una referencia para comparar: sin espacios de sobra y sin distinguir mayúsculas. */
const normRef = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()

/**
 * Desempata entre varias filas de `diario` usando la REFERENCIA del movimiento.
 *
 * POR QUÉ HACE FALTA (7/10/2026)
 * La búsqueda por contenido —cuenta + fecha + operación + monto— no siempre identifica una
 * sola fila. Caso real: el 5/10/2026 la cuenta EDY tenía DOS ingresos de U$S 5.000 el mismo
 * día, uno con referencia "MATI RAFA" y otro con "RAFA". Al borrar uno, `buscarEnDiario`
 * devolvía 'multiple', no tocaba `diario` y avisaba — el movimiento desaparecía del listado
 * pero seguía sumando al saldo de la cuenta corriente.
 *
 * La referencia distingue las dos sin ninguna ambigüedad, y ya está guardada: la escriben
 * tanto el alta como el sync. Lo único que faltaba era mirarla.
 *
 * SE USA SOLO COMO DESEMPATE, nunca en la búsqueda inicial. Si entrara en el `where`, un
 * movimiento viejo cuya referencia no coincide exactamente entre las dos tablas pasaría de
 * encontrarse a NO encontrarse, y un caso que hoy funciona se rompería. Así, lo que hoy da
 * una sola fila sigue dando una sola fila; esto solo actúa donde antes se abandonaba.
 *
 * `evento` primero y `notas` como respaldo: el sync deja la referencia en `evento` y las
 * pantallas caen a `notas` para lo cargado antes del 1/9/2026.
 */
export function desempatar(candidatas: Candidata[], referencia: string | null | undefined): Candidata[] {
  const buscada = normRef(referencia)
  // Sin referencia no hay con qué desempatar: se devuelve el empate tal cual, para que
  // quien llame avise en vez de elegir una al azar.
  if (!buscada) return candidatas
  return candidatas.filter(c => normRef(c.evento ?? c.notas) === buscada)
}

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
    .select('id, evento, notas')
    .eq('tipo', 'CTA CTE')
    .eq('anulado', false)
    .eq('cuenta_cte', mov.cliente ?? '')
    .eq('fecha', mov.fecha)
    .eq('operacion', (mov.operacion ?? '').toUpperCase())
    .eq('monto', Number(mov.monto))

  if (error) return { estado: 'error', error: error.message }
  const filas = (data ?? []) as Candidata[]
  if (filas.length === 0) return { estado: 'no_encontrada' }
  if (filas.length === 1) return { estado: 'ok', id: filas[0].id }

  // Empate: dos o más filas con el mismo contenido. La referencia suele distinguirlas.
  const finalistas = desempatar(filas, mov.notas)
  if (finalistas.length === 1) return { estado: 'ok', id: finalistas[0].id }

  // Sigue sin poder decidirse: se informa el empate ORIGINAL y no se toca nada. Con cero
  // o con varias no se adivina — es plata de un cliente.
  return { estado: 'multiple', candidatas: filas.length }
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

/** Campos de `diario` que cambian al editar un movimiento (y con los que se crea uno). */
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
 * Deja `diario` como corresponda cuando una edición puede cambiar el TIPO del movimiento.
 *
 * Cambiar CAJA ↔ CTA CTE no es editar un campo más: decide si el movimiento existe o no
 * en `diario`. Son cuatro casos y los cuatro tienen que estar cubiertos, porque olvidarse
 * de uno deja el saldo del cliente mal en silencio:
 *
 *   CAJA    → CAJA      no hay nada que hacer
 *   CTA CTE → CTA CTE   se actualiza la fila
 *   CAJA    → CTA CTE   se CREA la fila (antes no existía)
 *   CTA CTE → CAJA      se BORRA la fila (el movimiento ya no toca la cuenta)
 */
export async function sincronizarDiario(
  supabase: SupabaseClient<any, any, any>,
  original: Movimiento & { op?: string | null; origen?: string | null },
  tipoNuevo: string,
  cambios: CambiosDiario,
  creadoPor: string,
): Promise<ResultadoDiario> {
  const era = esCtaCte(original)
  const es = (tipoNuevo ?? '').toUpperCase() === 'CTA CTE'

  if (!era && !es) return { estado: 'no_aplica' }
  if (era && es) return actualizarEnDiario(supabase, original, cambios)
  if (era && !es) return borrarDeDiario(supabase, original)

  // CAJA → CTA CTE: el movimiento pasa a tocar la cuenta del cliente y necesita su fila.
  const { data, error } = await supabase.from('diario').insert({
    ...cambios,
    tipo: 'CTA CTE',
    detalle: original.op ?? 'C',
    origen: original.origen ?? 'sheet',
    creado_por: creadoPor,
    anulado: false,
  }).select('id').single()

  if (error) return { estado: 'error', error: error.message }
  return { estado: 'ok', id: (data as { id: string }).id }
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
