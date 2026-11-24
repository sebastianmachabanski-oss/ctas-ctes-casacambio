/**
 * Continúa una base de DEMOSTRACIÓN ya sembrada, desde su último día hasta hoy.
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/continuar-demo.mts --confirmo-que-es-una-base-de-demo
 *
 * Y para que además tenga historia hacia atrás —el tablero mira trece meses—:
 *
 *   npx tsx scripts/continuar-demo.mts --desde=2025-10-01 --confirmo-que-es-una-base-de-demo
 *
 * Con `--vista-previa` lee la base y muestra todo lo que haría, sin escribir una fila.
 *
 * PARA QUÉ
 * `sembrar-demo.mts` genera 120 días hacia atrás contando desde el día que se corre, y
 * solo acepta una base VACÍA. Entonces la demo envejece: sembrada el 20/10, al mes
 * siguiente lo último que se ve es octubre, y el cliente que mira la pantalla de Inicio
 * ve un sistema abandonado. Para arreglarlo había que vaciar y rehacer todo, perdiendo
 * los cheques y cualquier cosa cargada a mano.
 *
 * Este script hace lo otro: lee dónde quedó la base y agrega SOLO los días que faltan.
 *
 * CONTINÚA DE VERDAD, NO EMPIEZA DE NUEVO
 * Dos cosas se leen de la base antes de generar nada, y las dos importan:
 *
 *   El STOCK de cada moneda, sumando las columnas de `movimientos_caja`. El generador
 *   decide si conviene comprar o vender según cuánto se desvía el stock de su objetivo;
 *   arrancando de cero creería que no hay nada en caja y se pasaría los días comprando
 *   contra un stock que en la base sí existe.
 *
 *   La ÚLTIMA COTIZACIÓN de cada moneda, de su último COMPRA/VENTA. La deriva arranca de
 *   ahí, así que no hay un salto en el gráfico el día que empieza lo nuevo. Si se usara
 *   la fórmula del otro script —anclada al día en que se corrió— el salto dependería de
 *   cuánto tiempo pasó, que es justo lo que no se puede saber de antemano.
 *
 * ── LAS GUARDAS ────────────────────────────────────────────────────────────
 * Este script ESCRIBE, y a diferencia del otro escribe sobre una base QUE YA TIENE DATOS,
 * así que "está vacía" no sirve de red. Exige cuatro cosas:
 *   1. La bandera `--confirmo-que-es-una-base-de-demo`, tipeada entera.
 *   2. Que la base NO esté vacía. Si lo está, lo que corresponde es `sembrar-demo.mts`.
 *   3. Que NINGÚN movimiento venga de la planilla (`fila_sheet` cargado). Una base de
 *      cliente real se sincroniza desde el Sheet; la demo nunca. Esta es la guarda que
 *      de verdad separa una base de la otra.
 *   4. Que haya movimientos de la demo (`creado_por = 'Demo'`). Una base nueva de un
 *      cliente, con dos operaciones cargadas a mano, no tiene ninguno y no pasa.
 */
import { createClient } from '@supabase/supabase-js'
import { calcularMovimiento } from '../src/lib/motor-calculo'
import { CUENTAS, EVENTUALES, REPARTIDORES, CONTRAPARTES_TT, CONCEPTOS_GASTO } from './elenco-demo'
import { controlGastoFijo, esHabil, generarDia } from './generador-demo'
import { serieMensual } from '../src/lib/ganancias-series'
import { ttVacio } from '../src/lib/ganancias-tt'
import type { DiaAgg, ParAgg } from '../src/lib/ganancias-composicion'

const parVacio = (): ParAgg => ({ vC: 0, aC: 0, vV: 0, aV: 0, vCcc: 0, aCcc: 0, vVcc: 0, aVcc: 0 })
/** Cuántos meses hay entre dos fechas, ambas incluidas. */
const mesesEntre = (a: string, b: string): number => {
  const [a1, m1] = a.slice(0, 7).split('-').map(Number)
  const [a2, m2] = b.slice(0, 7).split('-').map(Number)
  return (a2 * 12 + m2) - (a1 * 12 + m1) + 1
}

/** Sin la barra del final: ver la nota en scripts/crear-primer-admin.mts. */
const BASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, '')
const KEY = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const CONFIRMADO = process.argv.includes('--confirmo-que-es-una-base-de-demo')
/** Lee la base y muestra qué se generaría, sin escribir una sola fila. */
const VISTA_PREVIA = process.argv.includes('--vista-previa')

function salir(msg: string): never { console.error(`❌ ${msg}`); process.exit(1) }

if (!BASE_URL || !KEY) salir(
  'Faltan SUPABASE_URL y SERVICE_ROLE_KEY en el entorno (Supabase → Project Settings → API).')
if (!CONFIRMADO && !VISTA_PREVIA) salir(
  'Falta la bandera --confirmo-que-es-una-base-de-demo\n'
  + '   Este script carga operaciones FICTICIAS sobre una base que YA TIENE datos.\n'
  + '   Escribila entera, a propósito.')

const db = createClient(BASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const MONEDAS = ['PESOS', 'DOLARES', 'EUROS', 'REALES', 'USDT', 'LIBRAS'] as const
type Moneda = typeof MONEDAS[number]
/** Columna de `movimientos_caja` donde el motor deja cada moneda. */
const COLUMNA: Record<Moneda, string> = {
  PESOS: 'pesos', DOLARES: 'dolares', EUROS: 'euros',
  REALES: 'reales', USDT: 'usdt', LIBRAS: 'libras',
}

// ── Lo que ya hay en la base ───────────────────────────────────────────────
console.log(`→ Leyendo el estado de ${new URL(BASE_URL).host}…`)

const { count, error: errContar } = await db
  .from('movimientos_caja').select('*', { count: 'exact', head: true })
if (errContar) salir(
  `No se pudo leer \`movimientos_caja\`: ${errContar.message}\n`
  + '   ¿Corriste migrations/BOOTSTRAP.sql en esta base?')
if ((count ?? 0) === 0) salir(
  'Esta base está VACÍA.\n'
  + '   Para una base vacía corré `scripts/sembrar-demo.mts`, que genera los 120 días\n'
  + '   iniciales. Este script solo continúa una demo que ya existe.')

// Guarda 3: ninguna fila puede venir de la planilla.
const { count: deSheet } = await db.from('movimientos_caja')
  .select('*', { count: 'exact', head: true }).not('fila_sheet', 'is', null)
if ((deSheet ?? 0) > 0) salir(
  `Esta base tiene ${deSheet} movimientos traídos de la PLANILLA.\n`
  + '   Eso es una base de cliente real, no la demo. No se escribe nada.')

// Guarda 4: tiene que haber datos de la demo.
const { count: deDemo } = await db.from('movimientos_caja')
  .select('*', { count: 'exact', head: true }).eq('creado_por', 'Demo')
if ((deDemo ?? 0) === 0) salir(
  'Esta base tiene movimientos, pero ninguno es de la demo (`creado_por = \'Demo\'`).\n'
  + '   Puede ser la base de un cliente recién empezada. No se escribe nada.')

/** Último día con movimientos: desde el siguiente arranca lo nuevo. */
const { data: ultimaFila } = await db.from('movimientos_caja')
  .select('fecha').order('fecha', { ascending: false }).limit(1).single()
const ultimaFecha = (ultimaFila as { fecha: string } | null)?.fecha
if (!ultimaFecha) salir('No se pudo determinar la fecha del último movimiento.')

/** Primer día con movimientos: hasta ahí llega el relleno hacia atrás. */
const { data: primeraFila } = await db.from('movimientos_caja')
  .select('fecha').order('fecha', { ascending: true }).limit(1).single()
const primeraFecha = (primeraFila as { fecha: string } | null)?.fecha
if (!primeraFecha) salir('No se pudo determinar la fecha del primer movimiento.')

/**
 * Stock actual por moneda, sumando TODA la tabla.
 *
 * Se pagina porque Postgrest corta en 1.000 filas y la demo tiene más: sin paginar el
 * stock saldría corto y el generador compraría de más para "llenar" una caja que ya
 * estaba llena.
 */
const stock: Record<string, number> = Object.fromEntries(MONEDAS.map(m => [m, 0]))
{
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: pg, error } = await db.from('movimientos_caja')
      .select(MONEDAS.map(m => COLUMNA[m]).join(','))
      .range(from, from + PAGE - 1)
    if (error) salir(`No se pudo leer el stock: ${error.message}`)
    const rows = (pg ?? []) as any[]
    for (const r of rows) for (const m of MONEDAS) stock[m] += Number(r[COLUMNA[m]]) || 0
    if (rows.length < PAGE) break
  }
}

/**
 * Última cotización conocida de cada moneda.
 *
 * Se toma de su último COMPRA o VENTA contra pesos, que es donde `cot` tiene sentido.
 * Si una moneda no tiene ninguno —puede pasar con LIBRAS, que aparece poco— cae al valor
 * de referencia, que solo se usa para arrancar la deriva.
 */
const REFERENCIA: Record<string, number> = {
  DOLARES: 1500, EUROS: 1700, REALES: 290, USDT: 1495, LIBRAS: 1950,
}
const DIVISAS = ['DOLARES', 'EUROS', 'REALES', 'USDT', 'LIBRAS']
const ultimaCot: Record<string, number> = {}
const primeraCot: Record<string, number> = {}
for (const m of DIVISAS) {
  for (const [destino, asc] of [[ultimaCot, false], [primeraCot, true]] as const) {
    const { data } = await db.from('movimientos_caja')
      .select('cot').eq('propio', m).in('operacion', ['COMPRA', 'VENTA'])
      .not('cot', 'is', null).order('fecha', { ascending: asc }).limit(1)
    const cot = Number(((data ?? []) as any[])[0]?.cot)
    destino[m] = cot > 0 ? cot : REFERENCIA[m]
  }
}

// ── Los días que faltan ────────────────────────────────────────────────────
const hoy = new Date().toISOString().slice(0, 10)
const diaSiguiente = (f: string) => {
  const d = new Date(`${f}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const diaAnterior = (f: string) => {
  const d = new Date(`${f}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const fechas: string[] = []
for (let f = diaSiguiente(ultimaFecha); f <= hoy; f = diaSiguiente(f)) {
  if (!esHabil(f)) continue   // la casa no abre los fines de semana
  fechas.push(f)
}

/**
 * `--desde AAAA-MM-DD`: además de poner la demo al día, la extiende HACIA ATRÁS.
 *
 * Hace falta porque el tablero mira trece meses y la siembra original genera cuatro: sin
 * esto, nueve columnas del gráfico salen vacías y la pantalla que se usa para mostrar la
 * tendencia no muestra ninguna.
 *
 * LOS SALDOS DE HOY NO CAMBIAN. Lo que se agrega atrás mueve el stock, así que al final
 * se reescriben los movimientos de SALDO INICIAL —que además pasan a la fecha nueva—
 * descontándoles exactamente lo que el relleno aportó. El resultado es que Inicio muestra
 * los mismos saldos antes y después.
 */
const argDesde = process.argv.find(a => a.startsWith('--desde='))?.slice(8)
if (argDesde && !/^\d{4}-\d{2}-\d{2}$/.test(argDesde)) salir('--desde espera AAAA-MM-DD.')
const desde = argDesde && argDesde < primeraFecha ? argDesde : null

const fechasAtras: string[] = []
if (desde) {
  for (let f = desde; f < primeraFecha; f = diaSiguiente(f)) {
    if (esHabil(f)) fechasAtras.push(f)
  }
}

if (fechas.length === 0 && fechasAtras.length === 0) {
  console.log(`\n✅ La demo ya está al día: del ${primeraFecha} al ${ultimaFecha}.`)
  if (argDesde) console.log(`   --desde=${argDesde} no agrega nada: ya hay datos desde el ${primeraFecha}.`)
  console.log('   No se escribió nada.\n')
  process.exit(0)
}

/**
 * Azar REPETIBLE, pero distinto del de `sembrar-demo.mts`.
 *
 * La semilla sale de la fecha desde la que se continúa, así que correr el script dos
 * veces para el mismo tramo genera lo mismo — y continuar desde otro día genera otra
 * cosa, en vez de repetir la misma racha de operaciones.
 */
const argSemilla = process.argv.find(a => a.startsWith('--semilla='))?.slice(10)
let semilla = argSemilla ? Number(argSemilla) : Number((fechas[0] ?? fechasAtras[0]).replace(/-/g, ''))
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648
const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))
const uno = <T,>(xs: T[]): T => xs[entre(0, xs.length - 1)]
const redondo = (n: number, paso: number) => Math.max(paso, Math.round(n / paso) * paso)

/** Deriva desde la última cotización real: 0,15 % por día hábil más un poco de ruido. */
const cotizacion = (moneda: string, dia: number): number =>
  Math.round(ultimaCot[moneda] * (1 + dia * 0.0015 + (azar() - 0.5) * 0.012))

/**
 * Para el relleno hacia atrás, la deriva va al revés: cuanto más viejo el día, más BAJA
 * la cotización. Arranca de la PRIMERA cotización conocida y retrocede, así el empalme
 * con lo que ya está en la base no tiene un escalón.
 */
const cotizacionAtras = (moneda: string, dia: number): number =>
  Math.round(primeraCot[moneda] * (1 - (fechasAtras.length - dia) * 0.0015 + (azar() - 0.5) * 0.012))

/**
 * Stock objetivo por moneda.
 *
 * Es el que tiene HOY la base, no una constante: el objetivo de la demo es que los
 * saldos se mantengan donde el cliente ya los vio, no llevarlos a otro lado. Los pesos
 * quedan afuera porque son la contrapartida de todo y su saldo se mueve solo.
 */
const OBJETIVO: Record<string, number> = Object.fromEntries(
  ['DOLARES', 'EUROS', 'REALES', 'USDT', 'LIBRAS'].map(m => [m, Math.max(1, stock[m])]),
)

/** Misma regla que `sembrar-demo.mts`: la probabilidad sigue al desvío, no es un escalón. */
function convieneQueEntre(moneda: string): boolean {
  const objetivo = OBJETIVO[moneda] ?? 0
  if (!objetivo) return azar() < 0.5
  const desvio = (objetivo - stock[moneda]) / objetivo
  return azar() < Math.min(0.85, Math.max(0.15, 0.5 + desvio))
}

type Fila = Record<string, any>
const movimientos: Fila[] = []
const diario: Fila[] = []

/** Arma un movimiento con el MOTOR y lo deja listo para insertar. Igual que el sembrador. */
function registrar(m: {
  fecha: string; tipo: 'CAJA' | 'CTA CTE'; cliente: string; operacion: string
  propio: string; externo: string; monto: number; cotizacion?: number | null
  op?: 'C' | 'T'; notas?: string | null; debe?: string | null
}) {
  const impacto = calcularMovimiento({
    tipo: m.tipo, operacion: m.operacion, propio: m.propio, externo: m.externo,
    monto: m.monto, cotizacion: m.cotizacion ?? null, costoPorcentaje: null,
  })
  const columnas = Object.fromEntries(
    Object.entries(impacto.valores).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), v]),
  )
  for (const [col, v] of Object.entries(impacto.valores)) {
    if (col in stock) stock[col] += Number(v) || 0
  }

  movimientos.push({
    fila_sheet: null, origen: 'app', op: m.op ?? 'C',
    fecha: m.fecha, tipo: m.tipo, cliente: m.cliente, operacion: m.operacion,
    propio: m.propio, externo: m.externo, monto: m.monto,
    cot: m.cotizacion ?? null, cot_efectiva: m.cotizacion ?? 1, costo_pct: null,
    debe: m.debe ?? null, notas: m.notas ?? null, cuenta: impacto.cuenta,
    creado_por: 'Demo', creado_at: new Date(`${m.fecha}T12:00:00Z`).toISOString(),
    ...columnas,
  })

  // Un movimiento de cuenta corriente vive en las DOS tablas (regla del dominio). Si
  // faltara en `diario`, Cuentas Corrientes mostraría saldos distintos a los del tablero.
  if (m.tipo === 'CTA CTE') {
    const cc = (k: string) => Number(impacto.valores[k] ?? 0)
    diario.push({
      fecha: m.fecha, tipo: 'CTA CTE', cuenta_cte: m.cliente, operacion: m.operacion,
      concepto: `${m.propio} → ${m.externo}`, detalle: m.op ?? 'C',
      moneda: m.propio, monto: m.monto, cotizacion: m.cotizacion ?? null,
      cc_pesos: cc('CC PESOS'), cc_dolares: cc('CC DOLARES'), cc_euros: cc('CC EUROS'),
      cc_reales: cc('CC REALES'), cc_usdt: cc('CC USDT'), cc_libras: cc('CC LIBRAS'),
      origen: 'app', evento: m.notas ?? null, notas: m.notas ?? null,
      creado_por: 'Demo', anulado: false,
    })
  }
}

// ── La operatoria, día por día ─────────────────────────────────────────────
// Mismas proporciones que `sembrar-demo.mts`: si fueran otras, el tramo nuevo se
// distinguiría del viejo en cualquier gráfico.
console.log(`→ Generando del ${fechas[0]} al ${fechas[fechas.length - 1]} (${fechas.length} días hábiles)…`)

const tomarGastoFijoDelMes = controlGastoFijo()
const elenco = { CUENTAS, EVENTUALES, REPARTIDORES, CONTRAPARTES_TT, CONCEPTOS_GASTO }

/**
 * Primero el relleno hacia atrás, con una moneda que entra y sale por igual.
 *
 * Acá NO se usa `convieneQueEntre`: ese controlador empuja el stock hacia el objetivo, y
 * para días del pasado eso no significa nada. Lo que se busca es que el tramo viejo no
 * desbalancee la caja; lo que igual se desbalancee se compensa después, exacto, en el
 * SALDO INICIAL.
 */
const desdeMovimiento = movimientos.length
fechasAtras.forEach((fecha, dia) => {
  generarDia({
    fecha, indice: dia, azar, cotizacion: cotizacionAtras,
    convieneQueEntre: () => azar() < 0.5,
    tomarGastoFijoDelMes, registrar, elenco,
  })
})
const movimientosAtras = movimientos.length - desdeMovimiento

/** Cuánto aportó el relleno a cada moneda: es lo que hay que descontar del saldo inicial. */
const netoAtras: Record<string, number> = Object.fromEntries(MONEDAS.map(m => [m, 0]))
for (const f of movimientos.slice(desdeMovimiento)) {
  for (const m of MONEDAS) netoAtras[m] += Number(f[COLUMNA[m]]) || 0
}

/**
 * El SALDO INICIAL se muda al principio nuevo y se le descuenta lo que aportó el relleno.
 *
 * Sin esto, agregar nueve meses de operaciones cambiaría todos los saldos que el cliente
 * ya vio en Inicio. Con esto, los saldos de hoy quedan EXACTAMENTE iguales: lo único que
 * cambia es que ahora hay historia atrás.
 */
const inicialesABorrar: string[] = []
if (desde) {
  const { data: viejos, error } = await db.from('movimientos_caja')
    .select('id,propio,monto').eq('operacion', 'SALDO INICIAL')
  if (error) salir(`No se pudieron leer los movimientos de SALDO INICIAL: ${error.message}`)
  const filas = (viejos ?? []) as { id: string; propio: string; monto: number }[]
  if (filas.length === 0) salir(
    'No hay movimientos de SALDO INICIAL en esta base.\n'
    + '   Sin ellos no se puede compensar el relleno y los saldos de hoy cambiarían.')

  for (const v of filas) {
    const ajustado = Number(v.monto) - (netoAtras[v.propio] ?? 0)
    if (ajustado <= 0) salir(
      `El relleno dejaría el saldo inicial de ${v.propio} en ${Math.round(ajustado)}.\n`
      + '   Es un tramo demasiado desbalanceado; probá con menos meses. No se escribió nada.')
    inicialesABorrar.push(v.id)
    registrar({
      fecha: desde, tipo: 'CAJA', cliente: 'SALDO INICIAL',
      operacion: 'SALDO INICIAL', propio: v.propio, externo: '', monto: ajustado,
    })
  }
  // El saldo inicial viejo sigue sumado en `stock`, y el nuevo se acaba de sumar también.
  // Para que el resumen muestre el saldo REAL de después, se descuenta el viejo.
  for (const v of filas) stock[v.propio] -= Number(v.monto)
}

// Y después los días que faltan hasta hoy.
fechas.forEach((fecha, dia) => {
  generarDia({
    fecha, indice: dia, azar, cotizacion, convieneQueEntre,
    tomarGastoFijoDelMes, registrar, elenco,
  })
})

// ── Resumen ────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))
const sinClasificar = movimientos.filter(m => !m.cuenta).length

/**
 * El resultado mes a mes, calculado con el MISMO motor que la pantalla.
 *
 * Es el control que de verdad importa antes de escribir: un generador puede producir
 * saldos correctos y, aun así, una serie que ningún negocio tendría —meses que varían
 * 500 %—, y eso se ve recién en el tablero, con los datos ya cargados. Acá se ve antes.
 *
 * Si la serie no convence, se vuelve a correr con `--semilla=` otro número.
 */
const porMesDia = new Map<string, DiaAgg>()
const diaSerie = (f: string): DiaAgg => {
  let d = porMesDia.get(f)
  if (!d) {
    d = {
      f, usd: parVacio(), eur: parVacio(), brl: parVacio(),
      usdt: parVacio(), gbp: parVacio(), chq: parVacio(), g: 0, gcc: 0, tt: ttVacio(),
    }
    porMesDia.set(f, d)
  }
  return d
}
const PAR_DE: Record<string, 'usd' | 'eur' | 'brl' | 'usdt' | 'gbp'> = {
  dolares: 'usd', euros: 'eur', reales: 'brl', usdt: 'usdt', libras: 'gbp',
}
for (const m of movimientos) {
  const d = diaSerie(m.fecha)
  if (m.operacion === 'GASTOS') { d.g += Number(m.pesos) || 0; continue }
  if (m.op === 'T') { d.tt.usd += Number(m.dolares) || 0; continue }
  for (const [col, par] of Object.entries(PAR_DE)) {
    const vol = Number(m[col]) || 0, ars = Number(m.pesos) || 0
    const volcc = Number(m[`cc_${col}`]) || 0, arscc = Number(m.cc_pesos) || 0
    const agg = d[par]
    if (m.operacion === 'COMPRA' && vol > 0 && ars < 0) { agg.vC += vol; agg.aC += -ars }
    if (m.operacion === 'VENTA' && vol < 0 && ars > 0) { agg.vV += -vol; agg.aV += ars }
    if (volcc > 0 && arscc < 0) { agg.vCcc += volcc; agg.aCcc += -arscc }
    if (volcc < 0 && arscc > 0) { agg.vVcc += -volcc; agg.aVcc += arscc }
  }
}
const diasSerie = Array.from(porMesDia.values()).sort((a, b) => a.f.localeCompare(b.f))
const serie = diasSerie.length
  ? serieMensual(diasSerie, diasSerie[diasSerie.length - 1].f,
      { cc: true, gastos: true, transferencias: true },
      // Tantos meses como abarque lo generado.
      mesesEntre(diasSerie[0].f, diasSerie[diasSerie.length - 1].f))
  : []

/** Gastos por mes, que son los que antes hacían saltar el resultado. */
const porMes = new Map<string, number>()
for (const m of movimientos) {
  if (m.operacion !== 'GASTOS') continue
  const k = (m.fecha as string).slice(0, 7)
  porMes.set(k, (porMes.get(k) ?? 0) + (Number(m.pesos) || 0))
}

console.log(`
  La base va del          ${primeraFecha} al ${ultimaFecha}
${desde ? `  Se rellena hacia atrás  ${desde} → ${primeraFecha} (${fechasAtras.length} días hábiles, ${movimientosAtras} movimientos)\n` : ''}\
${fechas.length ? `  Se agrega adelante      ${fechas[0]} → ${fechas[fechas.length - 1]} (${fechas.length} días hábiles)` : '  Adelante                nada pendiente'}
  Movimientos en total    ${movimientos.length}
  De cuenta corriente     ${diario.length}
  Transferencias          ${movimientos.filter(m => m.op === 'T').length / 2} (dos patas cada una)
${desde ? `  SALDO INICIAL          se muda al ${desde} y se ajusta para que los saldos de hoy NO cambien\n` : ''}\
RESULTADO POR MES — lo que va a mostrar el tablero
${serie.map((m, i) => {
  const prev = i > 0 ? serie[i - 1].neto : null
  const v = prev && prev > 0 ? ((m.neto - prev) / prev * 100) : null
  return `  ${m.mes}  ${fmt(m.neto).padStart(13)}   ${v === null ? '' : (v >= 0 ? '+' : '') + v.toFixed(1) + ' %'}`
}).join('\n')}
  Si la serie no convence —un negocio real no salta de un mes a otro—, volvé a correrlo
  con --semilla=<otro numero>. Lo generado es repetible: la misma semilla da lo mismo.

GASTOS POR MES (tienen que parecerse entre sí)
${Array.from(porMes.entries()).sort().map(([k, v]) => `  ${k}  ${fmt(v)}`).join('\n')}

SALDOS DE CAJA, DESPUÉS
${MONEDAS.map(m => `  ${m.padEnd(10)} ${fmt(stock[m])}`).join('\n')}

CONTROLES
  Gastos (siempre negativos)     ${fmt(movimientos.filter(m => m.operacion === 'GASTOS').reduce((a, m) => a + (Number(m.pesos) || 0), 0))}
  Sin clasificar (cuenta nula)   ${sinClasificar}`)

if (sinClasificar > 0) salir(
  '\nHAY OPERACIONES SIN CLASIFICAR y quedarían fuera de los reportes por cuenta.\n'
  + '   Casi siempre es `externo` mal puesto. No se escribe nada.')

if (VISTA_PREVIA) {
  console.log('\nVISTA PREVIA — no se escribió nada.\n')
  process.exit(0)
}

// ── Escritura ──────────────────────────────────────────────────────────────
{
  console.log(`\n⚠️  Se va a ESCRIBIR en: ${new URL(BASE_URL).host}`)
  console.log('   Si no es la base de DEMOSTRACIÓN, cortá ahora con Ctrl+C.')
  if (!process.argv.includes('--sin-espera')) {
    for (let i = 5; i > 0; i--) {
      process.stdout.write(`\r   Empezando en ${i}… `)
      await new Promise(r => setTimeout(r, 1000))
    }
    process.stdout.write('\r                        \r')
  }
}

// Por si el elenco creció desde la siembra original.
await db.from('cuentas_corrientes').upsert(
  CUENTAS.map(nombre => ({ nombre, activo: true })), { onConflict: 'nombre' })
await db.from('clientes').upsert(
  [...EVENTUALES, ...CUENTAS].map(nombre => ({ nombre, activo: true })), { onConflict: 'nombre' })

async function insertar(tabla: string, filas: Fila[]) {
  const LOTE = 500
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await db.from(tabla).insert(filas.slice(i, i + LOTE))
    if (error) salir(`Error insertando en ${tabla}: ${error.message}`)
    process.stdout.write(`\r   ${tabla}: ${Math.min(i + LOTE, filas.length)}/${filas.length}`)
  }
  process.stdout.write('\n')
}

await insertar('movimientos_caja', movimientos)
await insertar('diario', diario)

// Los SALDO INICIAL viejos se borran DESPUÉS de insertar los nuevos: si algo fallara en
// el medio, la base queda con saldo inicial de más y no de menos. De más se nota en el
// acto —los saldos se duplican—; de menos pasa desapercibido.
if (inicialesABorrar.length > 0) {
  const { error } = await db.from('movimientos_caja').delete().in('id', inicialesABorrar)
  if (error) salir(
    `Se insertó todo pero NO se pudieron borrar los SALDO INICIAL viejos: ${error.message}\n`
    + `   Los saldos van a estar duplicados. Borrá a mano estas filas: ${inicialesABorrar.join(', ')}`)
  console.log(`   SALDO INICIAL: ${inicialesABorrar.length} filas viejas borradas`)
}

console.log(`
✅ Demo al día.

   ${movimientos.length} movimientos nuevos, hasta el ${fechas[fechas.length - 1]}
   ${diario.length} de cuenta corriente (también en \`diario\`)

   Se puede volver a correr cuando la demo vuelva a quedar vieja: agrega solo lo que falte.
`)
