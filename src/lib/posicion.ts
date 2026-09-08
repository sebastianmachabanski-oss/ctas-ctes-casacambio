/**
 * Cálculo de la posición consolidada de cuentas corrientes.
 *
 * Vive acá, separado de la pantalla, por una razón concreta: son números que tienen que
 * cerrar entre sí y eso se puede verificar solo si el cálculo se puede llamar sin montar
 * un navegador. Lo valida `scripts/validar-posicion.mts`.
 *
 * CONVENCIÓN DE SIGNO (viene de la planilla, no se toca)
 *   saldo POSITIVO → el cliente debe          → "nos deben"
 *   saldo NEGATIVO → el cliente tiene a favor → "le debemos"
 */

export type Saldo = {
  cuenta_cte: string
  saldo_pesos: number | null
  saldo_dolares: number | null
  saldo_euros: number | null
  saldo_reales: number | null
  saldo_usdt: number | null
  ultimo_movimiento: string | null
}

export type ClaveMoneda = 'saldo_dolares' | 'saldo_pesos' | 'saldo_euros' | 'saldo_reales' | 'saldo_usdt'

export const MONEDAS: { key: ClaveMoneda; label: string; sym: string; color: string }[] = [
  { key: 'saldo_dolares', label: 'Dólares', sym: 'U$S',  color: '#16a34a' },
  { key: 'saldo_pesos',   label: 'Pesos',   sym: '$',    color: '#2563eb' },
  { key: 'saldo_euros',   label: 'Euros',   sym: '€',    color: '#7c3aed' },
  { key: 'saldo_reales',  label: 'Reales',  sym: 'R$',   color: '#eab308' },
  // USDT solo puede venir de la app: en la planilla no existe (25/8/2026).
  { key: 'saldo_usdt',    label: 'USDT',    sym: 'USDT', color: '#26a17b' },
]

export type Modo = 'todas' | 'favor' | 'contra'

export const MODOS: { key: Modo; label: string; ayuda: string }[] = [
  { key: 'todas',  label: 'Todas',      ayuda: 'Todas las cuentas con saldo, con su posición neta' },
  { key: 'favor',  label: 'Nos deben',  ayuda: 'Solo los saldos pendientes' },
  { key: 'contra', label: 'Le debemos', ayuda: 'Solo los saldos a favor del cliente' },
]

/** Signo que deja pasar cada vista: +1 solo positivos, −1 solo negativos, 0 todo. */
export const LADO: Record<Modo, 1 | -1 | 0> = { todas: 0, favor: 1, contra: -1 }

export const val = (s: Saldo, k: ClaveMoneda) => Number(s[k]) || 0

/**
 * Importe tal como lo muestra una vista: en "Nos deben" los negativos se ocultan y en
 * "Le debemos" los positivos. Es lo que hace que el subtotal de la tabla dé lo mismo que
 * la tarjeta de arriba, en vez de arrastrar la otra pata de las cuentas mixtas.
 */
export function visto(s: Saldo, k: ClaveMoneda, lado: 1 | -1 | 0): number {
  const v = val(s, k)
  return lado === 0 || Math.sign(v) === lado ? v : 0
}

/** La cuenta tiene saldo de los dos signos: figura en las dos vistas, partida al medio. */
export const esMixta = (s: Saldo) =>
  MONEDAS.some(m => val(s, m.key) > 0) && MONEDAS.some(m => val(s, m.key) < 0)

export type PosicionMoneda = {
  key: ClaveMoneda; label: string; sym: string; color: string
  favor: number; contra: number; neto: number
}

/**
 * La posición: por moneda, lo que nos deben, lo que debemos y el neto.
 *
 * Se calcula sobre TODAS las cuentas, sin filtros: si se moviera al escribir en el
 * buscador dejaría de ser la posición y pasaría a ser el subtotal de lo que uno está
 * mirando, que es otra cosa y se presta a leerla mal.
 *
 * Cada moneda va por su cuenta. No se suman dólares con pesos: eso exigiría una
 * cotización, y esa cotización la elegiría el programa — el número saldría de un supuesto
 * y no de los datos.
 */
export function posicionPorMoneda(saldos: Saldo[]): PosicionMoneda[] {
  return MONEDAS.map(m => {
    let favor = 0, contra = 0
    for (const s of saldos) {
      const v = val(s, m.key)
      if (v > 0) favor += v
      else contra += v
    }
    return { ...m, favor, contra, neto: favor + contra }
  }).filter(p => p.favor !== 0 || p.contra !== 0)
}

/**
 * Cuentas que entran en una vista: las que tienen algo DEL LADO que se está mirando.
 * Una cuenta mixta entra en las dos, cada vez con su mitad.
 */
export function filtrarPorLado(saldos: Saldo[], lado: 1 | -1 | 0, busca = ''): Saldo[] {
  const q = busca.trim().toUpperCase()
  return saldos.filter(s => {
    if (q && !(s.cuenta_cte || '').toUpperCase().includes(q)) return false
    return MONEDAS.some(m => {
      const v = val(s, m.key)
      return lado === 0 ? v !== 0 : Math.sign(v) === lado
    })
  })
}

/** Suma por moneda de lo que se ve en la tabla, con el lado ya aplicado. */
export function subtotales(filas: Saldo[], lado: 1 | -1 | 0): Record<ClaveMoneda, number> {
  const out = {} as Record<ClaveMoneda, number>
  for (const m of MONEDAS) out[m.key] = filas.reduce((a, s) => a + visto(s, m.key, lado), 0)
  return out
}

/**
 * Ordena por una columna. El criterio es el importe VISIBLE, no el saldo entero: si no,
 * en "Le debemos" una cuenta se ubicaría según un número que en esa vista está oculto.
 */
export function ordenarPor(
  filas: Saldo[], col: string, dir: 1 | -1, lado: 1 | -1 | 0,
): Saldo[] {
  return [...filas].sort((a, b) => {
    if (col === 'cuenta_cte') return dir * (a.cuenta_cte || '').localeCompare(b.cuenta_cte || '', 'es')
    if (col === 'ultimo_movimiento') return dir * (a.ultimo_movimiento ?? '').localeCompare(b.ultimo_movimiento ?? '')
    return dir * (visto(a, col as ClaveMoneda, lado) - visto(b, col as ClaveMoneda, lado))
      || (a.cuenta_cte || '').localeCompare(b.cuenta_cte || '', 'es')
  })
}
