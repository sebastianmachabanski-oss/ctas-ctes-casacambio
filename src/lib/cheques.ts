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
  // Acreditado dejó de ser terminal el 27/11/2026, cuando pasó a generar el movimiento de
  // plata. Antes un clic equivocado solo ponía mal un estado; ahora mete dinero en la
  // caja, y una operación que mueve plata sin forma de deshacerse se arregla tocando la
  // base. Volver a `depositado` borra el movimiento y deja el cheque donde estaba.
  acreditado: ['depositado'],
  endosado: [],
  devuelto: [],
}

/**
 * Las transiciones que MUEVEN PLATA, y por eso se confirman.
 *
 * Hasta el 27/11/2026 se confirmaba lo que no se podía deshacer, que era un buen criterio
 * cuando ninguna transición tocaba la caja. Ahora acreditar genera un movimiento: es
 * reversible, pero confirmarlo importa más que antes, no menos.
 */
export const MUEVE_PLATA: readonly Estado[] = ['acreditado']
export const muevePlata = (e: Estado): boolean => MUEVE_PLATA.includes(e)

/**
 * Con quién se liquida un cobro cuando el cheque no tiene banco cargado.
 *
 * Vive acá y no en `cheques-movimiento.ts` porque ESTE archivo es puro: no toca la base ni
 * importa nada de Node. El otro usa `node:crypto` y, en cuanto una pantalla de cliente lo
 * importaba aunque fuera por esta constante, el bundle del navegador se rompía
 * (`UnhandledSchemeError`). La frontera entre lo que corre en los dos lados y lo que corre
 * solo en el servidor pasa por acá.
 */
export const CLIENTE_SIN_BANCO = 'COBRO DE CHEQUES'

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

/**
 * Los estados en los que el cheque TODAVÍA ES UN RIESGO: la cartera más los rechazados.
 *
 * Un rechazado no es cartera —no se espera cobrarlo por el circuito normal— pero la plata
 * sigue afuera y el librador sigue debiendo. Para medir exposición hay que contarlo, y es
 * justamente el librador del que habría que desconfiar.
 *
 * Esto corrige un error del 27/11/2026: la pantalla le pasaba a `concentracionPorLibrador`
 * los activos Y los rechazados, pero la función descartaba los rechazados por dentro. La
 * intención del llamador era la correcta; la que estaba mal era la función.
 */
export const esRiesgo = (e: Estado): boolean => esActivo(e) || e === 'rechazado'

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
 * Agrupa por librador lo que todavía es riesgo —cartera más rechazados—, de mayor a menor.
 *
 * Agrupa por CUIT cuando está, y por nombre normalizado cuando no: el nombre se tipea a
 * mano y "ACME SA" y "Acme S.A." son el mismo riesgo. Sin esto la concentración se
 * reparte entre variantes de escritura y nunca se enciende la alerta, que es justo lo
 * contrario de lo que se quiere.
 */
export function concentracionPorLibrador(cheques: Cheque[]): Concentracion[] {
  const enRiesgo = cheques.filter(c => esRiesgo(c.estado))
  const total = enRiesgo.reduce((a, c) => a + c.importe, 0)
  const porClave = new Map<string, Concentracion>()

  for (const c of enRiesgo) {
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

// ── El alta: un cheque tal como lo carga el formulario ───────────────────

export type ChequeNuevo = {
  numero: string
  importe: number
  /** YYYY-MM-DD */
  fecha_pago: string
  fecha_emision: string | null
  librador: string
  cuit_librador: string | null
  banco: string | null
  sucursal: string | null
  cuenta: string | null
  tipo: 'papel' | 'echeq'
  /** Ruta dentro del bucket privado, no una URL. Ver `src/lib/cheques-archivo.ts`. */
  archivo_url: string | null
}

export const chequeNuevoVacio = (): ChequeNuevo => ({
  numero: '', importe: 0, fecha_pago: '', fecha_emision: null,
  librador: '', cuit_librador: null, banco: null, sucursal: null, cuenta: null,
  tipo: 'papel', archivo_url: null,
})

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * ¿La lista de cheques se puede guardar contra este nominal?
 *
 * Devuelve el motivo del rechazo o `null` si está bien. La usan el FORMULARIO —para
 * avisar mientras se carga— y el SERVIDOR —para no confiar en el navegador—, y es una
 * sola definición justamente para que no se puedan separar.
 *
 * La regla que no se puede aflojar es la última: la suma tiene que dar el nominal de la
 * operación. Es la misma que verifica `cheques_descuadrados()` en la base, y dejarla
 * pasar acá sería sembrar el descuadre que esa función existe para encontrar.
 */
export function validarChequesDelAlta(cheques: ChequeNuevo[], nominal: number): string | null {
  if (!cheques.length) return 'Cargá al menos un cheque'

  for (let i = 0; i < cheques.length; i++) {
    const c = cheques[i]
    const donde = `Cheque ${i + 1}`
    if (!c.numero.trim()) return `${donde}: falta el número`
    if (!(c.importe > 0)) return `${donde}: el importe tiene que ser mayor a cero`
    if (!ES_FECHA.test(c.fecha_pago)) return `${donde}: falta la fecha de pago`
    if (c.fecha_emision && !ES_FECHA.test(c.fecha_emision))
      return `${donde}: la fecha de emisión no es válida`
    if (c.fecha_emision && c.fecha_emision > c.fecha_pago)
      return `${donde}: la fecha de pago no puede ser anterior a la de emisión`
    if (c.tipo !== 'papel' && c.tipo !== 'echeq') return `${donde}: tipo desconocido`
  }

  // Dos veces el mismo número y banco DENTRO DE LA MISMA OPERACIÓN es, casi seguro, la
  // fila duplicada por error. Entre operaciones distintas sí puede pasar de verdad —el
  // mismo número se repite entre bancos, y un rechazado puede volver a entrar—, y por eso
  // la base no lo impide: ahí la pantalla avisa en vez de bloquear.
  const vistos = new Set<string>()
  for (const c of cheques) {
    const clave = `${(c.banco ?? '').trim().toUpperCase()}|${c.numero.trim().toUpperCase()}`
    if (vistos.has(clave))
      return `El cheque ${c.numero.trim()} está cargado dos veces en esta misma operación`
    vistos.add(clave)
  }

  const suma = cheques.reduce((a, c) => a + c.importe, 0)
  if (Math.abs(suma - nominal) > 0.005)
    return `Los cheques suman ${pesosExacto(suma)} y la operación dice ${pesosExacto(nominal)}`

  return null
}

/** El nominal de la operación: lo que suman los cheques, no un número que se tipea. */
export const sumaDeCheques = (cheques: ChequeNuevo[]): number =>
  cheques.reduce((a, c) => a + (Number(c.importe) || 0), 0)

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
