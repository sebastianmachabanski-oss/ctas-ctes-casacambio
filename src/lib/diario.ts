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
 * Por `vinculo`: un uuid que el alta escribe IGUAL en las dos tablas. Es un dato, no una
 * deducción, y es lo único que identifica la fila sin ambigüedad posible.
 *
 * Para lo cargado antes del 30/10/2026 —y para lo que trae el sync desde la planilla, que
 * no tiene cómo saber el vínculo— se cae a la búsqueda por CONTENIDO de siempre: cuenta +
 * fecha + operación + monto, desempatando por referencia. Esa búsqueda no es confiable
 * cuando el contenido se repite, y de ahí salió el `vinculo`:
 *
 *   30/10/2026, producción. Se cargaron DOS ingresos de U$S 19.300 el mismo día en la misma
 *   cuenta, los dos sin referencia. Al borrar uno, la búsqueda por contenido encontró dos
 *   filas idénticas en `diario`, no se animó a elegir y no borró ninguna: el movimiento
 *   desapareció del listado y el saldo del cliente siguió contándolo. La referencia, que es
 *   lo que desempata desde el 7/10, acá no servía porque las dos estaban vacías.
 *
 * CUANDO EL EMPATE ES ENTRE FILAS IDÉNTICAS
 * Se toca una. No es adivinar: si las dos filas dicen exactamente lo mismo —mismo importe,
 * misma moneda, mismas patas, misma referencia—, son intercambiables y borrar cualquiera de
 * las dos deja el mismo saldo. Negarse ahí no es prudencia: deja el saldo MAL, que es
 * precisamente lo que se quería evitar. Se sigue avisando cuando las candidatas DIFIEREN en
 * algo, porque ahí sí elegir mal cambia la plata de un cliente.
 */

/**
 * ¿La base ya tiene la columna `vinculo`?
 *
 * POR QUÉ SE PREGUNTA EN VEZ DE DARLO POR HECHO
 * Cada cliente tiene SU base, y las migraciones las corre una persona a mano, una por una.
 * O sea que el código nuevo va a llegar, sí o sí, a alguna base donde la migración todavía
 * no se corrió. Si el alta mandara `vinculo` ahí, el insert fallaría entero y el operador
 * no podría cargar una transacción: una mejora en el borrado dejaría la aplicación sin su
 * función principal, que es muchísimo peor que el problema que vino a resolver.
 *
 * Preguntando, el código funciona igual antes y después de la migración: con la columna usa
 * el vínculo, sin ella se comporta exactamente como la versión anterior. La migración deja
 * de ser un paso bloqueante y pasa a ser una mejora que entra cuando entra.
 *
 * La respuesta se recuerda por proceso: es una consulta de una fila y cambia una sola vez
 * en la vida de cada base.
 */
let columnaVinculo: Promise<boolean> | null = null

export async function hayColumnaVinculo(supabase: SupabaseClient<any, any, any>): Promise<boolean> {
  if (!columnaVinculo) {
    // Ante un error de red no se concluye que la columna falta: se vuelve a preguntar la
    // próxima vez. Recordar un "no" por un corte de red dejaría el vínculo apagado hasta
    // el siguiente despliegue.
    columnaVinculo = (async () => {
      try {
        const { error } = await supabase.from('diario').select('vinculo').limit(1)
        return !error
      } catch {
        columnaVinculo = null
        return false
      }
    })()
  }
  return columnaVinculo
}

/** Solo para las pruebas: olvida lo averiguado. */
export function olvidarColumnaVinculo() { columnaVinculo = null }

export type ResultadoDiario =
  | { estado: 'no_aplica' }            // el movimiento no es de cuenta corriente
  | { estado: 'ok'; id: string; porVinculo?: boolean; identicas?: number }
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
  /** El uuid compartido con la fila de `diario`. Null en lo anterior al 30/10/2026. */
  vinculo?: string | null
}

const esCtaCte = (m: Movimiento) => (m.tipo ?? '').toUpperCase() === 'CTA CTE'

/** Fila de `diario` con lo necesario para desempatar y para comparar entre sí. */
type Candidata = {
  id: string
  evento: string | null
  notas: string | null
  [campo: string]: unknown
}

/**
 * Los campos que tienen que coincidir para considerar dos filas INTERCAMBIABLES.
 *
 * No están todos: `id`, `creado_por` y `creado_at` quedan afuera a propósito. Dos ingresos
 * iguales cargados por dos personas distintas siguen siendo la misma plata, y el saldo no
 * distingue quién los cargó. Lo que entra es lo que se ve y lo que mueve el saldo.
 *
 * La cuenta, la fecha, la operación y el monto no están porque ya vienen fijados por la
 * búsqueda: todas las candidatas los comparten por definición.
 */
const CAMPOS_COMPARABLES = [
  'concepto', 'detalle', 'moneda', 'cotizacion', 'origen', 'evento', 'notas',
  'cc_pesos', 'cc_dolares', 'cc_euros', 'cc_reales', 'cc_usdt', 'cc_libras',
] as const

/** Una huella del contenido de la fila, para comparar candidatas entre sí. */
function huellaFila(c: Candidata): string {
  return CAMPOS_COMPARABLES.map(campo => {
    const v = c[campo]
    if (v === null || v === undefined || v === '') return ''
    // Los importes llegan como number o como string según el driver: se comparan por valor,
    // no por texto, o "0" y "0.00" parecerían filas distintas.
    const n = Number(v)
    return Number.isFinite(n) && typeof v !== 'boolean' ? String(n) : String(v).trim().toUpperCase()
  }).join('\u0001')
}

/**
 * ¿Son todas la misma fila repetida?
 *
 * Si lo son, cualquiera sirve y se puede tocar una sin riesgo. Si alguna difiere en algo,
 * elegir al azar cambiaría la plata de un cliente y corresponde avisar.
 */
export function sonIndistinguibles(candidatas: Candidata[]): boolean {
  if (candidatas.length < 2) return true
  const primera = huellaFila(candidatas[0])
  return candidatas.every(c => huellaFila(c) === primera)
}

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

  // 1. POR VÍNCULO. Es un dato guardado, no una deducción: si está, no hay nada que
  //    decidir. Solo lo tienen las filas que cargó la app desde el 30/10/2026.
  if (mov.vinculo) {
    const { data, error } = await supabase
      .from('diario').select('id').eq('vinculo', mov.vinculo).eq('anulado', false)
    if (error) return { estado: 'error', error: error.message }
    const porVinculo = (data ?? []) as { id: string }[]
    if (porVinculo.length) return { estado: 'ok', id: porVinculo[0].id, porVinculo: true }
    // Sin resultado NO se corta: el sync pudo haber regenerado la fila desde la planilla
    // y ahí el vínculo se pierde. Se sigue con la búsqueda de siempre.
  }

  // 2. POR CONTENIDO, como antes del vínculo. Se traen los campos comparables para poder
  //    decidir después si las candidatas son la misma fila repetida.
  const { data, error } = await supabase
    .from('diario')
    .select(`id, evento, notas, ${CAMPOS_COMPARABLES.join(', ')}`)
    .eq('tipo', 'CTA CTE')
    .eq('anulado', false)
    .eq('cuenta_cte', mov.cliente ?? '')
    .eq('fecha', mov.fecha)
    .eq('operacion', (mov.operacion ?? '').toUpperCase())
    .eq('monto', Number(mov.monto))

  if (error) return { estado: 'error', error: error.message }
  // `unknown` en el medio porque la lista de columnas se arma desde CAMPOS_COMPARABLES y
  // el tipado de Supabase solo entiende un select escrito a mano. Repetir las columnas
  // acá para contentarlo sería peor: la lista quedaría en dos lugares y la próxima que se
  // agregue se olvidaría en uno de los dos, que es exactamente el error que esto arregla.
  const filas = (data ?? []) as unknown as Candidata[]
  if (filas.length === 0) return { estado: 'no_encontrada' }
  if (filas.length === 1) return { estado: 'ok', id: filas[0].id }

  // 3. Empate: dos o más filas con el mismo contenido. La referencia suele distinguirlas.
  const finalistas = desempatar(filas, mov.notas)
  if (finalistas.length === 1) return { estado: 'ok', id: finalistas[0].id }

  // 4. Sigue empatado. Si las filas son LA MISMA repetida, se toca una: son
  //    intercambiables y el saldo queda igual se elija la que se elija. Negarse acá es lo
  //    que dejó el saldo mal el 30/10/2026.
  const empatadas = finalistas.length > 1 ? finalistas : filas
  if (sonIndistinguibles(empatadas)) {
    // Se ordena por id para que la elección sea siempre la misma: dos corridas sobre los
    // mismos datos tienen que hacer lo mismo, si no un problema no se puede reproducir.
    const elegida = [...empatadas].sort((a, b) => a.id.localeCompare(b.id))[0]
    return { estado: 'ok', id: elegida.id, identicas: empatadas.length }
  }

  // 5. Difieren en algo y la referencia no alcanzó. Acá sí elegir mal cambia la plata de
  //    un cliente: se informa el empate ORIGINAL y no se toca nada.
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
  cc_libras: number
  evento: string | null
  notas: string | null
  /** Se arrastra al editar para que la fila no pierda el vínculo con su gemela. */
  vinculo?: string | null
}

/**
 * Los campos a escribir en `diario`, con el vínculo puesto solo si la base lo soporta.
 *
 * Mandar una columna que no existe no deja la fila a medias: falla el insert COMPLETO. Por
 * eso el campo se saca en lugar de mandarlo en null.
 */
async function conVinculo(
  supabase: SupabaseClient<any, any, any>,
  cambios: CambiosDiario,
  vinculo: string | null,
): Promise<Record<string, unknown>> {
  const { vinculo: _descartado, ...resto } = cambios
  if (!(await hayColumnaVinculo(supabase))) return resto
  return { ...resto, vinculo }
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
  // Nace con el vínculo del movimiento, así el borrado posterior no tiene que deducir nada.
  const { data, error } = await supabase.from('diario').insert({
    ...(await conVinculo(supabase, cambios, cambios.vinculo ?? original.vinculo ?? null)),
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

  const { error } = await supabase.from('diario')
    .update(await conVinculo(supabase, cambios, cambios.vinculo ?? null))
    .eq('id', encontrada.id)
  if (error) return { estado: 'error', error: error.message }
  return encontrada
}

/** Aviso para el operador cuando la fila de cuenta corriente no se pudo tocar. */
export function avisoDiario(r: ResultadoDiario, accion: 'borrar' | 'editar'): string | null {
  if (r.estado === 'no_aplica') return null
  if (r.estado === 'ok') {
    // Se hizo lo correcto, así que no es una advertencia. Pero que haya movimientos
    // repetidos en una cuenta es algo que conviene saber: casi siempre es una carga
    // duplicada sin querer, y nadie la mira si nadie la nombra.
    if (!r.identicas) return null
    const q = accion === 'borrar' ? 'se quitó uno' : 'se actualizó uno'
    return `Ojo: en la cuenta corriente había ${r.identicas} movimientos idénticos (misma fecha, misma operación y mismo importe). ${q}, que es lo que corresponde. Si los demás también están de más, borralos desde el listado.`
  }
  const que = accion === 'borrar' ? 'se borró' : 'se editó'
  if (r.estado === 'no_encontrada') {
    return `El movimiento ${que}, pero no se encontró su registro en la cuenta corriente. Verificá el saldo de la cuenta.`
  }
  if (r.estado === 'multiple') {
    return `El movimiento ${que}, pero en la cuenta corriente hay ${r.candidatas} registros idénticos y no se puede saber cuál corresponde: el saldo puede quedar mal. Avisale al administrador.`
  }
  return `El movimiento ${que}, pero falló la actualización de la cuenta corriente (${r.error}). El saldo puede quedar mal.`
}
