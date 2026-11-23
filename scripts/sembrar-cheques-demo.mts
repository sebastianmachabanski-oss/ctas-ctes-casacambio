/**
 * Llena la cartera de cheques de una base DE DEMOSTRACIÓN.
 *
 *   npx tsx scripts/sembrar-cheques-demo.mts --vista-previa     ← muestra y no escribe
 *
 *   npm run base demo                                           ← apuntar a la de demo
 *   npx tsx scripts/sembrar-cheques-demo.mts --confirmo-que-es-una-base-de-demo
 *
 * Las credenciales salen del `.env.local`, que es el que `npm run base` deja apuntando a
 * la base elegida. Antes de escribir dice a qué proyecto va, para que se pueda frenar.
 *
 * ── PARA QUÉ ───────────────────────────────────────────────────────────────
 * La cartera de cheques vacía no se puede mostrar: todo el valor de la pantalla está en
 * ver vencimientos encima, un rechazo con su historia y un librador concentrado. Esto
 * arma esa situación.
 *
 * ── LAS CIFRAS SON CORRECTAS, NO DECORATIVAS ───────────────────────────────
 * Cada operación pasa por el MISMO motor de cálculo que el alta real, así que la columna
 * CHEQUES y la pata en PESOS quedan como las dejaría un operador. Y la suma de los
 * cheques de cada operación da EXACTAMENTE su columna CHEQUES: eso es lo que verifica
 * `cheques_descuadrados()`, y sembrar algo descuadrado sería sembrar el error que esa
 * función existe para encontrar.
 *
 * Las fechas se calculan contra HOY, así que la demo siempre tiene vencimientos encima
 * por más que pasen semanas desde la última siembra.
 *
 * ── LA GUARDA ──────────────────────────────────────────────────────────────
 * Este script ESCRIBE. Exige las tres cosas a la vez:
 *   1. La bandera `--confirmo-que-es-una-base-de-demo`, tipeada entera.
 *   2. Que las cuentas corrientes de la base sean las del elenco ficticio
 *      (`pareceBaseDeDemo`): una base real no tiene a "ACME CAMBIOS".
 *   3. Que la tabla `cheques` esté VACÍA. Si encuentra uno solo, aborta.
 * Ninguna alcanza por sí sola.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { calcularMovimiento } from '../src/lib/motor-calculo'
import { LIBRADORES, CUENTAS, pareceBaseDeDemo } from './elenco-demo'
import { sumarDias, type Estado } from '../src/lib/cheques'

/**
 * Credenciales del `.env.local`, que es el que `npm run base` deja apuntando a la base
 * elegida. Tipearlas en la línea de comandos las deja en el historial de la terminal y
 * además invita a pegar la URL equivocada; así basta con elegir la base de demo antes.
 * Lo que ya venga en el ambiente gana: si alguien exporta las variables a propósito, esa
 * decisión manda.
 */
function cargarEnvLocal(archivo = '.env.local') {
  let texto: string
  try { texto = readFileSync(resolve(process.cwd(), archivo), 'utf8') } catch { return }
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    const valor = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor
  }
}
cargarEnvLocal()

const URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, '')
const KEY = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const CONFIRMADO = process.argv.includes('--confirmo-que-es-una-base-de-demo')
const VISTA_PREVIA = process.argv.includes('--vista-previa')

function salir(msg: string): never { console.error(`\n❌ ${msg}\n`); process.exit(1) }

if (!VISTA_PREVIA && (!URL || !KEY)) salir(
  'No se encontraron las credenciales de Supabase.\n'
  + '   Se buscan en el `.env.local` del proyecto y después en el ambiente.\n'
  + '   Corré el script desde la raíz, con `npm run base demo` hecho antes.')
if (!VISTA_PREVIA && !CONFIRMADO) salir(
  'Falta la bandera --confirmo-que-es-una-base-de-demo\n'
  + '   Este script carga cheques FICTICIOS. Apuntado a la base de un cliente real,\n'
  + '   le mezcla datos falsos con los verdaderos. Escribila entera, a propósito.')

/** Hoy en Argentina. Las fechas de la demo se calculan contra esto. */
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

const n0 = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 0 })

// ── El guion de la demo ───────────────────────────────────────────────────
// Escrito a mano y no al azar: una cartera tiene que CONTAR algo —un rechazo con su
// historia, un librador concentrado, dos que se pasaron— y eso no sale de un generador.
// `d` son días contra hoy: negativo es pasado.

type ChequeDemo = {
  numero: string; importe: number; lib: number
  emision: number; pago: number
  tipo?: 'papel' | 'echeq'
  estado?: Estado
  /** Eventos POSTERIORES al alta. El `en_cartera` inicial lo pone el script. */
  curso?: { d: number; estado: Estado; notas?: string }[]
}
type OperacionDemo = { d: number; cliente: string; descuento: number; cheques: ChequeDemo[] }

const GUION: OperacionDemo[] = [
  {
    // La operación del rechazo: cinco cheques, uno rebotó y se gestionó.
    d: -20, cliente: 'P. ALVAREZ', descuento: 0.944,
    cheques: [
      { numero: '00884120', importe: 85_000, lib: 6, emision: -25, pago: -3, estado: 'rechazado',
        curso: [
          { d: -3, estado: 'depositado', notas: 'Banco Galicia · cuenta operativa' },
          { d: -1, estado: 'rechazado', notas: 'Sin fondos suficientes' },
        ] },
      { numero: '00041288', importe: 185_000, lib: 1, emision: -24, pago: -8 },
      { numero: '00117402', importe: 125_000, lib: 2, emision: -24, pago: -4, tipo: 'echeq' },
      { numero: '00298301', importe: 310_000, lib: 0, emision: -22, pago: 12 },
      { numero: '00298302', importe: 265_000, lib: 0, emision: -22, pago: 19 },
    ],
  },
  {
    // Los que vencen HOY.
    d: -14, cliente: 'ACME CAMBIOS', descuento: 0.951,
    cheques: [
      { numero: '00298311', importe: 240_000, lib: 0, emision: -18, pago: 0 },
      { numero: '00450127', importe: 95_000, lib: 4, emision: -18, pago: 0, tipo: 'echeq' },
      { numero: '00298312', importe: 85_000, lib: 0, emision: -18, pago: 0 },
      { numero: '00076540', importe: 310_000, lib: 3, emision: -16, pago: 3 },
    ],
  },
  {
    // Semana que viene, y el depositado esperando acreditación.
    d: -9, cliente: 'BOREAL SRL', descuento: 0.957,
    cheques: [
      { numero: '00298315', importe: 420_000, lib: 0, emision: -12, pago: 4, tipo: 'echeq' },
      { numero: '00512098', importe: 275_000, lib: 5, emision: -12, pago: 6, estado: 'depositado',
        curso: [{ d: -1, estado: 'depositado', notas: 'Banco Galicia · cuenta operativa' }] },
      { numero: '00117455', importe: 160_000, lib: 2, emision: -11, pago: 7 },
      { numero: '00041301', importe: 198_000, lib: 1, emision: -11, pago: 13, tipo: 'echeq' },
    ],
  },
  {
    // La concentración: Metalúrgica Paraná aparece en casi todas.
    d: -6, cliente: 'J. MARTINEZ', descuento: 0.948,
    cheques: [
      { numero: '00298320', importe: 480_000, lib: 0, emision: -9, pago: 21 },
      { numero: '00298321', importe: 395_000, lib: 0, emision: -9, pago: 28 },
      { numero: '00298322', importe: 520_000, lib: 0, emision: -8, pago: 35 },
      { numero: '00041310', importe: 240_000, lib: 1, emision: -8, pago: 24 },
    ],
  },
  {
    // Operación vieja ya cobrada: deja historia sin ensuciar la cartera.
    d: -40, cliente: 'CITRUS IMPORT', descuento: 0.939,
    cheques: [
      { numero: '00884090', importe: 150_000, lib: 6, emision: -45, pago: -18, estado: 'acreditado',
        curso: [
          { d: -19, estado: 'depositado' },
          { d: -16, estado: 'acreditado', notas: 'Acreditado sin novedad' },
        ] },
      { numero: '00512040', importe: 220_000, lib: 5, emision: -44, pago: -15, estado: 'acreditado',
        curso: [
          { d: -16, estado: 'depositado' },
          { d: -13, estado: 'acreditado' },
        ] },
    ],
  },
  {
    // Vencimientos lejanos, para que el calendario no se corte en dos semanas.
    d: -3, cliente: 'FARO LOGISTICA', descuento: 0.962,
    cheques: [
      { numero: '00450140', importe: 175_000, lib: 4, emision: -5, pago: 41, tipo: 'echeq' },
      { numero: '00076566', importe: 285_000, lib: 3, emision: -5, pago: 48 },
      { numero: '00117490', importe: 195_000, lib: 2, emision: -4, pago: 55 },
    ],
  },
]

// ── Armado ────────────────────────────────────────────────────────────────
type FilaCheque = Record<string, unknown> & { numero: string }

const movimientos: Record<string, unknown>[] = []
const porOperacion: { chequesDeLaOp: FilaCheque[]; eventos: { numero: string; fecha: string; estado: Estado; notas: string | null }[] }[] = []

for (const op of GUION) {
  const fechaOp = sumarDias(HOY, op.d)
  // El nominal es la SUMA de sus cheques, no un número elegido aparte: así la columna
  // CHEQUES del movimiento y la suma de la tabla coinciden por construcción.
  const nominal = op.cheques.reduce((a, c) => a + c.importe, 0)

  const impacto = calcularMovimiento({
    tipo: 'CAJA', operacion: 'COMPRA', propio: 'CHEQUES', externo: 'PESOS',
    monto: nominal, cotizacion: op.descuento, costoPorcentaje: null,
  })
  const columnas = Object.fromEntries(
    Object.entries(impacto.valores).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), v]))

  // La invariante que `cheques_descuadrados()` verifica en la base, comprobada acá antes
  // de escribir: si el motor dejara en la columna CHEQUES algo distinto de la suma de
  // los cheques, sembraríamos justo el error que esa función existe para encontrar.
  if (Math.abs(Number(columnas.cheques) - nominal) > 0.005) salir(
    `La operación del ${fechaOp} quedaría descuadrada: la columna CHEQUES daría `
    + `${n0(Number(columnas.cheques))} y sus cheques suman ${n0(nominal)}.`)

  movimientos.push({
    fila_sheet: null, origen: 'app', op: 'C',
    fecha: fechaOp, tipo: 'CAJA', cliente: op.cliente, operacion: 'COMPRA',
    propio: 'CHEQUES', externo: 'PESOS', monto: nominal,
    cot: op.descuento, cot_efectiva: op.descuento, costo_pct: null,
    debe: null, notas: `Descuento de ${op.cheques.length} cheques`, cuenta: impacto.cuenta,
    creado_por: 'Demo', creado_at: new Date(`${fechaOp}T12:00:00Z`).toISOString(),
    ...columnas,
  })

  const chequesDeLaOp: FilaCheque[] = []
  const eventos: { numero: string; fecha: string; estado: Estado; notas: string | null }[] = []
  for (const c of op.cheques) {
    const l = LIBRADORES[c.lib]
    chequesDeLaOp.push({
      numero: c.numero, importe: c.importe,
      fecha_emision: sumarDias(HOY, c.emision), fecha_pago: sumarDias(HOY, c.pago),
      estado: c.estado ?? 'en_cartera', tipo: c.tipo ?? 'papel',
      librador: l.nombre, cuit_librador: l.cuit, banco: l.banco, sucursal: l.sucursal,
      cuenta: `${l.sucursal}-${c.numero.slice(-6)}/4`,
      cmc7: c.tipo === 'echeq' ? null : `${c.numero} ${l.sucursal}00${c.numero.slice(-4)} 47`,
      id_echeq: c.tipo === 'echeq' ? `COELSA-${c.numero}` : null,
      archivo_url: null, origen_datos: 'manual', notas: null,
    })
    eventos.push({ numero: c.numero, fecha: fechaOp, estado: 'en_cartera', notas: 'Recibido al descontar' })
    for (const e of c.curso ?? [])
      eventos.push({ numero: c.numero, fecha: sumarDias(HOY, e.d), estado: e.estado, notas: e.notas ?? null })
  }
  porOperacion.push({ chequesDeLaOp, eventos })
}

// ── Resumen ───────────────────────────────────────────────────────────────
const todosLosCheques = porOperacion.flatMap(p => p.chequesDeLaOp)
const totalEventos = porOperacion.reduce((a, p) => a + p.eventos.length, 0)

console.log(`\n📋 ${GUION.length} operaciones · ${todosLosCheques.length} cheques · ${totalEventos} eventos`)
console.log(`   hoy es ${HOY}; las fechas se calculan contra ese día\n`)
for (let i = 0; i < GUION.length; i++) {
  const m = movimientos[i]
  console.log(`   ${m.fecha}  ${String(m.cliente).padEnd(16)} `
    + `${String(GUION[i].cheques.length).padStart(2)} cheques · `
    + `nominal ${n0(Number(m.monto)).padStart(10)} · entrega ${n0(Math.abs(Number(m.pesos))).padStart(10)}`)
}
const enCartera = todosLosCheques.filter(c => c.estado === 'en_cartera' || c.estado === 'depositado')
console.log(`\n   en cartera al terminar: ${enCartera.length} cheques por `
  + `$ ${n0(enCartera.reduce((a, c) => a + Number(c.importe), 0))}`)

if (VISTA_PREVIA) {
  console.log('\n👀 Vista previa: no se escribió nada ni se usó la red.\n')
  process.exit(0)
}

// ── Las guardas que necesitan la base ─────────────────────────────────────
// La referencia del proyecto no es secreta y es la última oportunidad de frenar si el
// `.env.local` quedó apuntando a otra base.
console.log(`\n🎯 proyecto ${URL!.replace(/^https?:\/\//, '').split('.')[0]}`)
const db = createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: cc, error: errorCuentas } = await db.from('cuentas_corrientes').select('nombre')
if (errorCuentas) salir(`leyendo cuentas_corrientes: ${errorCuentas.message}`)
const motivo = pareceBaseDeDemo(((cc ?? []) as { nombre: string }[]).map(c => c.nombre))
if (motivo) salir(`Esta base NO parece de demostración: ${motivo}\n`
  + `   El elenco ficticio es: ${CUENTAS.join(', ')}.`)

const { count, error: errorCount } = await db.from('cheques').select('id', { count: 'exact', head: true })
if (errorCount) salir(`leyendo cheques: ${errorCount.message}\n`
  + '   ¿Corriste migrations/2026-11-22_cheques.sql en esta base?')
if ((count ?? 0) > 0) salir(
  `La tabla cheques ya tiene ${count} fila(s). Este script solo siembra sobre una cartera vacía,\n`
  + '   para no duplicar. Vaciala a mano si querés volver a sembrar.')

// ── Escritura ─────────────────────────────────────────────────────────────
console.log('\n✍️  Escribiendo…')
let cheques = 0, eventos = 0

for (let i = 0; i < movimientos.length; i++) {
  const { data: mov, error: errorMov } = await (db as any)
    .from('movimientos_caja').insert(movimientos[i]).select('id').single()
  if (errorMov) salir(`insertando el movimiento ${i + 1}: ${errorMov.message}`)

  const filas = porOperacion[i].chequesDeLaOp.map(c => ({ ...c, movimiento_id: mov.id }))
  const { data: insertados, error: errorCheques } = await (db as any)
    .from('cheques').insert(filas).select('id,numero')
  if (errorCheques) salir(`insertando los cheques de la operación ${i + 1}: ${errorCheques.message}`)
  cheques += filas.length

  const idPorNumero = new Map<string, string>(
    ((insertados ?? []) as { id: string; numero: string }[]).map(r => [r.numero, r.id]))
  const filasEventos = porOperacion[i].eventos.map(e => ({
    cheque_id: idPorNumero.get(e.numero), fecha: e.fecha, estado: e.estado, notas: e.notas,
  }))
  const { error: errorEventos } = await (db as any).from('cheques_eventos').insert(filasEventos)
  if (errorEventos) salir(`insertando los eventos de la operación ${i + 1}: ${errorEventos.message}`)
  eventos += filasEventos.length
}

// La verificación que importa: que la suma de los cheques dé la columna CHEQUES.
const { data: descuadres, error: errorDesc } = await (db as any).rpc('cheques_descuadrados')
if (errorDesc) console.log(`\n⚠️  No se pudo correr cheques_descuadrados(): ${errorDesc.message}`)
else if ((descuadres ?? []).length) {
  console.log(`\n❌ Quedaron ${descuadres.length} movimiento(s) descuadrados:`)
  console.table(descuadres)
  process.exit(1)
} else console.log('✅ cheques_descuadrados() da cero filas: cada operación cierra contra sus cheques')

console.log(`\n✅ Listo: ${movimientos.length} operaciones, ${cheques} cheques y ${eventos} eventos.\n`)
