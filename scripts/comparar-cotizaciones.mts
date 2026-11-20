/**
 * ¿Ya se puede decidir con qué fuente de cotizaciones quedarse?
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/comparar-cotizaciones.mts
 *
 * Compara dolarapi contra dolarhoy —la que mira el cliente— sobre todo lo que se viene
 * guardando, y contesta una de dos cosas: el veredicto, o qué falta para poder darlo.
 *
 * La decisión que resuelve: dolarhoy no tiene API y hay que leer su HTML, que se rompe el
 * día que cambien el diseño. Si dolarapi la reproduce, ese lector se tira. El criterio y
 * los umbrales están explicados en src/lib/cotizaciones/comparar.ts.
 *
 * Se puede correr cuando sea, las veces que sea: no escribe nada.
 */
import { createClient } from '@supabase/supabase-js'
import { credencialesSupabase } from '../src/lib/cotizaciones/guardar'
import {
  compararFuentes, TOLERANCIA_PCT, MOVIMIENTO_FUERTE_PCT, type FilaGuardada,
} from '../src/lib/cotizaciones/comparar'

const CRED = credencialesSupabase()
if (!CRED) {
  console.error('❌ Faltan las credenciales de Supabase: SUPABASE_URL y SERVICE_ROLE_KEY.')
  process.exit(1)
}

const db = createClient(CRED.url, CRED.key, { auth: { persistSession: false } })

// Postgrest corta en 1.000 filas: sin paginar, la comparación se haría sobre un pedazo.
const PAGINA = 1000
const filas: FilaGuardada[] = []
for (let desde = 0; ; desde += PAGINA) {
  const { data, error } = await db
    .from('cotizaciones_mercado')
    .select('tomada_en, fuente, clave, venta')
    .order('tomada_en', { ascending: true })
    .range(desde, desde + PAGINA - 1)
  if (error) { console.error(`❌ No se pudo leer la tabla: ${error.message}`); process.exit(1) }
  const pg = (data ?? []) as FilaGuardada[]
  filas.push(...pg)
  if (pg.length < PAGINA) break
}

if (!filas.length) {
  console.log('\nTodavía no hay ninguna cotización guardada.\n')
  process.exit(1)
}

const v = compararFuentes(filas)
const pct = (n: number) => `${n.toFixed(2).replace('.', ',')}%`
const fecha = (d: string | null) =>
  d ? d.split('-').reverse().join('/') : '—'

console.log(`\n📊 dolarapi contra dolarhoy · ${CRED.proyecto}`)
console.log(`   ${v.mediciones.toLocaleString('es-AR')} mediciones · `
  + `del ${fecha(v.desde)} al ${fecha(v.hasta)} · ${v.dias} día(s), `
  + `${v.diasMovidos} con movimiento fuerte\n`)

if (v.comparaciones.length) {
  console.log('   moneda     mediciones   promedio      peor    veredicto')
  console.log('   ' + '─'.repeat(62))
  for (const c of v.comparaciones) {
    console.log(`   ${c.clave.padEnd(10)} ${String(c.mediciones).padStart(10)}   `
      + `${pct(c.promedio).padStart(8)}  ${pct(c.peor).padStart(8)}    `
      + (c.sirve ? 'dolarapi sirve' : '⚠ REVISAR'))
  }
  console.log(`\n   (la raya está en ${pct(TOLERANCIA_PCT)}: por encima, el error del `
    + 'referencial\n    se come más de un cuarto del margen de la operación)')
}

console.log('')
if (!v.alcanza) {
  console.log('⏳ Todavía NO alcanza para decidir:')
  for (const f of v.faltan) console.log(`   · ${f}`)
  console.log(`\n   Un día cuenta como movido si el blue varía ${pct(MOVIMIENTO_FUERTE_PCT)} `
    + 'o más dentro del día.')
  console.log('   Volvé a correr esto en unos días.\n')
  process.exit(2)
}

const problemáticas = v.comparaciones.filter(c => !c.sirve)
if (problemáticas.length === 0) {
  console.log('✅ HAY EVIDENCIA Y DOLARAPI REPRODUCE A DOLARHOY en todas las monedas.')
  console.log('   Se puede dejar de leer el HTML de dolarhoy y quedarse solo con APIs.\n')
} else {
  console.log('⚠ HAY EVIDENCIA, y dolarapi NO alcanza en: '
    + problemáticas.map(c => c.clave).join(', '))
  console.log('   Para esas monedas conviene seguir leyendo dolarhoy. Para el resto, no.\n')
}
process.exit(0)
