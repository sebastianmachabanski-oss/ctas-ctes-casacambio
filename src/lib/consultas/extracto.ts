import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Datos del extracto de una cuenta corriente.
 *
 * Vive acá porque los usan DOS caminos: la vista imprimible en pantalla y el PDF que se
 * descarga. Si cada uno hiciera su consulta, con el tiempo terminarían diciendo cosas
 * distintas — es el mismo problema que `diario` y `movimientos_caja` (1/9/2026), y en un
 * documento que se le manda al cliente sería peor.
 */

// La pantalla pagina de a 200; el extracto NO: sale el período entero. Un tope alto por
// las dudas —la cuenta más grande tiene ~7.700 movimientos— y si se pasa, se avisa en el
// documento en vez de recortar en silencio.
export const TOPE = 20000

export const MONEDAS = [
  { acum: 'acum_dolares', cc: 'cc_dolares', saldo: 'saldo_dolares', label: 'Dólares', sym: 'U$S' },
  { acum: 'acum_pesos',   cc: 'cc_pesos',   saldo: 'saldo_pesos',   label: 'Pesos',   sym: '$'   },
  { acum: 'acum_euros',   cc: 'cc_euros',   saldo: 'saldo_euros',   label: 'Euros',   sym: '€'   },
  { acum: 'acum_reales',  cc: 'cc_reales',  saldo: 'saldo_reales',  label: 'Reales',  sym: 'R$'  },
  { acum: 'acum_usdt',    cc: 'cc_usdt',    saldo: 'saldo_usdt',    label: 'USDT',    sym: 'USDT' },
] as const

export type Moneda = typeof MONEDAS[number]

export type DatosExtracto = {
  cuenta: string
  movimientos: any[]
  saldos: Record<string, any>
  /** Solo las monedas que la cuenta realmente mueve. */
  monedas: readonly Moneda[]
  totales: Record<string, number>
  periodo: string
  filtroOp: string
  /** Con un filtro de dirección la columna de acumulado mentiría: no se muestra. */
  conAcumulado: boolean
  total: number
  recortado: boolean
}

const fechaAr = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR')

/** Misma regla que la pantalla: el sync deja la referencia en `evento` y el alta de la
 *  app la escribía solo en `notas`. Se miran las dos. */
export const ref = (m: any) => (m.evento ?? '').trim() || (m.notas ?? '').trim() || null

export function esIngreso(op: string): boolean {
  const o = (op || '').toUpperCase()
  return o.includes('INGRES') || o === 'DONACION'
}

export async function traerExtracto(
  supabase: SupabaseClient<any, any, any>,
  { cuenta, desde = '', hasta = '', operacion = '' }:
    { cuenta: string; desde?: string; hasta?: string; operacion?: string },
): Promise<DatosExtracto> {
  const { data } = await (supabase as any).rpc('cta_cte_movimientos', {
    p_cuenta: cuenta,
    p_desde: desde || null,
    p_hasta: hasta || null,
    p_operacion: operacion || null,
    p_limit: TOPE,
    p_offset: 0,
  })
  const movimientos = (data ?? []) as any[]
  const total = Number(movimientos[0]?.total_filas ?? 0)

  const { data: saldosData } = await supabase
    .from('saldos_cuenta_corriente').select('*').eq('cuenta_cte', cuenta).maybeSingle()
  const saldos = (saldosData ?? {}) as any

  // Solo se imprimen las monedas que la cuenta realmente mueve: sin esto el extracto de
  // una cuenta que opera en dólares arrastra cuatro columnas de ceros.
  const activas = MONEDAS.filter(m =>
    Number(saldos[m.saldo] ?? 0) !== 0 || movimientos.some(x => Number(x[m.cc] ?? 0) !== 0)
  )
  const monedas = activas.length ? activas : [MONEDAS[0], MONEDAS[1]]

  // Totales del período (lo listado), distinto del saldo de la cuenta, que es histórico.
  const totales = Object.fromEntries(
    monedas.map(m => [m.cc, movimientos.reduce((a, x) => a + (Number(x[m.cc]) || 0), 0)])
  ) as Record<string, number>

  const periodo = desde && hasta ? `${fechaAr(desde)} al ${fechaAr(hasta)}`
    : desde ? `desde el ${fechaAr(desde)}`
    : hasta ? `hasta el ${fechaAr(hasta)}`
    : 'todos los movimientos'

  const filtroOp = operacion === 'INGRESO' ? 'solo ingresos'
    : operacion === 'EGRESO' ? 'solo egresos' : ''

  return {
    cuenta, movimientos, saldos, monedas, totales, periodo, filtroOp,
    conAcumulado: !operacion,
    total,
    recortado: total > TOPE,
  }
}

/**
 * Nombre del archivo. Lleva la cuenta y el período adentro a propósito: es lo único que
 * viaja junto al PDF cuando se comparte por WhatsApp, así que tiene que decir de qué es
 * sin abrirlo.
 */
export function nombreArchivo(d: Pick<DatosExtracto, 'cuenta' | 'periodo'>): string {
  const limpio = (s: string) => s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // sin tildes: viaja por chat
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
  return `Cuenta corriente - ${limpio(d.cuenta)} - ${limpio(d.periodo)}.pdf`
}
