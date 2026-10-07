/**
 * Validador del desempate de `diario` (`src/lib/diario.ts`).
 *
 *   npx tsx scripts/validar-diario.mts
 *
 * No toca la base. Cubre el caso real del 5/10/2026: la cuenta EDY tenía dos ingresos de
 * U$S 5.000 el mismo día ("MATI RAFA" y "RAFA") y al borrar uno el saldo quedaba mal.
 */
import { desempatar } from '../src/lib/diario'

let ok = 0
const fallas: string[] = []

function asert(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok++; return }
  fallas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

const fila = (id: string, evento: string | null, notas: string | null = null) => ({ id, evento, notas })

// ── 1. EL CASO REAL: dos ingresos iguales el mismo día ──────────────────────
{
  const candidatas = [fila('a', 'MATI RAFA'), fila('b', 'RAFA')]
  const r = desempatar(candidatas, 'MATI RAFA')
  asert('1a · queda una sola', r.length === 1, `quedaron ${r.length}`)
  asert('1b · y es la correcta', r[0]?.id === 'a')
  const r2 = desempatar(candidatas, 'RAFA')
  asert('1c · la otra también se resuelve', r2.length === 1 && r2[0]?.id === 'b')
}

// ── 2. "RAFA" NO debe confundirse con "MATI RAFA" ───────────────────────────
//     La comparación es por igualdad, no por "contiene": si fuera por contiene,
//     buscar "RAFA" traería las dos y el empate seguiría.
{
  const r = desempatar([fila('a', 'MATI RAFA'), fila('b', 'RAFA')], 'RAFA')
  asert('2 · no matchea por substring', r.length === 1 && r[0]?.id === 'b')
}

// ── 3. Se cae a `notas` cuando `evento` está vacío ──────────────────────────
//     El sync deja la referencia en `evento`; lo cargado antes del 1/9/2026 solo
//     tiene `notas`.
{
  const r = desempatar([fila('a', null, 'MATI RAFA'), fila('b', null, 'RAFA')], 'MATI RAFA')
  asert('3 · desempata por notas si no hay evento', r.length === 1 && r[0]?.id === 'a')
}

// ── 4. Diferencias de mayúsculas y espacios no rompen el desempate ──────────
{
  const r = desempatar([fila('a', ' mati rafa '), fila('b', 'RAFA')], 'MATI RAFA')
  asert('4 · normaliza mayúsculas y espacios', r.length === 1 && r[0]?.id === 'a')
}

// ── 5. Sin referencia NO se elige: se devuelve el empate para que se avise ──
//     Elegir una al azar sería mover plata de un cliente a ciegas.
{
  const candidatas = [fila('a', 'MATI RAFA'), fila('b', 'RAFA')]
  asert('5a · referencia null devuelve el empate', desempatar(candidatas, null).length === 2)
  asert('5b · referencia vacía también', desempatar(candidatas, '   ').length === 2)
}

// ── 6. Si ninguna coincide, no se elige ninguna ─────────────────────────────
//     Quien llama tiene que avisar, no borrar la primera que encuentre.
{
  const r = desempatar([fila('a', 'MATI RAFA'), fila('b', 'RAFA')], 'OTRA COSA')
  asert('6 · referencia desconocida no elige nada', r.length === 0)
}

// ── 7. Dos filas con la MISMA referencia siguen empatadas ───────────────────
//     Acá la referencia no alcanza y corresponde seguir avisando.
{
  const r = desempatar([fila('a', 'RAFA'), fila('b', 'RAFA')], 'RAFA')
  asert('7 · referencias idénticas no se desempatan', r.length === 2)
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
