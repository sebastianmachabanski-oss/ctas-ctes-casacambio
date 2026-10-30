/**
 * Validador del desempate de `diario` (`src/lib/diario.ts`).
 *
 *   npx tsx scripts/validar-diario.mts
 *
 * No toca la base. Cubre el caso real del 5/10/2026: la cuenta EDY tenía dos ingresos de
 * U$S 5.000 el mismo día ("MATI RAFA" y "RAFA") y al borrar uno el saldo quedaba mal.
 */
import { desempatar, sonIndistinguibles } from '../src/lib/diario'

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

// ── 8. EL CASO DEL 30/10/2026: dos filas IDÉNTICAS ─────────────────────────
//     Dos ingresos de U$S 19.300 el mismo día en la misma cuenta, los dos sin
//     referencia. La referencia no desempata (test 7) y antes se abandonaba, dejando el
//     saldo del cliente mal. Siendo iguales en todo, son intercambiables: borrar
//     cualquiera de las dos deja el mismo saldo, así que hay que tocar una.
{
  const igual = (id: string) => ({
    id, evento: null, notas: null,
    concepto: 'DOLARES → DOLARES', detalle: 'C', moneda: 'DOLARES', cotizacion: null,
    origen: 'sheet', cc_pesos: 0, cc_dolares: -19300, cc_euros: 0, cc_reales: 0,
    cc_usdt: 0, cc_libras: 0,
  })
  asert('8a · dos filas iguales son intercambiables', sonIndistinguibles([igual('a'), igual('b')]))
  asert('8b · una sola siempre lo es', sonIndistinguibles([igual('a')]))
  asert('8c · ninguna también', sonIndistinguibles([]))
}

// ── 9. Si DIFIEREN en algo, no se toca ninguna ──────────────────────────────
//     Acá elegir mal cambia la plata de un cliente, y corresponde seguir avisando.
{
  const base = {
    evento: null, notas: null, concepto: 'DOLARES → DOLARES', detalle: 'C',
    moneda: 'DOLARES', cotizacion: null, origen: 'sheet',
    cc_pesos: 0, cc_dolares: -19300, cc_euros: 0, cc_reales: 0, cc_usdt: 0, cc_libras: 0,
  }
  asert('9a · distinta pata de cuenta corriente',
    !sonIndistinguibles([{ ...base, id: 'a' }, { ...base, id: 'b', cc_dolares: -19301 }]))
  asert('9b · distinta moneda',
    !sonIndistinguibles([{ ...base, id: 'a' }, { ...base, id: 'b', moneda: 'PESOS' }]))
  asert('9c · distinta referencia',
    !sonIndistinguibles([{ ...base, id: 'a' }, { ...base, id: 'b', evento: 'RAFA' }]))
}

// ── 10. El importe se compara POR VALOR, no por texto ───────────────────────
//     Según el driver, un numeric llega como number o como string: "0" y "0.00" son el
//     mismo importe, y tomarlos por distintos haría fallar justo el caso que esto arregla.
{
  const base = {
    evento: null, notas: null, concepto: 'DOLARES → DOLARES', detalle: 'C',
    moneda: 'DOLARES', cotizacion: null, origen: 'sheet',
    cc_pesos: 0, cc_euros: 0, cc_reales: 0, cc_usdt: 0, cc_libras: 0,
  }
  asert('10 · numeric como texto o como número es lo mismo', sonIndistinguibles([
    { ...base, id: 'a', cc_dolares: -19300 },
    { ...base, id: 'b', cc_dolares: '-19300.00' as any },
  ]))
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
