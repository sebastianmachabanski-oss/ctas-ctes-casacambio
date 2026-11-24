/**
 * Continúa una base de DEMOSTRACIÓN ya sembrada, desde su último día hasta hoy.
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/continuar-demo.mts --confirmo-que-es-una-base-de-demo
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
const ultimaCot: Record<string, number> = {}
for (const m of ['DOLARES', 'EUROS', 'REALES', 'USDT', 'LIBRAS']) {
  const { data } = await db.from('movimientos_caja')
    .select('cot').eq('propio', m).in('operacion', ['COMPRA', 'VENTA'])
    .not('cot', 'is', null).order('fecha', { ascending: false }).limit(1)
  const cot = Number(((data ?? []) as any[])[0]?.cot)
  ultimaCot[m] = cot > 0 ? cot : REFERENCIA[m]
}

// ── Los días que faltan ────────────────────────────────────────────────────
const hoy = new Date().toISOString().slice(0, 10)
const diaSiguiente = (f: string) => {
  const d = new Date(`${f}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const fechas: string[] = []
for (let f = diaSiguiente(ultimaFecha); f <= hoy; f = diaSiguiente(f)) {
  const dow = new Date(`${f}T12:00:00Z`).getUTCDay()
  if (dow === 0 || dow === 6) continue   // la casa no abre los fines de semana
  fechas.push(f)
}

if (fechas.length === 0) {
  console.log(`\n✅ La demo ya está al día: el último movimiento es del ${ultimaFecha}.`)
  console.log('   No hay días hábiles pendientes. No se escribió nada.\n')
  process.exit(0)
}

/**
 * Azar REPETIBLE, pero distinto del de `sembrar-demo.mts`.
 *
 * La semilla sale de la fecha desde la que se continúa, así que correr el script dos
 * veces para el mismo tramo genera lo mismo — y continuar desde otro día genera otra
 * cosa, en vez de repetir la misma racha de operaciones.
 */
let semilla = Number(fechas[0].replace(/-/g, ''))
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648
const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))
const uno = <T,>(xs: T[]): T => xs[entre(0, xs.length - 1)]
const redondo = (n: number, paso: number) => Math.max(paso, Math.round(n / paso) * paso)

/** Deriva desde la última cotización real: 0,15 % por día hábil más un poco de ruido. */
const cotizacion = (moneda: string, dia: number): number =>
  Math.round(ultimaCot[moneda] * (1 + dia * 0.0015 + (azar() - 0.5) * 0.012))

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

fechas.forEach((fecha, dia) => {
  // Mostrador
  for (let i = 0; i < entre(4, 9); i++) {
    const moneda = azar() < 0.72 ? 'DOLARES' : uno(['EUROS', 'REALES', 'USDT', 'LIBRAS'])
    const compra = convieneQueEntre(moneda)
    const cot = cotizacion(moneda, dia)
    // La casa compra más barato de lo que vende: de ahí sale la ganancia del período.
    const spread = compra ? -entre(8, 18) : entre(8, 18)
    registrar({
      fecha, tipo: 'CAJA', cliente: uno(EVENTUALES),
      operacion: compra ? 'COMPRA' : 'VENTA',
      propio: moneda, externo: 'PESOS',
      monto: redondo(entre(200, 12_000), 50),
      cotizacion: cot + spread,
      debe: !compra && azar() < 0.12 ? uno(REPARTIDORES) : null,
    })
  }

  // Cuentas corrientes
  for (let i = 0; i < entre(1, 4); i++) {
    const moneda = azar() < 0.8 ? 'DOLARES' : uno(['PESOS', 'EUROS'])
    registrar({
      fecha, tipo: 'CTA CTE', cliente: uno(CUENTAS),
      operacion: convieneQueEntre(moneda) ? 'INGRESAN' : 'EGRESAN',
      // En CUENTA CORRIENTE `externo` lleva la moneda: el motor le antepone "CC".
      propio: moneda, externo: moneda,
      monto: redondo(entre(500, 9_000), 100),
      notas: azar() < 0.5 ? 'ENTREGA' : 'RETIRO',
    })
  }

  // Transferencias: SIEMPRE las dos patas juntas.
  if (azar() < 0.35) {
    const ref = uno(CONTRAPARTES_TT)
    const entra = redondo(entre(3_000, 40_000), 100)
    const sale = entra - redondo(entra * (entre(4, 12) / 1000), 10)   // margen de 0,4% a 1,2%
    const [a, b] = ref.split(' - ')
    registrar({ fecha, tipo: 'CAJA', cliente: `${a} X TT`, operacion: 'INGRESAN', propio: 'DOLARES', externo: '', monto: entra, op: 'T', notas: ref })
    registrar({ fecha, tipo: 'CAJA', cliente: `${b} X TT`, operacion: 'EGRESAN', propio: 'DOLARES', externo: '', monto: sale, op: 'T', notas: ref })
  }

  // Gastos: solo en pesos (regla del dominio).
  if (azar() < 0.1) {
    registrar({
      fecha, tipo: 'CAJA', cliente: uno(CONCEPTOS_GASTO), operacion: 'GASTOS',
      propio: 'PESOS', externo: '', monto: redondo(entre(150_000, 3_500_000), 10_000),
    })
  }
})

// ── Resumen ────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))
const sinClasificar = movimientos.filter(m => !m.cuenta).length

console.log(`
  Último día en la base   ${ultimaFecha}
  Se agrega del           ${fechas[0]} al ${fechas[fechas.length - 1]}
  Movimientos             ${movimientos.length}
  De cuenta corriente     ${diario.length}
  Transferencias          ${movimientos.filter(m => m.op === 'T').length / 2} (dos patas cada una)

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

console.log(`
✅ Demo al día.

   ${movimientos.length} movimientos nuevos, hasta el ${fechas[fechas.length - 1]}
   ${diario.length} de cuenta corriente (también en \`diario\`)

   Se puede volver a correr cuando la demo vuelva a quedar vieja: agrega solo lo que falte.
`)
