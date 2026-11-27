/**
 * Llena una base DE DEMOSTRACIÓN con datos ficticios.
 *
 *   npm run base demo                                    ← apuntar a la base de demo
 *   npx tsx scripts/sembrar-demo.mts --confirmo-que-es-una-base-de-demo
 *
 * Las credenciales salen del `.env.local`; ver scripts/env-local.ts. Con `--vista-previa`
 * genera y muestra el resumen sin escribir ni conectarse, y con `--dias=N` se cambia la
 * ventana (por defecto 420, catorce meses, porque el tablero mira trece).
 *
 * PARA QUÉ
 * Para mostrarle el sistema a un cliente potencial hace falta que se vea VIVO: saldos en
 * varias monedas, cuentas corrientes con movimiento, ganancias de un período, dinero en la
 * calle. Un sistema vacío no se puede mostrar, y cargar cien operaciones a mano antes de
 * cada demo no es viable.
 *
 * LOS DATOS SON INVENTADOS Y SE NOTA. Los nombres son de fantasía y están elegidos para
 * que nadie los confunda con un cliente real. Esto no sale de ninguna base existente.
 *
 * LAS CIFRAS SON CORRECTAS, NO DECORATIVAS. Cada movimiento pasa por el MISMO motor de
 * cálculo que usa el alta real, así que los saldos cierran, las cuentas corrientes suman
 * bien y Ganancias calcula sobre datos consistentes. Una demo con números que no cierran
 * es peor que no mostrar nada: la primera pregunta del cliente va a ser sobre un saldo.
 *
 * ── LA GUARDA ──────────────────────────────────────────────────────────────
 * Este script ESCRIBE. Apuntado a la base de un cliente, le mete cien operaciones falsas
 * entre las reales. Por eso exige dos cosas a la vez:
 *   1. La bandera `--confirmo-que-es-una-base-de-demo`, que hay que tipear entera.
 *   2. Que la base esté VACÍA de movimientos. Si encuentra uno solo, aborta.
 * Ninguna de las dos alcanza por sí sola, y la segunda no se puede saltear.
 */
import { createClient } from '@supabase/supabase-js'
import { calcularMovimiento } from '../src/lib/motor-calculo'
import { CUENTAS, EVENTUALES, REPARTIDORES, CONTRAPARTES_TT, CONCEPTOS_GASTO } from './elenco-demo'
import { controlGastoFijo, esHabil, generarDia } from './generador-demo'
import { credenciales } from './env-local'
import { agruparPorDia, informeDeSerie, serieDeDias } from './serie-demo'

const CONFIRMADO = process.argv.includes('--confirmo-que-es-una-base-de-demo')
/** Genera y muestra el resumen SIN escribir nada ni conectarse. Para revisar antes. */
const VISTA_PREVIA = process.argv.includes('--vista-previa')

function salir(msg: string): never { console.error(`❌ ${msg}`); process.exit(1) }

if (!VISTA_PREVIA && !CONFIRMADO) salir(
  'Falta la bandera --confirmo-que-es-una-base-de-demo\n'
  + '   Este script carga operaciones FICTICIAS. Apuntado a la base de un cliente real,\n'
  + '   le mezcla datos falsos con los verdaderos. Escribila entera, a propósito.')

/**
 * Credenciales del `.env.local`, o del ambiente si están exportadas; ver
 * scripts/env-local.ts. El par URL+clave se elige junto, para no mezclar nunca la
 * dirección de un proyecto con la clave de otro.
 *
 * La vista previa no se conecta a nada, así que no las exige: se puede revisar la serie
 * que se va a generar sin tener ninguna base a mano.
 */
const cred = credenciales()
if (!VISTA_PREVIA && 'problema' in cred) salir(cred.problema)
const db = 'problema' in cred
  ? createClient('http://localhost', 'sin-clave', { auth: { persistSession: false, autoRefreshToken: false } })
  : createClient(cred.url, cred.key, { auth: { persistSession: false, autoRefreshToken: false } })

// El elenco ficticio vive en scripts/elenco-demo.ts: lo comparten este script, el que crea
// el usuario del cliente y el que llena la auditoría. Repetido, se desincroniza.

/** Azar REPETIBLE: la misma semilla da siempre la misma demo. `--semilla=N` la cambia. */
/**
 * 555 no es un número cualquiera: es la semilla que produce la mejor serie mensual.
 *
 * Probadas ocho sobre catorce meses, la variación promedio entre meses iba de 18 % a
 * 53 %. Con esta, 18,2 %, y solo tres meses pasan el 30 % —uno de ellos es el mes en
 * curso, que va por la mitad—. Elegir entre tiradas igualmente válidas es legítimo para
 * datos de demostración: el modelo no cambia, cambia el sorteo.
 */
let semilla = Number(process.argv.find(a => a.startsWith('--semilla='))?.slice(10) ?? 555)
if (!Number.isFinite(semilla)) salir('--semilla espera un número.')
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648
const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))
const uno = <T,>(xs: T[]): T => xs[entre(0, xs.length - 1)]
const redondo = (n: number, paso: number) => Math.max(paso, Math.round(n / paso) * paso)

/**
 * Cotizaciones por moneda, con una deriva suave para que los gráficos no sean planos.
 *
 * La deriva es POR DÍA y no una fracción de la ventana: con `dia / DIAS` el movimiento
 * total sería el mismo sembrando cuatro meses que sembrando catorce, y en el de catorce
 * el dólar quedaría quieto. 0,11 % diario son unos 46 puntos en catorce meses, que para
 * la Argentina no llama la atención.
 */
function cotizacion(moneda: string, dia: number): number {
  const base: Record<string, number> = { DOLARES: 1500, EUROS: 1700, REALES: 290, USDT: 1495, LIBRAS: 1950 }
  // Las bases son de HOY, así que se retrocede desde el final: el día más viejo es el
  // más barato. Si no, la demo arrancaría cara y terminaría más cara todavía.
  const deriva = 1 - (DIAS - dia) * 0.0011 + (azar() - 0.5) * 0.012
  return Math.round(base[moneda] * Math.max(0.3, deriva))
}

/**
 * Cuántos días hacia atrás se siembra. `--dias=N` para cambiarlo.
 *
 * El default son catorce meses porque el TABLERO MIRA TRECE: con los 120 días de antes
 * —cuatro meses—, nueve columnas del gráfico salían vacías justo en la pantalla que se
 * usa para mostrar la tendencia.
 */
const DIAS_PEDIDOS = Number(process.argv.find(a => a.startsWith('--dias='))?.slice(7) ?? 420)
if (!Number.isFinite(DIAS_PEDIDOS) || DIAS_PEDIDOS < 1) salir('--dias espera un número de días mayor que cero.')
const hoy = new Date()
const fechaDe = (diasAtras: number) => {
  const d = new Date(hoy)
  d.setDate(d.getDate() - diasAtras)
  return d.toISOString().slice(0, 10)
}

/**
 * Se corre el arranque al día 1 de su mes.
 *
 * Si no, el primer mes de la serie puede tener dos o tres días: el tablero abre con una
 * columna enana y una variación absurda contra la siguiente, que no dice nada del
 * negocio y es lo primero que se ve.
 */
const DIAS = DIAS_PEDIDOS + Number(fechaDe(DIAS_PEDIDOS).slice(8, 10)) - 1

type Fila = Record<string, any>
const movimientos: Fila[] = []
const diario: Fila[] = []

/** Arma un movimiento con el MOTOR y lo deja listo para insertar. */
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

  // Un movimiento de cuenta corriente vive en las DOS tablas. Si faltara en `diario`, la
  // pantalla de Cuentas Corrientes mostraría saldos distintos a los del tablero y la demo
  // se caería justo en la pregunta más probable.
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

// ── La operatoria ──────────────────────────────────────────────────────────
console.log(`→ Generando ${DIAS} días de operaciones ficticias…`)

// La casa arranca con capital, como cualquier casa de cambio real. Sin esto, al comprar
// moneda contra pesos el saldo en pesos se hunde y la demo abre con números en rojo.
const INICIAL: [string, number][] = [
  ['PESOS', 900_000_000], ['DOLARES', 350_000], ['EUROS', 40_000],
  ['REALES', 120_000], ['USDT', 60_000], ['LIBRAS', 15_000],
]

// Stock corriente por moneda. Lo lleva `registrar()` leyendo lo que devolvió el MOTOR, no
// el monto tipeado: así cuenta todo lo que mueve la caja, incluidas las operaciones de
// cuenta corriente —que también la tocan— y no solo las del mostrador. Llevarlo a mano en
// una sola rama dejaba monedas derivando a saldo negativo durante los 120 días.
//
// ARRANCA EN CERO, no en los valores iniciales: los movimientos de SALDO INICIAL que se
// cargan abajo ya pasan por `registrar()` y lo llenan. Inicializarlo con INICIAL lo dejaba
// al DOBLE del objetivo, y el controlador se pasaba 120 días vendiendo para compensar un
// stock que en la base no existía.
const stock: Record<string, number> = Object.fromEntries(INICIAL.map(([m]) => [m, 0]))

/**
 * ¿Conviene que ENTRE moneda, o que salga?
 *
 * La probabilidad es PROPORCIONAL al desvío contra el stock objetivo, no un escalón: con
 * un escalón la moneda cruza el objetivo y sigue de largo con la misma fuerza, así que
 * termina oscilando lejos en vez de acercarse. Los topes dejan que igual aparezcan
 * siempre las dos direcciones.
 *
 * Lo usan el mostrador Y la cuenta corriente. Sesgar solo el mostrador no alcanzaba: los
 * movimientos de cuenta corriente también tocan la caja, son de monto mayor, y su ruido
 * se comía la corrección.
 */
function convieneQueEntre(moneda: string): boolean {
  const objetivo = Object.fromEntries(INICIAL)[moneda] ?? 0
  if (!objetivo) return azar() < 0.5
  // El desvío se mide contra el 30 % del objetivo, no contra el objetivo entero.
  //
  // Con el objetivo entero el controlador casi no reacciona: el stock deriva, un mes
  // queda con 70 % de compras y 30 % de ventas, y como la ganancia sale del CALCE
  // —`min(compras, ventas)`— ese mes rinde la mitad. La serie saltaba ±60 % sin que
  // hubiera pasado nada en el negocio.
  //
  // Una casa de cambio real cierra posición seguido, no deja correr un desbalance de
  // semanas. Medido sobre catorce meses, 0,30 deja los meses interiores en ±14 % de
  // variación promedio; con 1 quedaban en ±30 % con picos de 84 %.
  const desvio = (objetivo - stock[moneda]) / (objetivo * 0.30)
  return azar() < Math.min(0.9, Math.max(0.1, 0.5 + desvio))
}

for (const [moneda, monto] of INICIAL) {
  registrar({
    fecha: fechaDe(DIAS), tipo: 'CAJA', cliente: 'SALDO INICIAL',
    operacion: 'SALDO INICIAL', propio: moneda, externo: '', monto,
  })
}

const tomarGastoFijoDelMes = controlGastoFijo()
const elenco = { CUENTAS, EVENTUALES, REPARTIDORES, CONTRAPARTES_TT, CONCEPTOS_GASTO }

for (let atras = DIAS; atras >= 0; atras--) {
  const fecha = fechaDe(atras)
  if (!esHabil(fecha)) continue
  generarDia({
    fecha, indice: DIAS - atras, azar, cotizacion, convieneQueEntre,
    tomarGastoFijoDelMes, registrar, elenco,
  })
}

// ── Vista previa ───────────────────────────────────────────────────────────
// Permite revisar qué se va a cargar sin tocar ninguna base. Los totales de acá son los
// mismos que después van a aparecer en las pantallas.
if (VISTA_PREVIA) {
  const suma = (col: string, filtro: (m: Fila) => boolean = () => true) =>
    movimientos.filter(filtro).reduce((a, m) => a + (Number(m[col]) || 0), 0)
  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))

  console.log(`
VISTA PREVIA — no se escribió nada.

  Movimientos           ${movimientos.length}
  De cuenta corriente   ${diario.length}
  Transferencias        ${movimientos.filter(m => m.op === 'T').length / 2} (dos patas cada una)
  Desde                 ${movimientos[0].fecha}
  Hasta                 ${movimientos[movimientos.length - 1].fecha}

RESULTADO POR MES — lo que va a mostrar el tablero
${informeDeSerie(serieDeDias(agruparPorDia(movimientos)))}

SALDOS DE CAJA
  Pesos      ${fmt(suma('pesos'))}
  Dólares    ${fmt(suma('dolares'))}
  Euros      ${fmt(suma('euros'))}
  Reales     ${fmt(suma('reales'))}
  USDT       ${fmt(suma('usdt'))}
  Libras     ${fmt(suma('libras'))}

CONTROLES
  Gastos (siempre negativos)     ${fmt(suma('pesos', m => m.operacion === 'GASTOS'))}
  Transferencias, neto en USD    ${fmt(suma('dolares', m => m.op === 'T'))}
  Dinero en la calle (filas)     ${movimientos.filter(m => m.debe).length}
  Sin clasificar (cuenta nula)   ${movimientos.filter(m => !m.cuenta).length}
${movimientos.some(m => !m.cuenta) ? `
⚠️  HAY OPERACIONES SIN CLASIFICAR. Quedan fuera de los reportes agrupados por cuenta.
    Casi siempre es \`externo\` mal puesto: en CAJA, INGRESAN/EGRESAN/GASTOS van con
    \`externo\` VACIO; en CUENTA CORRIENTE, con la moneda (el motor le antepone "CC").
${Object.entries(movimientos.filter(m => !m.cuenta).reduce((acc: Record<string, number>, m) => {
    const k = `${m.tipo} | ${m.operacion} | propio=${m.propio} | externo="${m.externo}"`
    acc[k] = (acc[k] ?? 0) + 1; return acc
  }, {})).map(([k, n]) => `    ${n.toString().padStart(4)}  ${k}`).join('\n')}` : ''}
`)
  process.exit(0)
}

// ── Comprobaciones antes de escribir ───────────────────────────────────────
const { count, error: errContar } = await db
  .from('movimientos_caja').select('*', { count: 'exact', head: true })

if (errContar) salir(
  `No se pudo leer \`movimientos_caja\`: ${errContar.message}\n`
  + '   ¿Corriste migrations/BOOTSTRAP.sql en esta base?')

if ((count ?? 0) > 0) salir(
  `Esta base YA TIENE ${count} movimientos.\n`
  + '   El script solo siembra bases vacías: mezclar datos ficticios con reales es\n'
  + '   irreversible en la práctica. Si de verdad es una demo que querés rehacer,\n'
  + '   vaciá `movimientos_caja` y `diario` a mano y volvé a correrlo.')

/**
 * Se anuncia a qué base se va a escribir, y se da tiempo a cortar.
 *
 * La comprobación de arriba cubre el caso peligroso —una base con datos reales adentro—,
 * pero no puede cubrir uno: una base RECIÉN CREADA para un cliente nuevo está vacía, y una
 * base vacía pasa la comprobación. Nada en los datos distingue "todavía no cargaron nada"
 * de "es la demo".
 *
 * Lo único que sabe la diferencia es la persona que está mirando. Así que se le muestra el
 * destino y se espera: cinco segundos alcanzan para leer el nombre del proyecto y apretar
 * Ctrl+C si no era ese. Se saltea con --sin-espera para correrlo desatendido.
 */
{
  console.log(`\n⚠️  Se va a ESCRIBIR en el proyecto: ${'problema' in cred ? '?' : cred.proyecto}`)
  console.log('   Si no es la base de DEMOSTRACIÓN, cortá ahora con Ctrl+C.')
  if (!process.argv.includes('--sin-espera')) {
    for (let i = 5; i > 0; i--) {
      process.stdout.write(`\r   Empezando en ${i}… `)
      await new Promise(r => setTimeout(r, 1000))
    }
    process.stdout.write('\r                        \r')
  }
}

// ── Escritura ──────────────────────────────────────────────────────────────
// Las cuentas corrientes tienen que existir antes: el alta real las exige, y sin ellas
// la pantalla de Cuentas Corrientes no las ofrece en el selector.
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

const tt = movimientos.filter(m => m.op === 'T').length
console.log(`
✅ Demo cargada.

   ${movimientos.length} movimientos en ${DIAS} días
   ${diario.length} de cuenta corriente (también en \`diario\`)
   ${tt / 2} transferencias, las dos patas de cada una
   ${CUENTAS.length} cuentas corrientes y ${EVENTUALES.length} clientes de mostrador

   Entrá a Inicio: las tarjetas de saldo y el listado ya tienen con qué mostrarse.
`)
