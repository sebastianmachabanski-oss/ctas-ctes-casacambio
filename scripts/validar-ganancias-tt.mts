/**
 * Validador del reparto de transferencias de Ganancias (`src/lib/ganancias-tt.ts`).
 *
 *   npx tsx scripts/validar-ganancias-tt.mts
 *
 * No toca la base: arma escenarios a mano. Verifica la definición del negocio confirmada
 * el 1/10/2026 — la ganancia de una transferencia se computa CUANDO SE REALIZA, es decir
 * cuando llega su segunda pata, y el par entero cuenta en esa fecha.
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

/** Neto en dólares que el período reconoce como resultado. */
const usdDelPeriodo = (r: ReturnType<typeof repartirTT>) =>
  Array.from(r.porFecha.values()).reduce((a, t) => a + t.usd, 0)

const ing = (fecha: string, notas: string | null, dolares: number, id: string): FilaTT =>
  ({ id, fecha, notas, operacion: 'INGRESAN', dolares })
const egr = (fecha: string, notas: string | null, dolares: number, id: string): FilaTT =>
  ({ id, fecha, notas, operacion: 'EGRESAN', dolares })

// ── 1. Par realizado dentro del período ─────────────────────────────────────
{
  const filas = [ing('2026-09-05', 'BOH - GRA', 10_000, 'a'), egr('2026-09-06', 'BOH - GRA', -9_800, 'b')]
  const r = repartirTT(filas, '2026-09-01')
  igual('1a · el par realizado suma su diferencia', usdDelPeriodo(r), 200)
  igual('1b · se imputa a la fecha de la pata que cierra', r.porFecha.get('2026-09-06')?.usd ?? 0, 200)
  asert('1c · no quedó nada en la fecha de la primera pata', !r.porFecha.has('2026-09-05'))
  igual('1d · nada abierto', r.abiertas.usd, 0)
  asert('1e · cero puntas abiertas', r.puntasAbiertas === 0)
}

// ── 2. Una sola pata: NO se computa hasta que llegue la segunda ─────────────
{
  const filas = [ing('2026-09-05', 'SOLO - UNA', 10_000, 'a')]
  const r = repartirTT(filas, '2026-09-01')
  igual('2a · la pata suelta no entra al resultado', usdDelPeriodo(r), 0)
  igual('2b · queda como posición abierta', r.abiertas.usd, 10_000)
  asert('2c · una punta abierta', r.puntasAbiertas === 1)
}

// ── 3. EL CASO QUE MOTIVÓ EL CAMBIO: el par cruza el borde del mes ──────────
//     Ingreso en agosto, egreso en septiembre. Con el criterio viejo septiembre se
//     quedaba con el egreso solo —negativo—; ahora cuenta el par entero, positivo.
{
  const filas = [ing('2026-08-28', 'CRUZA - MES', 10_000, 'a'), egr('2026-09-02', 'CRUZA - MES', -9_900, 'b')]
  const r = repartirTT(filas, '2026-09-01')
  igual('3a · septiembre cuenta el par entero, no media pata', usdDelPeriodo(r), 100)
  asert('3b · ya NO da el egreso suelto en negativo', Math.round(usdDelPeriodo(r)) !== -9_900)
  asert('3c · el par está realizado, no figura abierto', r.puntasAbiertas === 0)
}

// ── 4. El par realizado ANTES del período no vuelve a contar ────────────────
{
  const filas = [ing('2026-08-10', 'VIEJA - YA', 10_000, 'a'), egr('2026-08-12', 'VIEJA - YA', -9_700, 'b')]
  const r = repartirTT(filas, '2026-09-01')
  igual('4 · lo realizado en agosto no entra en septiembre', usdDelPeriodo(r), 0)
}

// ── 5. Grupo que se repite: cada par se parea por orden cronológico ─────────
//     Las notas son contrapartes que vuelven decenas de veces ("MATI - EDY" tiene 164
//     patas). El ingreso más viejo sin pareja se cancela con el egreso más viejo.
{
  const filas = [
    ing('2026-09-01', 'MATI - EDY', 1_000, 'i1'),
    ing('2026-09-02', 'MATI - EDY', 2_000, 'i2'),
    egr('2026-09-03', 'MATI - EDY', -950, 'e1'),   // cierra con i1 → +50
    egr('2026-09-04', 'MATI - EDY', -1_900, 'e2'), // cierra con i2 → +100
  ]
  const r = repartirTT(filas, '2026-09-01')
  igual('5a · los dos pares suman', usdDelPeriodo(r), 150)
  igual('5b · el primer par cae el día que se cerró', r.porFecha.get('2026-09-03')?.usd ?? 0, 50)
  igual('5c · el segundo par también', r.porFecha.get('2026-09-04')?.usd ?? 0, 100)
  asert('5d · nada quedó abierto', r.puntasAbiertas === 0)
}

// ── 6. Grupo repetido con una pata de más: solo esa queda abierta ───────────
{
  const filas = [
    ing('2026-09-01', 'NES - EDY', 1_000, 'i1'),
    egr('2026-09-02', 'NES - EDY', -900, 'e1'),    // par realizado → +100
    ing('2026-09-20', 'NES - EDY', 5_000, 'i2'),   // todavía sin egreso
  ]
  const r = repartirTT(filas, '2026-09-01')
  igual('6a · solo cuenta el par realizado', usdDelPeriodo(r), 100)
  igual('6b · la pata sobrante queda como posición', r.abiertas.usd, 5_000)
  asert('6c · una sola punta abierta', r.puntasAbiertas === 1)
}

// ── 7. Filas SIN NOTA: cada una es su propio grupo y nunca se parea ─────────
{
  const filas = [
    ing('2026-06-10', null, 300, 'a'),
    egr('2026-09-11', '', -20_000, 'b'),
    egr('2026-09-11', '   ', -5_025, 'c'),
  ]
  // El corte de "en curso" es 2026-09-01, así que la de junio no se reporta (histórico).
  const r = repartirTT(filas, '2026-09-01')
  igual('7a · ninguna fila sin nota entra al resultado', usdDelPeriodo(r), 0)
  igual('7b · las posteriores al corte quedan como posición abierta', r.abiertas.usd, -20_000 - 5_025)
  asert('7c · se reportan las dos de septiembre, no la de junio', r.puntasAbiertas === 2)
  asert('7d · dos filas sin nota nunca comparten clave',
    claveGrupo(filas[1]) !== claveGrupo(filas[2]))
  // Bajando el corte, la de junio vuelve a aparecer: está en la base, solo no se avisa.
  const rTodo = repartirTT(filas, '2026-09-01', '1900-01-01')
  igual('7e · con el corte abierto se reportan las tres', rTodo.abiertas.usd, 300 - 20_000 - 5_025)
  asert('7f · y son tres patas', rTodo.puntasAbiertas === 3)
}

// ── 8. Par negativo: por definición no debería existir, se señala ───────────
//     "Los ingresos SIEMPRE deben ser iguales o mayores a los egresos, sino no hay
//     negocio". Un par que da negativo es un error de carga: se avisa, no se esconde.
{
  const filas = [ing('2026-09-05', 'MAL - CARGADA', 10_000, 'a'), egr('2026-09-06', 'MAL - CARGADA', -10_500, 'b')]
  const r = repartirTT(filas, '2026-09-01')
  asert('8a · se detecta el par negativo', r.paresNegativos.length === 1)
  asert('8b · se informa el grupo', r.paresNegativos[0]?.grupo === 'MAL - CARGADA')
  asert('8c · se informa la fecha en que se realizó', r.paresNegativos[0]?.fecha === '2026-09-06')
  igual('8d · igual se computa: el aviso no altera el número', usdDelPeriodo(r), -500)
}

// ── 9. Un par correcto no se reporta como negativo ──────────────────────────
{
  const filas = [ing('2026-09-05', 'BIEN - CARGADA', 10_000, 'a'), egr('2026-09-06', 'BIEN - CARGADA', -10_000, 'b')]
  const r = repartirTT(filas, '2026-09-01')
  asert('9a · ingreso igual a egreso es válido (no hay ganancia, pero hay negocio)',
    r.paresNegativos.length === 0)
  igual('9b · resultado cero', usdDelPeriodo(r), 0)
}

// ── 10. Invariante: ninguna fila se cuenta dos veces ni se pierde ───────────
//      Tomando el período desde el principio de los tiempos, todo tiene que aparecer
//      o en el resultado o en la posición abierta, exactamente una vez.
{
  const filas = [
    ing('2026-09-01', 'A - B', 1_000, 'a'), egr('2026-09-02', 'A - B', -900, 'b'),
    ing('2026-09-03', 'C - D', 500, 'c'),
    egr('2026-09-04', null, -77, 'd'),
    ing('2026-08-01', 'E - F', 2_000, 'e'), egr('2026-09-09', 'E - F', -1_800, 'f'),
  ]
  const r = repartirTT(filas, '1900-01-01')
  const total = filas.reduce((a, m) => a + (m.dolares ?? 0), 0)
  igual('10 · resultado + posición abierta = suma de todas las filas',
    usdDelPeriodo(r) + r.abiertas.usd, total)
}

// ── 11. Multimoneda: cada moneda se acumula por separado ────────────────────
{
  const filas: FilaTT[] = [
    { id: 'a', fecha: '2026-09-05', notas: 'EUR - PAR', operacion: 'INGRESAN', euros: 5_000 },
    { id: 'b', fecha: '2026-09-06', notas: 'EUR - PAR', operacion: 'EGRESAN', euros: -4_900 },
  ]
  const r = repartirTT(filas, '2026-09-01')
  igual('11a · el par en euros suma en euros', r.porFecha.get('2026-09-06')?.eur ?? 0, 100)
  igual('11b · no ensucia los dólares', usdDelPeriodo(r), 0)
}

// ── 12. El corte de "transferencias en curso" (2/10/2026) ───────────────────
//      Las patas sueltas anteriores al corte vienen del histórico migrado y no van a
//      encontrar pareja nunca: no se avisan. Pero siguen existiendo y siguen pudiendo
//      parearse si algún día aparece el movimiento que falta.
{
  const filas = [
    egr('2026-05-21', 'CAR - EDY', -38_695, 'vieja'),   // histórico, sin pareja
    egr('2026-09-30', 'HER - OSC', -25_125, 'nueva'),   // reciente, sin pareja
  ]
  const r = repartirTT(filas, '2026-09-01', '2026-09-01')
  igual('12a · solo se reporta la posterior al corte', r.abiertas.usd, -25_125)
  asert('12b · una sola pata avisada', r.puntasAbiertas === 1)
  igual('12c · ninguna de las dos se computa como ganancia', usdDelPeriodo(r), 0)
}

// ── 13. Una pata vieja oculta SIGUE pudiendo parearse ───────────────────────
//      El corte decide qué se avisa, no qué existe. Si llega el movimiento que falta,
//      el par se arma y cuenta en la fecha en que se completó.
{
  const filas = [
    egr('2026-05-21', 'CAR - EDY', -38_695, 'vieja'),
    ing('2026-09-15', 'CAR - EDY', 39_000, 'llega'),    // aparece la pareja
  ]
  const r = repartirTT(filas, '2026-09-01', '2026-09-01')
  igual('13a · el par se arma aunque una pata sea anterior al corte', usdDelPeriodo(r), 305)
  igual('13b · cuenta en la fecha en que se completó', r.porFecha.get('2026-09-15')?.usd ?? 0, 305)
  asert('13c · no queda nada abierto', r.puntasAbiertas === 0)
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
