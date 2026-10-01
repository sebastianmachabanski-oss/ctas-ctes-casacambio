/**
 * Validador del reparto de transferencias de Ganancias (`src/lib/ganancias-tt.ts`).
 *
 *   npx tsx scripts/validar-ganancias-tt.mts
 *
 * No toca la base: arma escenarios a mano. El caso 4 reproduce el incidente real de
 * septiembre de 2026 con los importes relevados en producción.
 */
import { repartirTT, claveGrupo, type FilaTT } from '../src/lib/ganancias-tt'

let ok = 0
const fallas: string[] = []

function asert(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok++; return }
  fallas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

function igual(nombre: string, obtenido: number, esperado: number) {
  asert(nombre, Math.round(obtenido) === Math.round(esperado),
    `esperado ${esperado}, obtenido ${Math.round(obtenido)}`)
}

/** Suma el neto en dólares que el período reconoce como resultado. */
const usdDelPeriodo = (r: ReturnType<typeof repartirTT>) =>
  Array.from(r.porFecha.values()).reduce((a, t) => a + t.usd, 0)

const ing = (fecha: string, notas: string | null, dolares: number, id: string): FilaTT =>
  ({ id, fecha, notas, operacion: 'INGRESAN', dolares })
const egr = (fecha: string, notas: string | null, dolares: number, id: string): FilaTT =>
  ({ id, fecha, notas, operacion: 'EGRESAN', dolares })

// ── 1. Grupo cerrado dentro del período: suma su diferencia ─────────────────
{
  const filas = [ing('2026-09-05', 'BOH - GRA', 10_000, 'a'), egr('2026-09-06', 'BOH - GRA', -9_800, 'b')]
  const r = repartirTT(filas, '2026-09-01')
  igual('1a · grupo cerrado suma la diferencia', usdDelPeriodo(r), 200)
  igual('1b · no queda nada abierto', r.abiertas.usd, 0)
  asert('1c · cero grupos abiertos', r.gruposAbiertos === 0)
}

// ── 2. Grupo con una sola punta: NO es ganancia, es posición abierta ────────
{
  const filas = [ing('2026-09-05', 'SOLO - UNA', 10_000, 'a')]
  const r = repartirTT(filas, '2026-09-01')
  igual('2a · la punta suelta no entra al resultado', usdDelPeriodo(r), 0)
  igual('2b · queda como posición abierta', r.abiertas.usd, 10_000)
  asert('2c · un grupo abierto', r.gruposAbiertos === 1)
}

// ── 3. Filas SIN NOTA: cada una es su propio grupo y NUNCA cierra ───────────
//     Es la corrección del 22/9/2026. Antes compartían la clave '(sin nota)',
//     el cajón quedaba con las dos puntas y entraba al resultado como si fuera
//     una transferencia real.
{
  const filas = [
    ing('2026-06-10', null, 300, 'a'),           // junio, sin nota
    egr('2026-09-11', '', -20_000, 'b'),         // septiembre, sin nota (cadena vacía)
    egr('2026-09-12', '   ', -5_025, 'c'),       // septiembre, sin nota (solo espacios)
  ]
  const r = repartirTT(filas, '2026-09-01')
  igual('3a · ninguna fila sin nota entra al resultado', usdDelPeriodo(r), 0)
  igual('3b · todas quedan como posición abierta', r.abiertas.usd, 300 - 20_000 - 5_025)
  asert('3c · son tres grupos distintos, no uno', r.gruposAbiertos === 3,
    `grupos abiertos = ${r.gruposAbiertos}`)
  asert('3d · dos filas sin nota nunca comparten clave',
    claveGrupo(filas[1]) !== claveGrupo(filas[2]))
}

// ── 4. El incidente real de septiembre de 2026 ──────────────────────────────
//     21 grupos con nota aportaron US$ 11.726 y las filas sin nota US$ (24.725).
//     Con el cajón compartido la pantalla mostraba US$ (12.999); ahora las filas
//     sin nota salen del resultado y septiembre queda en US$ 11.726.
{
  const APORTES = [37, 53, 64, 113, 125, 130, 135, 173, 225, 226, 250,
                   252, 275, 350, 420, 500, 1_000, 1_250, 1_498, 1_650, 3_000]
  const filas: FilaTT[] = []
  APORTES.forEach((neto, i) => {
    // Cada grupo con nota: un ingreso y un egreso que dejan `neto` de diferencia.
    filas.push(ing('2026-09-15', `GRUPO ${i}`, 100_000, `i${i}`))
    filas.push(egr('2026-09-16', `GRUPO ${i}`, -(100_000 - neto), `e${i}`))
  })
  // Las 5 filas sin nota: 2 de junio (+300) y 3 de septiembre (−24.725).
  filas.push(ing('2026-06-10', null, 500, 'sn1'))
  filas.push(egr('2026-06-11', null, -200, 'sn2'))
  filas.push(ing('2026-09-18', null, 1_000, 'sn3'))
  filas.push(egr('2026-09-19', null, -20_000, 'sn4'))
  filas.push(egr('2026-09-20', null, -5_725, 'sn5'))

  const r = repartirTT(filas, '2026-09-01')
  igual('4a · septiembre da el neto de los grupos con nota', usdDelPeriodo(r), 11_726)
  igual('4b · las filas sin nota quedan visibles como posición', r.abiertas.usd, -24_425)
  asert('4c · las 5 filas sin nota se ven como 5 grupos', r.gruposAbiertos === 5,
    `grupos abiertos = ${r.gruposAbiertos}`)

  // La regresión que se está previniendo: con el cajón compartido daba (12.999).
  asert('4d · ya NO da el (12.999) que mostraba la pantalla',
    Math.round(usdDelPeriodo(r)) !== -12_999)
}

// ── 5. Grupo cerrado que cruza el borde del período ─────────────────────────
//     Cada pata cuenta en SU fecha: la de agosto no entra en septiembre.
{
  const filas = [ing('2026-08-28', 'CRUZA - MES', 10_000, 'a'), egr('2026-09-02', 'CRUZA - MES', -9_900, 'b')]
  const r = repartirTT(filas, '2026-09-01')
  igual('5a · septiembre solo ve la pata de septiembre', usdDelPeriodo(r), -9_900)
  asert('5b · el grupo está cerrado, no figura abierto', r.gruposAbiertos === 0)
}

// ── 6. Invariante: ninguna fila se cuenta dos veces ni se pierde ────────────
{
  const filas = [
    ing('2026-09-01', 'A - B', 1_000, 'a'), egr('2026-09-02', 'A - B', -900, 'b'),
    ing('2026-09-03', 'C - D', 500, 'c'),
    egr('2026-09-04', null, -77, 'd'),
  ]
  const r = repartirTT(filas, '2026-09-01')
  const total = filas.reduce((a, m) => a + (m.dolares ?? 0), 0)
  igual('6 · resultado + posición abierta = suma de todas las filas',
    usdDelPeriodo(r) + r.abiertas.usd, total)
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
