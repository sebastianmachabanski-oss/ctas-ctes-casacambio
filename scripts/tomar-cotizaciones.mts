/**
 * Toma una foto de las cotizaciones de mercado y la guarda.
 *
 *   npx tsx scripts/tomar-cotizaciones.mts --vista-previa     ← solo muestra, no guarda
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/tomar-cotizaciones.mts
 *
 * ── PARA QUÉ ───────────────────────────────────────────────────────────────
 * Guarda en paralelo lo que publican dolarhoy, dolarapi y monitorargy, para poder medir
 * cuánto se separan entre sí. La decisión que depende de esa medición está explicada en
 * `src/lib/cotizaciones/tipos.ts`: si dolarapi reproduce a dolarhoy, el lector de HTML
 * —el único frágil— se puede tirar.
 *
 * En producción esto lo corre una función programada cada 15 minutos. Este script existe
 * para correrlo a mano: probar que las tres fuentes responden, ver qué devuelven antes de
 * guardar nada, y tener con qué diagnosticar el día que una se rompa.
 *
 * ── SOLO GUARDA LO QUE CAMBIÓ ──────────────────────────────────────────────
 * Si una cotización vale lo mismo que la última guardada para esa fuente y esa moneda, no
 * se inserta otra fila. Una foto cada 15 minutos durante un año son cientos de miles de
 * filas casi todas repetidas; así la tabla queda siendo la historia de los CAMBIOS, que
 * además es lo que se quiere consultar.
 */
import { createClient } from '@supabase/supabase-js'
import { tomarCotizaciones, type Cotizacion } from '../src/lib/cotizaciones/index'
import { guardarToma } from '../src/lib/cotizaciones/guardar'

const VISTA_PREVIA = process.argv.includes('--vista-previa')
const URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, '')
const KEY = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

function salir(msg: string): never { console.error(`❌ ${msg}`); process.exit(1) }

if (!VISTA_PREVIA && (!URL || !KEY)) salir(
  'Faltan SUPABASE_URL y SERVICE_ROLE_KEY.\n'
  + '   Para ver qué devuelven las fuentes sin guardar nada: --vista-previa')

const n = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/**
 * Hora de Argentina y en 24 h, SIEMPRE. El servidor que corre esto está en UTC, y con el
 * formato por defecto imprimía "09:27" para las 21:27: un horario que parece de la mañana
 * al lado de un "06:24 PM" de la fuente, y que invita a concluir que algo está atrasado.
 */
const reloj = (iso: string) => new Date(iso).toLocaleString('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', hour12: false,
})

const toma = await tomarCotizaciones()

console.log(`\n📈 Cotizaciones al ${reloj(toma.tomadaEn)} (hora de Argentina)\n`)
console.log('   fuente        moneda    compra        venta       actualizado en origen')
console.log('   ' + '─'.repeat(76))
for (const c of toma.cotizaciones) {
  console.log(`   ${c.fuente.padEnd(13)} ${c.clave.padEnd(8)} ${n(c.compra).padStart(10)} `
    + `${n(c.venta).padStart(12)}   ${c.actualizadoTexto ?? '—'}`)
}

if (toma.problemas.length) {
  console.log(`\n⚠  ${toma.problemas.length} aviso(s):`)
  for (const p of toma.problemas) console.log(`   · ${p}`)
}
if (toma.fuentesCaidas.length) {
  console.log(`\n❌ Sin una sola cotización válida: ${toma.fuentesCaidas.join(', ')}`)
}

// Comparación entre fuentes: es el número que justifica todo esto.
const porClave = new Map<string, Cotizacion[]>()
for (const c of toma.cotizaciones) {
  const g = porClave.get(c.clave)
  if (g) g.push(c); else porClave.set(c.clave, [c])
}
const comparables = Array.from(porClave.entries()).filter(([, cs]) => cs.length > 1)
if (comparables.length) {
  console.log('\n   Diferencia entre fuentes (sobre la VENTA, que es la que publican todas):')
  for (const [clave, cs] of comparables) {
    const ventas = cs.filter(c => c.venta != null)
    if (ventas.length < 2) continue
    const vals = ventas.map(c => c.venta as number)
    const min = Math.min(...vals), max = Math.max(...vals)
    const pct = max === 0 ? 0 : ((max - min) / max) * 100
    const detalle = ventas.map(c => `${c.fuente} ${n(c.venta)}`).join(' · ')
    console.log(`   ${clave.padEnd(8)} ${pct.toFixed(2).padStart(6)}%   ${detalle}`)
  }
}

if (VISTA_PREVIA) {
  console.log('\n(vista previa: no se guardó nada)\n')
  process.exit(toma.fuentesCaidas.length ? 1 : 0)
}

// ── Guardado ────────────────────────────────────────────────────────────────
// La lógica vive en src/lib/cotizaciones/guardar.ts: la comparte con la función programada
// que hace esto mismo cada quince minutos.
const db = createClient(URL!, KEY!, { auth: { persistSession: false } })
const g = await guardarToma(db, toma)

if (g.errores.length) {
  console.error(`\n❌ ${g.errores.length} error(es) al guardar:`)
  for (const e of g.errores) console.error(`   · ${e}`)
}
console.log(`\n✅ ${g.nuevas} cotización(es) nueva(s), ${g.repetidas} sin cambios.\n`)
process.exit(g.errores.length || toma.fuentesCaidas.length ? 1 : 0)
