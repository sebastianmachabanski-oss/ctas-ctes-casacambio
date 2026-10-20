/**
 * Llena una base DE DEMOSTRACIÓN con datos ficticios.
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/sembrar-demo.mts --confirmo-que-es-una-base-de-demo
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

/** Sin la barra del final: ver la nota en scripts/crear-primer-admin.mts. */
const URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, '')
const KEY = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const CONFIRMADO = process.argv.includes('--confirmo-que-es-una-base-de-demo')
/** Genera y muestra el resumen SIN escribir nada ni conectarse. Para revisar antes. */
const VISTA_PREVIA = process.argv.includes('--vista-previa')

function salir(msg: string): never { console.error(`❌ ${msg}`); process.exit(1) }

if (!VISTA_PREVIA && (!URL || !KEY)) salir(
  'Faltan SUPABASE_URL y SERVICE_ROLE_KEY en el entorno (Supabase → Project Settings → API).')
if (!VISTA_PREVIA && !CONFIRMADO) salir(
  'Falta la bandera --confirmo-que-es-una-base-de-demo\n'
  + '   Este script carga operaciones FICTICIAS. Apuntado a la base de un cliente real,\n'
  + '   le mezcla datos falsos con los verdaderos. Escribila entera, a propósito.')

const db = createClient(URL ?? 'http://localhost', KEY ?? 'sin-clave', { auth: { persistSession: false, autoRefreshToken: false } })

// ── Elenco ficticio ────────────────────────────────────────────────────────
// Nombres de fantasía, a propósito poco creíbles como clientes reales.
const CUENTAS = [
  'ACME CAMBIOS', 'BOREAL SRL', 'CITRUS IMPORT', 'DELTA VIAJES',
  'ESTUDIO NORTE', 'FARO LOGISTICA', 'GRANADA TEXTIL', 'HORIZONTE SA',
]
const EVENTUALES = [
  'J. MARTINEZ', 'L. ROSSI', 'P. ALVAREZ', 'R. SUAREZ', 'M. BENITEZ',
  'C. DOMINGUEZ', 'A. FERRARI', 'S. NAVARRO', 'T. ORTEGA', 'V. QUIROGA',
]
const REPARTIDORES = ['RUTA 1', 'RUTA 2', 'MOTO CENTRO']
const CONTRAPARTES_TT = ['ACME - BOREAL', 'CITRUS - DELTA', 'FARO - HORIZONTE']
const CONCEPTOS_GASTO = ['ALQUILER', 'SUELDOS', 'SERVICIOS', 'LIMPIEZA', 'SEGURIDAD']

/** Azar REPETIBLE: la misma semilla da siempre la misma demo. */
let semilla = 20261020
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648
const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))
const uno = <T,>(xs: T[]): T => xs[entre(0, xs.length - 1)]
const redondo = (n: number, paso: number) => Math.max(paso, Math.round(n / paso) * paso)

/** Cotizaciones por moneda, con una deriva suave para que los gráficos no sean planos. */
function cotizacion(moneda: string, dia: number): number {
  const base: Record<string, number> = { DOLARES: 1500, EUROS: 1700, REALES: 290, USDT: 1495, LIBRAS: 1950 }
  const deriva = 1 + (dia / 120) * 0.18 + (azar() - 0.5) * 0.012
  return Math.round(base[moneda] * deriva)
}

const DIAS = 120
const hoy = new Date()
const fechaDe = (diasAtras: number) => {
  const d = new Date(hoy)
  d.setDate(d.getDate() - diasAtras)
  return d.toISOString().slice(0, 10)
}

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
  const desvio = (objetivo - stock[moneda]) / objetivo
  return azar() < Math.min(0.85, Math.max(0.15, 0.5 + desvio))
}

for (const [moneda, monto] of INICIAL) {
  registrar({
    fecha: fechaDe(DIAS), tipo: 'CAJA', cliente: 'SALDO INICIAL',
    operacion: 'SALDO INICIAL', propio: moneda, externo: '', monto,
  })
}

for (let atras = DIAS; atras >= 0; atras--) {
  const fecha = fechaDe(atras)
  const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  if (diaSemana === 0 || diaSemana === 6) continue   // la casa no abre los fines de semana

  // Mostrador: compras y ventas del día. El dólar manda; el resto aparece salteado para
  // que las tarjetas de las otras monedas tengan saldo sin dominar la pantalla.
  for (let i = 0; i < entre(4, 9); i++) {
    const moneda = azar() < 0.72 ? 'DOLARES' : uno(['EUROS', 'REALES', 'USDT', 'LIBRAS'])
    const compra = convieneQueEntre(moneda)
    const cot = cotizacion(moneda, DIAS - atras)
    // La casa compra más barato de lo que vende: de ahí sale la ganancia del período.
    const spread = compra ? -entre(8, 18) : entre(8, 18)
    registrar({
      fecha, tipo: 'CAJA', cliente: uno(EVENTUALES),
      operacion: compra ? 'COMPRA' : 'VENTA',
      propio: moneda, externo: 'PESOS',
      monto: redondo(entre(200, 12_000), 50),
      cotizacion: cot + spread,
      // Una parte de lo vendido sale con un repartidor: alimenta "Dinero en calle".
      debe: !compra && azar() < 0.12 ? uno(REPARTIDORES) : null,
    })
  }

  // Cuentas corrientes: ingresos y egresos de los clientes con cuenta.
  for (let i = 0; i < entre(1, 4); i++) {
    const moneda = azar() < 0.8 ? 'DOLARES' : uno(['PESOS', 'EUROS'])
    registrar({
      fecha, tipo: 'CTA CTE', cliente: uno(CUENTAS),
      // INGRESAN hace entrar moneda a la caja; EGRESAN la saca. Mismo criterio que el
      // mostrador, por el mismo motivo.
      operacion: convieneQueEntre(moneda) ? 'INGRESAN' : 'EGRESAN',
      // En CUENTA CORRIENTE `externo` lleva la moneda: el motor le antepone "CC" y arma
      // el código `CTA CTEINGRESANDOLARESCC DOLARES`, que sí está en la tabla. Es al
      // revés que en CAJA, donde estas operaciones van con `externo` VACÍO porque no
      // cambian una moneda por otra.
      propio: moneda, externo: moneda,
      monto: redondo(entre(500, 9_000), 100),
      notas: azar() < 0.5 ? 'ENTREGA' : 'RETIRO',
    })
  }

  // Transferencias: SIEMPRE las dos patas juntas, como las carga el sistema desde el
  // 13/10/2026. Una sola pata dejaría la demo con un panel de "transferencias en curso"
  // pidiendo explicaciones.
  if (azar() < 0.35) {
    const ref = uno(CONTRAPARTES_TT)
    const entra = redondo(entre(3_000, 40_000), 100)
    const sale = entra - redondo(entra * (entre(4, 12) / 1000), 10)   // margen de 0,4% a 1,2%
    const [a, b] = ref.split(' - ')
    registrar({ fecha, tipo: 'CAJA', cliente: `${a} X TT`, operacion: 'INGRESAN', propio: 'DOLARES', externo: '', monto: entra, op: 'T', notas: ref })
    registrar({ fecha, tipo: 'CAJA', cliente: `${b} X TT`, operacion: 'EGRESAN', propio: 'DOLARES', externo: '', monto: sale, op: 'T', notas: ref })
  }

  // Gastos: solo en pesos (regla del dominio), unas pocas veces por mes.
  if (azar() < 0.1) {
    registrar({
      fecha, tipo: 'CAJA', cliente: uno(CONCEPTOS_GASTO), operacion: 'GASTOS',
      propio: 'PESOS', externo: '', monto: redondo(entre(150_000, 3_500_000), 10_000),
    })
  }
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
