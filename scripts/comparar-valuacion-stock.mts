/**
 * Compara los criterios de valuación del stock contra el margen real de las operaciones.
 *
 *   npx tsx scripts/comparar-valuacion-stock.mts
 *   npx tsx scripts/comparar-valuacion-stock.mts --desde=2026-01-01 --hasta=2026-11-30
 *   npx tsx scripts/comparar-valuacion-stock.mts --par=eur
 *   npx tsx scripts/comparar-valuacion-stock.mts --sin-cc
 *
 * ── LA PREGUNTA QUE CONTESTA ───────────────────────────────────────────────
 * La pantalla de Ganancias valúa el stock de fin de período con un MARGEN FIJO de
 * $ 0,05 por unidad, y su propia explicación dice que ese margen representa "lo que cada
 * unidad va a dejar cuando se venda". Pero lo que cada unidad deja cuando se vende es el
 * SPREAD del período: la tasa promedio de venta menos la de compra. Si el spread real es
 * de dos dígitos, el margen fijo no es "prudente": es cero disfrazado de supuesto.
 *
 * Este script mide esa brecha con los datos de producción, mes por mes y moneda por
 * moneda, para decidir con números y no por intuición.
 *
 * ── NO ESCRIBE NADA ────────────────────────────────────────────────────────
 * Solo lee `movimientos_caja`. Es seguro correrlo las veces que haga falta.
 *
 * ── DE DÓNDE SALEN LAS CREDENCIALES ────────────────────────────────────────
 * Del `.env.local` del proyecto, que es el que usa la app. Si ya están en el ambiente,
 * esas tienen prioridad. Los nombres se toman de a pares para no combinar nunca la
 * dirección de un proyecto con la clave de otro (ver `credencialesSupabase`).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ── Ambiente ───────────────────────────────────────────────────────────────
// `npx tsx` no lee `.env.local` (eso lo hace Next, no Node), así que se carga a mano.
// Sin sobrescribir lo que ya venga del ambiente: si alguien exporta las variables para
// apuntar a otra base, esa decisión gana.
function cargarEnvLocal(archivo = '.env.local') {
  let texto: string
  try { texto = readFileSync(resolve(process.cwd(), archivo), 'utf8') } catch { return }
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    const nombre = m[1]
    // Comillas opcionales alrededor del valor, como las escribe cualquier panel.
    const valor = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[nombre] === undefined) process.env[nombre] = valor
  }
}
cargarEnvLocal()

/** Mismo orden que `createAdminClient` y que `src/lib/cotizaciones/guardar.ts`. */
function credencialesSupabase() {
  const JUEGOS: [string, string][] = [
    ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    ['NEXT_PUBLIC_SUPABASE_URL', 'SERVICE_ROLE_KEY'],
    ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    ['SUPABASE_URL', 'SERVICE_ROLE_KEY'],
  ]
  for (const [nombreUrl, nombreKey] of JUEGOS) {
    const url = process.env[nombreUrl]?.trim().replace(/\/+$/, '')
    const key = process.env[nombreKey]?.trim()
    if (url && key) return { url, key, origen: `${nombreUrl} + ${nombreKey}`, proyecto: url.replace(/^https?:\/\//, '').split('.')[0] }
  }
  return null
}

function salir(msg: string): never { console.error(`\n❌ ${msg}\n`); process.exit(1) }

// ── Parámetros ─────────────────────────────────────────────────────────────
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const CON_CC = !process.argv.includes('--sin-cc') // la pantalla trae cta cte prendida
const MARGEN_FIJO = Number(arg('margen') ?? 0.05)

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
// Por defecto, los últimos doce meses cerrados más el corriente: suficiente para ver
// estacionalidad sin traer la historia entera.
const unAnioAtras = new Date(`${hoy}T00:00:00-03:00`)
unAnioAtras.setUTCFullYear(unAnioAtras.getUTCFullYear() - 1)
const DESDE = arg('desde') ?? unAnioAtras.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 8) + '01'
const HASTA = arg('hasta') ?? hoy

for (const [n, v] of [['desde', DESDE], ['hasta', HASTA]]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) salir(`--${n} tiene que ser una fecha YYYY-MM-DD, llegó "${v}".`)
}

const PARES = [
  { par: 'usd', nombre: 'Dólares', col: 'dolares', colCC: 'cc_dolares', sym: 'US$' },
  { par: 'eur', nombre: 'Euros', col: 'euros', colCC: 'cc_euros', sym: '€' },
  { par: 'brl', nombre: 'Reales', col: 'reales', colCC: 'cc_reales', sym: 'R$' },
  { par: 'usdt', nombre: 'USDT', col: 'usdt', colCC: 'cc_usdt', sym: 'USDT' },
  { par: 'gbp', nombre: 'Libras', col: 'libras', colCC: 'cc_libras', sym: '£' },
  { par: 'chq', nombre: 'Cheques', col: 'cheques', colCC: 'cc_cheques', sym: 'CH$' },
] as const

const SOLO_PAR = arg('par')
if (SOLO_PAR && !PARES.some(p => p.par === SOLO_PAR)) {
  salir(`--par tiene que ser uno de: ${PARES.map(p => p.par).join(', ')}. Llegó "${SOLO_PAR}".`)
}
const ELEGIDOS = SOLO_PAR ? PARES.filter(p => p.par === SOLO_PAR) : PARES

// ── Formato argentino ──────────────────────────────────────────────────────
const n0 = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 0 })
const n2 = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pesos = (v: number) => (v < 0 ? `(${n0(-v)})` : n0(v))

// ── Traer los movimientos ──────────────────────────────────────────────────
const CRED = credencialesSupabase()
if (!CRED) salir(
  'Faltan las credenciales de Supabase.\n'
  + '   Se buscan en `.env.local` del proyecto (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)\n'
  + '   o en el ambiente. Si estás en otra carpeta, corré el script desde la raíz del proyecto.')

console.log(`\n🔑 credenciales de ${CRED.origen} · proyecto ${CRED.proyecto}`)
console.log(`📅 período ${DESDE} → ${HASTA} · cuenta corriente ${CON_CC ? 'incluida' : 'excluida'}`)
console.log(`📏 margen fijo a comparar: $ ${n2(MARGEN_FIJO)} por unidad\n`)

const db = createClient(CRED.url, CRED.key, { auth: { persistSession: false } })

// Mismas columnas, mismos filtros y misma paginación que `src/app/dashboard/ganancias/page.tsx`.
// El `or` y no un `neq` porque `op` es NULL en casi todo el histórico.
// Con `cc_usdt`, que la pantalla no pedía hasta el 20/11/2026: ver el comentario en
// `src/app/dashboard/ganancias/page.tsx`. Sin ella, USDT por cuenta corriente da 0.
const COLUMNAS = 'fecha,operacion,pesos,cheques,dolares,euros,reales,usdt,libras,'
  + 'cc_pesos,cc_dolares,cc_euros,cc_reales,cc_usdt,cc_libras'
const PAGE = 1000
const filas: any[] = []
for (let from = 0; ; from += PAGE) {
  const { data, error } = await db.from('movimientos_caja')
    .select(COLUMNAS)
    .in('operacion', ['COMPRA', 'VENTA'])
    .or('op.is.null,op.neq.T')
    .gte('fecha', DESDE).lte('fecha', HASTA)
    .order('fecha', { ascending: true })
    .range(from, from + PAGE - 1)
  if (error) salir(`consultando movimientos_caja: ${error.message}`)
  const rows = (data ?? []) as any[]
  filas.push(...rows)
  if (rows.length < PAGE) break
}
console.log(`📥 ${n0(filas.length)} movimientos de COMPRA/VENTA leídos\n`)
if (!filas.length) salir('No hay movimientos en ese rango: revisá --desde / --hasta.')

// ── Agregar por mes y por par ──────────────────────────────────────────────
// Réplica exacta de la agregación de la pantalla: una fila aporta a un par solo si tiene
// volumen de esa moneda Y contrapartida en pesos, y con el signo que corresponde a la
// operación. `cc_cheques` no existe, así que esa pata de cheques queda siempre en cero.
type Agg = { vC: number; aC: number; vV: number; aV: number }
const vacio = (): Agg => ({ vC: 0, aC: 0, vV: 0, aV: 0 })
/** mes 'YYYY-MM' → par → agregado */
const porMes = new Map<string, Map<string, Agg>>()
const aggDe = (mes: string, par: string): Agg => {
  let m = porMes.get(mes)
  if (!m) { m = new Map(); porMes.set(mes, m) }
  let a = m.get(par)
  if (!a) { a = vacio(); m.set(par, a) }
  return a
}

for (const f of filas) {
  const mes = String(f.fecha).slice(0, 7)
  for (const { par, col, colCC } of ELEGIDOS) {
    const patas: [number, number][] = [
      [Number(f[col]) || 0, Number(f.pesos) || 0],
      ...(CON_CC ? [[Number(f[colCC]) || 0, Number(f.cc_pesos) || 0] as [number, number]] : []),
    ]
    for (const [vol, ars] of patas) {
      if (!vol || !ars) continue // no es un cambio de esta moneda contra pesos
      const a = aggDe(mes, par)
      if (f.operacion === 'COMPRA' && vol > 0 && ars < 0) { a.vC += vol; a.aC += -ars }
      else if (f.operacion === 'VENTA' && vol < 0 && ars > 0) { a.vV += -vol; a.aV += ars }
    }
  }
}

// ── La cuenta ──────────────────────────────────────────────────────────────
// Mismas fórmulas que `calc()` en GananciasView.tsx.
type Fila = {
  mes: string; par: string; nombre: string; sym: string
  vC: number; vV: number; t1: number; t2: number; spread: number
  calzado: number; stock: number
  realizado: number   // calzado × spread — la ganancia que sí tiene operaciones detrás
  vFijo: number       // stock × margen fijo        (criterio de hoy)
  vSpread: number     // stock × spread del período (criterio propuesto)
}
const resultados: Fila[] = []
for (const [mes, pares] of [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  for (const { par, nombre, sym } of ELEGIDOS) {
    const a = pares.get(par)
    if (!a || (!a.vC && !a.vV)) continue
    const t1 = a.vC ? a.aC / a.vC : 0
    const t2 = a.vV ? a.aV / a.vV : 0
    const spread = (a.vC && a.vV) ? t2 - t1 : 0
    const calzado = Math.min(a.vC, a.vV)
    const stock = Math.abs(a.vC - a.vV)
    resultados.push({
      mes, par, nombre, sym, vC: a.vC, vV: a.vV, t1, t2, spread, calzado, stock,
      realizado: calzado * spread,
      vFijo: stock * MARGEN_FIJO,
      vSpread: stock * spread,
    })
  }
}
if (!resultados.length) salir('No quedó ningún par con operaciones: revisá --par.')

// ── Salida: una tabla por moneda ───────────────────────────────────────────
const sep = (c = '─') => console.log(c.repeat(118))
const celda = (s: string, ancho: number, der = true) =>
  der ? s.padStart(ancho) : s.padEnd(ancho)

for (const { par, nombre, sym } of ELEGIDOS) {
  const filasPar = resultados.filter(r => r.par === par)
  if (!filasPar.length) continue

  console.log(`\n\n━━━ ${nombre.toUpperCase()} ━━━\n`)
  console.log(
    celda('Mes', 8, false) + celda('Comprado', 13) + celda('Vendido', 13)
    + celda('Spread/u', 11) + celda('Stock', 12)
    + celda('Fijo 0,05', 13) + celda('Al spread', 14) + celda('Veces', 8)
    + celda('% result.', 11) + celda('% s/spread', 12))
  sep()

  let tvFijo = 0, tvSpread = 0, tRealizado = 0, tStock = 0
  for (const r of filasPar) {
    tvFijo += r.vFijo; tvSpread += r.vSpread; tRealizado += r.realizado; tStock += r.stock
    // Cuántas veces el margen real es más grande que el fijo.
    const veces = MARGEN_FIJO > 0 && r.spread > 0 ? r.spread / MARGEN_FIJO : null
    // Cuánto pesa cada valuación sobre el resultado total de ese mes y moneda.
    const totalFijo = r.realizado + r.vFijo
    const totalSpread = r.realizado + r.vSpread
    const pesoFijo = totalFijo !== 0 ? (r.vFijo / totalFijo) * 100 : null
    const pesoSpread = totalSpread !== 0 ? (r.vSpread / totalSpread) * 100 : null
    console.log(
      celda(r.mes, 8, false)
      + celda(n0(r.vC), 13) + celda(n0(r.vV), 13)
      + celda(r.spread ? n2(r.spread) : '—', 11)
      + celda(n0(r.stock), 12)
      + celda(pesos(Math.round(r.vFijo)), 13)
      + celda(pesos(Math.round(r.vSpread)), 14)
      + celda(veces != null ? `${n0(veces)}×` : '—', 8)
      + celda(pesoFijo != null ? `${n2(pesoFijo)}%` : '—', 11)
      + celda(pesoSpread != null ? `${n2(pesoSpread)}%` : '—', 12))
  }

  sep('═')
  console.log(
    celda('TOTAL', 8, false) + celda('', 13) + celda('', 13) + celda('', 11)
    + celda(n0(tStock), 12)
    + celda(pesos(Math.round(tvFijo)), 13)
    + celda(pesos(Math.round(tvSpread)), 14))

  console.log(`\n   Ganancia con operaciones detrás (calzado × spread): $ ${pesos(Math.round(tRealizado))}`)
  console.log(`   Valuación del stock, criterio de hoy (fijo 0,05):   $ ${pesos(Math.round(tvFijo))}`
    + (tRealizado !== 0 ? `  → ${n2((tvFijo / (tRealizado + tvFijo)) * 100)}% del resultado` : ''))
  console.log(`   Valuación del stock, al spread del período:         $ ${pesos(Math.round(tvSpread))}`
    + (tRealizado !== 0 ? `  → ${n2((tvSpread / (tRealizado + tvSpread)) * 100)}% del resultado` : ''))
  const brecha = tvSpread - tvFijo
  console.log(`   Diferencia entre los dos criterios:                $ ${pesos(Math.round(brecha))}`)
  if (tvFijo > 0) console.log(`   El criterio de hoy reconoce ${n0(tvSpread / tvFijo)} veces menos de lo que dejaría ese stock.`)
}

// ── Resumen de una línea, que es lo que se lleva a la reunión ──────────────
console.log('\n\n━━━ RESUMEN ━━━\n')
const spreads = resultados.filter(r => r.spread > 0)
if (spreads.length) {
  // Promedio ponderado por volumen calzado: el spread "típico" del negocio, no el promedio
  // de los meses (que le daría el mismo peso a un mes flojo que a uno fuerte).
  const volTotal = spreads.reduce((s, r) => s + r.calzado, 0)
  const spreadPonderado = volTotal ? spreads.reduce((s, r) => s + r.spread * r.calzado, 0) / volTotal : 0
  console.log(`Spread promedio del negocio, ponderado por volumen: $ ${n2(spreadPonderado)} por unidad.`)
  console.log(`Margen fijo con el que se valúa el stock hoy:        $ ${n2(MARGEN_FIJO)} por unidad.`)
  if (MARGEN_FIJO > 0) console.log(`El supuesto de hoy es ${n0(spreadPonderado / MARGEN_FIJO)} veces más chico que el margen real.`)
}
const TF = resultados.reduce((s, r) => s + r.vFijo, 0)
const TS = resultados.reduce((s, r) => s + r.vSpread, 0)
const TR = resultados.reduce((s, r) => s + r.realizado, 0)
console.log(`\nSobre todas las monedas y meses del rango:`)
console.log(`  calzado × spread ............... $ ${pesos(Math.round(TR))}`)
console.log(`  stock a margen fijo ............ $ ${pesos(Math.round(TF))}`)
console.log(`  stock al spread del período .... $ ${pesos(Math.round(TS))}`)
console.log(`  la valuación pasa de pesar ${TR + TF !== 0 ? n2((TF / (TR + TF)) * 100) : '—'}% a ${TR + TS !== 0 ? n2((TS / (TR + TS)) * 100) : '—'}% del resultado.\n`)
console.log('Nada de esto se escribió en la base: el script solo lee.\n')
