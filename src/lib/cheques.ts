/**
 * Cheques: estados, vencimientos y concentración.
 *
 * Vive en `lib` y no en el componente por la misma razón que `posicion.ts` y
 * `ganancias-tt.ts`: son cuentas que se tienen que poder correr sin montar un navegador.
 * Las valida `scripts/validar-cheques.mts`.
 *
 * El modelo de datos está en `migrations/2026-11-22_cheques.sql` y los flujos en
 * `docs/CHEQUES.md`.
 */

export const ESTADOS = [
  'en_cartera', 'depositado', 'acreditado', 'rechazado', 'endosado', 'devuelto',
] as const
export type Estado = typeof ESTADOS[number]

export const ESTADO_LABEL: Record<Estado, string> = {
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  acreditado: 'Acreditado',
  rechazado: 'Rechazado',
  endosado: 'Endosado',
  devuelto: 'Devuelto',
}

/**
 * LA MÁQUINA DE ESTADOS, en un solo lugar.
 *
 * La pantalla ofrece como botones exactamente lo que esta tabla permite, así que no
 * existe un botón que lleve a un estado inválido. Si mañana hay que admitir otro camino,
 * se agrega acá y la pantalla lo muestra sola.
 */
export const TRANSICIONES: Record<Estado, readonly Estado[]> = {
  en_cartera: ['depositado', 'endosado', 'devuelto'],
  // Un cheque depositado se acredita o rebota: no hay tercera opción.
  depositado: ['acreditado', 'rechazado'],
  // Rechazado se puede reintentar (el librador dice que ya hay fondos) o devolver.
  rechazado: ['depositado', 'devuelto'],
  acreditado: [],
  endosado: [],
  devuelto: [],
}

export const esTerminal = (e: Estado): boolean => TRANSICIONES[e].length === 0
export const puedeIr = (desde: Estado, hasta: Estado): boolean =>
  TRANSICIONES[desde].includes(hasta)

/**
 * Los estados que siguen siendo cartera: lo que todavía puede cobrarse o rebotar.
 * Lo acreditado, endosado y devuelto ya no se mira — por eso el índice de la base
 * también es parcial sobre estos dos.
 */
export const ACTIVOS: readonly Estado[] = ['en_cartera', 'depositado']
export const esActivo = (e: Estado): boolean => ACTIVOS.includes(e)

export type Cheque = {
  id: string
  numero: string
  importe: number
  /** YYYY-MM-DD. La fecha a partir de la cual se puede cobrar. */
  fecha_pago: string
  fecha_emision: string | null
  estado: Estado
  tipo: 'papel' | 'echeq'
  librador: string | null
  cuit_librador: string | null
  banco: string | null
  sucursal: string | null
  cuenta: string | null
  cmc7: string | null
  id_echeq: string | null
  archivo_url: string | null
  notas: string | null
  movimiento_id: string
}

export type Evento = {
  id: string
  cheque_id: string
  fecha: string
  estado: Estado
  movimiento_id: string | null
  notas: string | null
}

// ── Fechas ────────────────────────────────────────────────────────────────
// Todo son cadenas YYYY-MM-DD y se comparan como cadenas, que para ese formato es lo
// mismo que comparar fechas y no arrastra zonas horarias. Para sumar días sí hace falta
// convertir, y se hace al mediodía UTC para que ningún corrimiento de huso cambie el día.

const aFecha = (iso: string): Date => new Date(iso + 'T12:00:00Z')

export function sumarDias(iso: string, dias: number): string {
  const d = aFecha(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Días desde hoy hasta la fecha de pago. Negativo si ya pasó, 0 si vence hoy. */
export function diasHasta(fechaPago: string, hoy: string): number {
  return Math.round((aFecha(fechaPago).getTime() - aFecha(hoy).getTime()) / 86_400_000)
}

/** "hoy", "en 3 d", "hace 8 d" — el texto que va al lado de la fecha en el listado. */
export function textoVencimiento(fechaPago: string, hoy: string): string {
  const d = diasHasta(fechaPago, hoy)
  if (d === 0) return 'hoy'
  return d > 0 ? `en ${d} d` : `hace ${-d} d`
}

/**
 * Vencido y todavía en cartera: la plata está parada por olvido. Un cheque YA
 * DEPOSITADO cuya fecha pasó no es esto — está en el circuito bancario, esperando.
 */
export const vencidoSinDepositar = (c: Cheque, hoy: string): boolean =>
  c.estado === 'en_cartera' && c.fecha_pago < hoy

// ── Los cuatro números de arriba de la pantalla ───────────────────────────

export type Grupo = { cheques: number; importe: number }
export type Resumen = {
  vencenHoy: Grupo
  vencenSemana: Grupo
  vencidosSinDepositar: Grupo
  rechazados: Grupo
  enCartera: Grupo
}

const vacio = (): Grupo => ({ cheques: 0, importe: 0 })
const sumar = (g: Grupo, c: Cheque) => { g.cheques++; g.importe += c.importe }

/**
 * `vencenSemana` son los próximos SIETE DÍAS SIN CONTAR HOY: hoy ya tiene su propio
 * número y sumarlo en los dos lados haría que las dos tarjetas no se puedan sumar.
 */
export function resumenCartera(cheques: Cheque[], hoy: string): Resumen {
  const r: Resumen = {
    vencenHoy: vacio(), vencenSemana: vacio(), vencidosSinDepositar: vacio(),
    rechazados: vacio(), enCartera: vacio(),
  }
  const finSemana = sumarDias(hoy, 7)
  for (const c of cheques) {
    if (c.estado === 'rechazado') sumar(r.rechazados, c)
    if (!esActivo(c.estado)) continue
    sumar(r.enCartera, c)
    if (c.fecha_pago === hoy) sumar(r.vencenHoy, c)
    else if (c.fecha_pago > hoy && c.fecha_pago <= finSemana) sumar(r.vencenSemana, c)
    if (vencidoSinDepositar(c, hoy)) sumar(r.vencidosSinDepositar, c)
  }
  return r
}

// ── Concentración por librador ────────────────────────────────────────────

/** Por encima de esto, un solo librador es demasiado de la cartera. */
export const UMBRAL_CONCENTRACION = 0.20

export type Concentracion = {
  librador: string
  cuit: string | null
  cheques: number
  importe: number
  /** Fracción de la cartera activa, 0 a 1. */
  parte: number
  excede: boolean
}

/**
 * Agrupa la cartera ACTIVA por librador, de mayor a menor.
 *
 * Agrupa por CUIT cuando está, y por nombre normalizado cuando no: el nombre se tipea a
 * mano y "ACME SA" y "Acme S.A." son el mismo riesgo. Sin esto la concentración se
 * reparte entre variantes de escritura y nunca se enciende la alerta, que es justo lo
 * contrario de lo que se quiere.
 */
export function concentracionPorLibrador(cheques: Cheque[]): Concentracion[] {
  const activos = cheques.filter(c => esActivo(c.estado))
  const total = activos.reduce((a, c) => a + c.importe, 0)
  const porClave = new Map<string, Concentracion>()

  for (const c of activos) {
    const nombre = (c.librador ?? '').trim() || 'Sin librador'
    const cuit = (c.cuit_librador ?? '').trim() || null
    const clave = cuit ?? nombre.toUpperCase().replace(/[^A-Z0-9]/g, '')
    let g = porClave.get(clave)
    if (!g) {
      g = { librador: nombre, cuit, cheques: 0, importe: 0, parte: 0, excede: false }
      porClave.set(clave, g)
    }
    g.cheques++
    g.importe += c.importe
  }

  // `Array.from` y no un spread: el target de TypeScript del proyecto no itera Maps.
  const lista = Array.from(porClave.values())
  for (const g of lista) {
    g.parte = total > 0 ? g.importe / total : 0
    g.excede = g.parte > UMBRAL_CONCENTRACION
  }
  return lista.sort((a, b) => b.importe - a.importe)
}

// ── Formato ───────────────────────────────────────────────────────────────

const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const pesos = (v: number): string => `$ ${nf0.format(Math.round(v))}`
export const pesosExacto = (v: number): string => `$ ${nf2.format(v)}`
export const porcentaje = (v: number): string => `${nf2.format(v * 100)} %`
export const fechaCorta = (iso: string): string =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
export const fechaLarga = (iso: string): string =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('es-AR', { timeZone: 'UTC' })
