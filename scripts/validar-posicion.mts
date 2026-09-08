// Valida que los saldos de la pantalla Posición Ctas Ctes cierren entre sí.
// Uso: npx tsx scripts/validar-posicion.mts
//
// QUÉ SE VERIFICA
// La pantalla muestra los mismos importes en dos lugares —las tarjetas de arriba y el
// subtotal de cada solapa— y esos dos lugares TIENEN que dar lo mismo. Ya fallaron una
// vez: con el filtro "Nos deben" el subtotal arrastraba las patas negativas de las
// cuentas mixtas y no coincidía con la tarjeta. Eso es lo que estas pruebas cuidan.
//
// Se prueba contra datos fabricados, no contra la base: lo que se valida es la ARITMÉTICA
// de la pantalla (que los tres subtotales cierren, que las mixtas se partan bien, que
// nada se cuente dos veces ni se pierda), y para eso hacen falta casos límite que en la
// base pueden no estar. El último bloque genera 500 carteras al azar, que es donde
// aparecen los casos que uno no se le ocurren a mano.

import {
  MONEDAS, LADO, val, esMixta, posicionPorMoneda, filtrarPorLado, subtotales,
  ordenarPor, type Saldo, type ClaveMoneda,
} from '../src/lib/posicion'

let ok = 0
let fail = 0

// Tolerancia de coma flotante, no de negocio: los importes son los mismos números sumados
// en distinto orden, así que la única diferencia admisible es la del punto flotante.
const EPS = 1e-9

function assertCasi(actual: number, esperado: number, msg: string) {
  if (Math.abs(actual - esperado) < EPS) { ok++; console.log(`✅ ${msg}`) }
  else { fail++; console.error(`❌ ${msg} — esperado ${esperado}, dio ${actual}`) }
}

function assertIgual<T>(actual: T, esperado: T, msg: string) {
  if (actual === esperado) { ok++; console.log(`✅ ${msg}`) }
  else { fail++; console.error(`❌ ${msg} — esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(actual)}`) }
}

function cuenta(nombre: string, v: Partial<Record<ClaveMoneda, number>>): Saldo {
  return {
    cuenta_cte: nombre,
    saldo_dolares: v.saldo_dolares ?? 0, saldo_pesos: v.saldo_pesos ?? 0,
    saldo_euros: v.saldo_euros ?? 0, saldo_reales: v.saldo_reales ?? 0,
    saldo_usdt: v.saldo_usdt ?? 0, ultimo_movimiento: '2026-09-01',
  }
}

// Cartera armada a mano, con los casos que importan:
//   DEUDOR    debe y nada más
//   ACREEDOR  tiene a favor y nada más
//   MIXTA     debe dólares y tiene pesos a favor → sale en las DOS solapas
//   MIXTA2    al revés, y con decimales que no cierran redondo
//   USDT      moneda que solo existe en la app
//   EN CERO   se filtra antes de llegar a la pantalla; acá se incluye a propósito
const CARTERA: Saldo[] = [
  cuenta('DEUDOR',   { saldo_dolares: 1000, saldo_pesos: 500_000 }),
  cuenta('ACREEDOR', { saldo_dolares: -400, saldo_pesos: -120_000 }),
  cuenta('MIXTA',    { saldo_dolares: 2500, saldo_pesos: -80_000 }),
  cuenta('MIXTA2',   { saldo_dolares: -75.55, saldo_pesos: 33_333.33, saldo_euros: 12.5 }),
  cuenta('USDT',     { saldo_usdt: 900, saldo_dolares: -50 }),
  cuenta('EN CERO',  {}),
]

const sub = (saldos: Saldo[], modo: 'todas' | 'favor' | 'contra', busca = '') =>
  subtotales(filtrarPorLado(saldos, LADO[modo], busca), LADO[modo])

console.log('── Cartera de prueba ────────────────────────────────────────')

// ── 1. Las tarjetas: nos deben + le debemos = neto, moneda por moneda ──
{
  for (const p of posicionPorMoneda(CARTERA)) {
    assertCasi(p.favor + p.contra, p.neto, `Tarjeta ${p.label}: nos deben + le debemos = neto`)
  }
}

// ── 2. Valores esperados, calculados a mano sobre la cartera de arriba ──
{
  const p = posicionPorMoneda(CARTERA)
  const dol = p.find(x => x.key === 'saldo_dolares')!
  const pes = p.find(x => x.key === 'saldo_pesos')!
  assertCasi(dol.favor, 3500, 'Dólares: nos deben 3.500 (1.000 + 2.500)')
  assertCasi(dol.contra, -525.55, 'Dólares: le debemos 525,55 (400 + 75,55 + 50)')
  assertCasi(dol.neto, 2974.45, 'Dólares: neto 2.974,45')
  assertCasi(pes.favor, 533_333.33, 'Pesos: nos deben 533.333,33')
  assertCasi(pes.contra, -200_000, 'Pesos: le debemos 200.000')
  assertCasi(pes.neto, 333_333.33, 'Pesos: neto 333.333,33')
}

// ── 3. LA PRUEBA QUE IMPORTA: el subtotal de cada solapa = su tarjeta ──
// Es el error que ya se cometió una vez. Si "Nos deben" vuelve a arrastrar las patas
// negativas de las mixtas, este bloque lo agarra.
{
  const p = posicionPorMoneda(CARTERA)
  const sFavor = sub(CARTERA, 'favor'), sContra = sub(CARTERA, 'contra'), sTodas = sub(CARTERA, 'todas')
  for (const m of p) {
    assertCasi(sFavor[m.key], m.favor,  `Solapa "Nos deben" ${m.label}: subtotal = tarjeta`)
    assertCasi(sContra[m.key], m.contra, `Solapa "Le debemos" ${m.label}: subtotal = tarjeta`)
    assertCasi(sTodas[m.key], m.neto,   `Solapa "Todas" ${m.label}: subtotal = neto`)
  }
}

// ── 4. Las tres solapas cierran: nos deben + le debemos = todas ──
{
  const f = sub(CARTERA, 'favor'), c = sub(CARTERA, 'contra'), t = sub(CARTERA, 'todas')
  for (const m of MONEDAS) {
    assertCasi(f[m.key] + c[m.key], t[m.key], `${m.label}: "nos deben" + "le debemos" = "todas"`)
  }
}

// ── 5. Cada solapa muestra SOLO su signo ──
{
  for (const s of filtrarPorLado(CARTERA, 1)) {
    for (const m of MONEDAS) {
      const v = val(s, m.key)
      if (v < 0) assertCasi(subtotales([s], 1)[m.key], 0, `"Nos deben" oculta el saldo negativo de ${s.cuenta_cte} en ${m.label}`)
    }
  }
  for (const s of filtrarPorLado(CARTERA, -1)) {
    for (const m of MONEDAS) {
      const v = val(s, m.key)
      if (v > 0) assertCasi(subtotales([s], -1)[m.key], 0, `"Le debemos" oculta el saldo positivo de ${s.cuenta_cte} en ${m.label}`)
    }
  }
}

// ── 6. Las mixtas aparecen en las dos solapas, y las puras en una sola ──
{
  const enFavor = filtrarPorLado(CARTERA, 1).map(s => s.cuenta_cte)
  const enContra = filtrarPorLado(CARTERA, -1).map(s => s.cuenta_cte)
  assertIgual(enFavor.includes('MIXTA') && enContra.includes('MIXTA'), true, 'MIXTA sale en las dos solapas')
  assertIgual(enFavor.includes('MIXTA2') && enContra.includes('MIXTA2'), true, 'MIXTA2 sale en las dos solapas')
  assertIgual(enFavor.includes('DEUDOR'), true, 'DEUDOR sale en "Nos deben"')
  assertIgual(enContra.includes('DEUDOR'), false, 'DEUDOR no sale en "Le debemos"')
  assertIgual(enContra.includes('ACREEDOR'), true, 'ACREEDOR sale en "Le debemos"')
  assertIgual(enFavor.includes('ACREEDOR'), false, 'ACREEDOR no sale en "Nos deben"')
  assertIgual(esMixta(CARTERA.find(s => s.cuenta_cte === 'MIXTA')!), true, 'MIXTA se marca como mixta (⇄)')
  assertIgual(esMixta(CARTERA.find(s => s.cuenta_cte === 'DEUDOR')!), false, 'DEUDOR no se marca como mixta')
}

// ── 7. Las cuentas en cero no entran en ninguna solapa ──
{
  for (const modo of ['todas', 'favor', 'contra'] as const) {
    const nombres = filtrarPorLado(CARTERA, LADO[modo]).map(s => s.cuenta_cte)
    assertIgual(nombres.includes('EN CERO'), false, `"EN CERO" no aparece en "${modo}"`)
  }
}

// ── 8. El conteo de filas: mixtas + puras, sin perder ni duplicar cuentas ──
{
  const conSaldo = CARTERA.filter(s => MONEDAS.some(m => val(s, m.key) !== 0))
  const nF = filtrarPorLado(CARTERA, 1).length
  const nC = filtrarPorLado(CARTERA, -1).length
  const nM = conSaldo.filter(esMixta).length
  assertIgual(nF + nC - nM, conSaldo.length, 'Cuentas: |nos deben| + |le debemos| − |mixtas| = |todas|')
}

// ── 9. El buscador filtra sin romper la aritmética de lo que queda ──
{
  const f = sub(CARTERA, 'favor', 'mixta'), c = sub(CARTERA, 'contra', 'mixta'), t = sub(CARTERA, 'todas', 'mixta')
  for (const m of MONEDAS) {
    assertCasi(f[m.key] + c[m.key], t[m.key], `Buscando "mixta" — ${m.label}: los subtotales siguen cerrando`)
  }
  assertIgual(filtrarPorLado(CARTERA, 0, 'mixta').length, 2, 'Buscando "mixta" quedan 2 cuentas')
  assertIgual(filtrarPorLado(CARTERA, 0, 'MiXtA').length, 2, 'El buscador no distingue mayúsculas')
}

// ── 10. Ordenar no cambia el subtotal: son las mismas filas en otro orden ──
{
  for (const modo of ['todas', 'favor', 'contra'] as const) {
    const lado = LADO[modo]
    const filas = filtrarPorLado(CARTERA, lado)
    const base = subtotales(filas, lado)
    for (const col of ['cuenta_cte', 'saldo_dolares', 'ultimo_movimiento'] as const) {
      for (const dir of [1, -1] as const) {
        const t = subtotales(ordenarPor(filas, col, dir, lado), lado)
        const igual = MONEDAS.every(m => Math.abs(t[m.key] - base[m.key]) < EPS)
        assertIgual(igual, true, `Ordenar por ${col} (${dir > 0 ? 'asc' : 'desc'}) en "${modo}" no cambia el subtotal`)
        assertIgual(ordenarPor(filas, col, dir, lado).length, filas.length, `Ordenar por ${col} en "${modo}" no pierde filas`)
      }
    }
  }
}

// ── 11. 500 carteras al azar ─────────────────────────────────────────────
// Los casos escritos a mano prueban lo que uno ya pensó. Esto prueba lo que no: carteras
// de hasta 40 cuentas con signos, ceros y decimales arbitrarios. Si alguna combinación
// rompe la aritmética, sale acá.
{
  let rotas = 0
  let mixtasVistas = 0
  // Generador con semilla fija: si una corrida falla, la siguiente falla igual y se puede
  // depurar. Con Math.random el error aparece y desaparece.
  let semilla = 20260908
  const rnd = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648
    return semilla / 2147483648
  }
  for (let n = 0; n < 500; n++) {
    const cartera: Saldo[] = []
    for (let i = 0; i < 1 + Math.floor(rnd() * 40); i++) {
      const v: Partial<Record<ClaveMoneda, number>> = {}
      for (const m of MONEDAS) {
        const r = rnd()
        // Un tercio de los saldos queda en cero, que es lo habitual en la cartera real.
        v[m.key] = r < 0.33 ? 0 : Math.round((rnd() - 0.5) * 2_000_000) / 100
      }
      cartera.push(cuenta(`C${i}`, v))
    }
    const conSaldo = cartera.filter(s => MONEDAS.some(m => val(s, m.key) !== 0))
    mixtasVistas += conSaldo.filter(esMixta).length
    const p = posicionPorMoneda(cartera)
    const f = sub(cartera, 'favor'), c = sub(cartera, 'contra'), t = sub(cartera, 'todas')
    for (const m of p) {
      const cierra =
        Math.abs(f[m.key] - m.favor) < EPS &&
        Math.abs(c[m.key] - m.contra) < EPS &&
        Math.abs(t[m.key] - m.neto) < EPS &&
        Math.abs(f[m.key] + c[m.key] - t[m.key]) < EPS
      if (!cierra) {
        rotas++
        console.error(`   cartera #${n}, ${m.label}: tarjeta ${m.favor}/${m.contra}/${m.neto} vs subtotales ${f[m.key]}/${c[m.key]}/${t[m.key]}`)
        break
      }
    }
  }
  assertIgual(rotas, 0, `500 carteras al azar: los subtotales cierran en todas (${mixtasVistas} cuentas mixtas probadas)`)
}

console.log(`\n${ok} OK, ${fail} fallidas`)
process.exit(fail > 0 ? 1 : 0)
