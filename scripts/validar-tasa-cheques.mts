// Valida la aritmética de la tasa de descuento de cheques.
// Uso: npx tsx scripts/validar-tasa-cheques.mts
//
// QUÉ SE VERIFICA
// La tasa es el número por el que una oficina que descuenta documentos decide una
// operación, así que no puede estar "aproximadamente bien". Lo que se cuida:
//
//   1. Que la directa y la efectiva no se confundan. Son dos números distintos sobre la
//      misma plata —12/100 y 12/88— y mostrarlos cruzados haría cotizar mal.
//   2. Que anualizar no invente números cuando el plazo es cero o el cheque está vencido:
//      ahí la tasa del período existe pero la anual no, y corresponde `null`, no 0.
//   3. Que la tasa de la cartera salga de los TOTALES y no del promedio de las tasas. Un
//      cheque de mil y uno de un millón no pueden pesar igual.
//   4. Que el prorrateo reparta exactamente lo pagado: ni un centavo de más ni de menos.
//
// Se prueba contra datos fabricados, no contra la base: lo que se valida es la aritmética,
// y para eso hacen falta casos límite que en la base pueden no estar. El último bloque
// genera 500 operaciones al azar para los que no se le ocurren a uno a mano.

import {
  calcularTasa, costoDeCheque, tasaDeCartera, plazoTexto, tasaTexto,
  DIAS_MES, DIAS_ANIO, type Origen,
} from '../src/lib/cheques-tasa'
import type { Cheque } from '../src/lib/cheques'

let ok = 0
let fail = 0

// Tolerancia de coma flotante, no de negocio.
const EPS = 1e-9

function assertCasi(actual: number | null, esperado: number, msg: string) {
  if (actual !== null && Math.abs(actual - esperado) < EPS) { ok++; console.log(`✅ ${msg}`) }
  else { fail++; console.error(`❌ ${msg} — esperado ${esperado}, dio ${actual}`) }
}

function assertIgual<T>(actual: T, esperado: T, msg: string) {
  if (actual === esperado) { ok++; console.log(`✅ ${msg}`) }
  else { fail++; console.error(`❌ ${msg} — esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(actual)}`) }
}

/** Un cheque mínimo: solo los campos que la tasa mira. */
function cheque(importe: number, fecha_pago: string, movimiento_id = 'op1'): Cheque {
  return {
    id: `c${importe}-${fecha_pago}`, numero: '1', importe, fecha_pago,
    fecha_emision: null, estado: 'en_cartera', tipo: 'papel',
    librador: null, cuit_librador: null, banco: null, sucursal: null, cuenta: null,
    cmc7: null, id_echeq: null, archivo_url: null, notas: null, movimiento_id,
  }
}

const origen = (id: string, fecha: string, nominal: number, pagado: number): Origen =>
  // `pesos` va en negativo, como lo guarda el movimiento de una compra.
  ({ id, fecha, cheques: nominal, pesos: -pagado })

// ── 1. El caso canónico ───────────────────────────────────────────────────
// Un cheque de $ 100 tomado en $ 88 a 30 días. Los números de este bloque son los que
// están explicados en el encabezado de `cheques-tasa.ts`.
{
  console.log('\n── Un cheque de 100 tomado en 88, a 30 días ──')
  const t = calcularTasa(100, 88, 30)!
  assertCasi(t.descuento, 12, 'el descuento es 12')
  assertCasi(t.directa, 0.12, 'la directa es 12 % (sobre el nominal)')
  assertCasi(t.efectiva, 12 / 88, 'la efectiva es 13,64 % (sobre lo pagado)')
  assertIgual(t.directa < t.efectiva, true, 'la directa siempre da menor que la efectiva')
  assertCasi(t.mensual, 0.12, 'a 30 días justos, la mensual coincide con la directa')
  assertCasi(t.tna!, (12 / 88) * (DIAS_ANIO / 30), 'la TNA escala la efectiva a 365 días')
  assertCasi(t.tea!, Math.pow(1 + 12 / 88, DIAS_ANIO / 30) - 1, 'la TEA capitaliza')
  assertIgual(t.tea! > t.tna!, true, 'la TEA da mayor que la TNA porque capitaliza')
}

// ── 2. El plazo escala lineal, no capitaliza ──────────────────────────────
{
  console.log('\n── El mismo descuento al doble de plazo ──')
  const a = calcularTasa(100, 88, 30)!
  const b = calcularTasa(100, 88, 60)!
  assertCasi(b.directa, a.directa, 'la tasa del período no cambia: es la misma plata')
  assertCasi(b.mensual!, a.mensual! / 2, 'la mensual se parte a la mitad al doble de plazo')
  assertCasi(b.tna!, a.tna! / 2, 'la TNA también, porque es lineal')
  assertIgual(b.tea! < a.tea!, true, 'la TEA baja: la misma ganancia tarda el doble')
}

// ── 3. Los bordes: sin plazo, vencido, y datos que no son un descuento ────
{
  console.log('\n── Bordes ──')
  const alDia = calcularTasa(100, 88, 0)!
  assertCasi(alDia.directa, 0.12, 'un cheque al día tiene tasa del período')
  assertIgual(alDia.mensual, null, 'pero no se puede anualizar: mensual en null, no en 0')
  assertIgual(alDia.tna, null, 'TNA en null')
  assertIgual(alDia.tea, null, 'TEA en null')

  const vencido = calcularTasa(100, 88, -10)!
  assertCasi(vencido.directa, 0.12, 'uno descontado después de vencido también tiene tasa')
  assertIgual(vencido.tna, null, 'y tampoco se anualiza')

  assertIgual(calcularTasa(0, 88, 30), null, 'sin nominal no hay documento')
  assertIgual(calcularTasa(100, 0, 30), null, 'sin plata entregada no es un descuento')
  assertIgual(calcularTasa(-100, 88, 30), null, 'un nominal negativo no es un cheque')

  // Pagar MÁS que el nominal es raro pero no imposible (un error de carga, o un cheque
  // tomado a la par con un cargo). Tiene que dar negativo, no null: es información.
  const sobre = calcularTasa(100, 110, 30)!
  assertIgual(sobre.descuento < 0, true, 'pagar de más da descuento negativo')
  assertIgual(sobre.directa < 0, true, 'y tasa negativa, que es lo que hay que ver')
}

// ── 4. El prorrateo reparte exactamente lo pagado ─────────────────────────
{
  console.log('\n── Una operación con tres cheques ──')
  const op = origen('op1', '2026-11-01', 300_000, 270_000)
  const cs = [
    cheque(100_000, '2026-12-01'),
    cheque(150_000, '2026-12-16'),
    cheque(50_000, '2027-01-15'),
  ]
  const costos = cs.map(c => costoDeCheque(c, op)!)
  const sumaPagado = costos.reduce((a, c) => a + c.tasa.pagado, 0)
  assertCasi(sumaPagado, 270_000, 'lo prorrateado suma exactamente lo pagado')

  const sumaDescuento = costos.reduce((a, c) => a + c.tasa.descuento, 0)
  assertCasi(sumaDescuento, 30_000, 'y los descuentos suman el descuento de la operación')

  assertIgual(costos.every(c => c.prorrateado), true, 'los tres quedan marcados como prorrateados')
  assertIgual(costos.every(c => Math.abs(c.tasa.directa - 0.1) < EPS), true,
    'con prorrateo por importe los tres comparten la directa de la operación')

  // El plazo SÍ los distingue, y por eso la mensual de cada uno es distinta aunque la
  // directa sea la misma. Es exactamente la limitación que documenta el prorrateo.
  assertIgual(costos[0].tasa.mensual! > costos[2].tasa.mensual!, true,
    'el que vence antes muestra mensual más alta: mismo descuento en menos días')

  const solo = costoDeCheque(cheque(300_000, '2026-12-01'), op)!
  assertIgual(solo.prorrateado, false, 'con un solo cheque que cubre la operación no hay prorrateo')
}

// ── 5. La cartera sale de los totales, no del promedio de tasas ───────────
{
  console.log('\n── Cartera: totales contra promedio de porcentajes ──')
  // Un cheque chico muy caro y uno grande barato. El promedio simple de las dos tasas
  // daría ~17,5 %; la respuesta correcta está pegada a la del cheque grande.
  const origenes = new Map<string, Origen>([
    ['chico', origen('chico', '2026-11-01', 1_000, 700)],       // 30 % directa
    ['grande', origen('grande', '2026-11-01', 1_000_000, 950_000)], // 5 % directa
  ])
  const cs = [
    cheque(1_000, '2026-12-01', 'chico'),
    cheque(1_000_000, '2026-12-01', 'grande'),
  ]
  const cartera = tasaDeCartera(cs, origenes, '2026-11-01')!

  assertCasi(cartera.nominal, 1_001_000, 'el nominal es la suma de los dos')
  assertCasi(cartera.pagado, 950_700, 'lo pagado también')
  assertCasi(cartera.directa, 50_300 / 1_001_000, 'la directa sale de los totales')

  const promedioSimple = (0.30 + 0.05) / 2
  assertIgual(Math.abs(cartera.directa - promedioSimple) > 0.1, true,
    'y NO es el promedio simple de las dos tasas')
  assertIgual(cartera.directa < 0.06, true, 'queda pegada a la del cheque grande, que es lo correcto')
  assertIgual(cartera.cheques, 2, 'contó los dos')
  assertIgual(cartera.sinCosto, 0, 'ninguno quedó sin costo')
}

// ── 6. El plazo de la cartera se mide desde hoy, ponderado por nominal ────
{
  console.log('\n── Plazo de la cartera ──')
  const origenes = new Map<string, Origen>([['op1', origen('op1', '2026-11-01', 300_000, 285_000)]])
  const cs = [
    cheque(100_000, '2026-12-01'),  // 30 días desde el 1/11
    cheque(200_000, '2026-12-31'),  // 60 días desde el 1/11
  ]
  const cartera = tasaDeCartera(cs, origenes, '2026-11-01')!
  // (30×100.000 + 60×200.000) / 300.000 = 50
  assertCasi(cartera.dias, 50, 'el plazo se pondera por nominal, no por cantidad de cheques')

  // Un mes después, a los mismos cheques les falta 30 días menos.
  const masTarde = tasaDeCartera(cs, origenes, '2026-12-01')!
  assertCasi(masTarde.dias, 20, 'medido desde hoy, el plazo baja con el tiempo')
  assertCasi(masTarde.directa, cartera.directa, 'pero la tasa del período no cambia: ya se pactó')

  // Ya vencidos los dos: aportan plazo cero, no negativo.
  const vencidos = tasaDeCartera(cs, origenes, '2027-03-01')!
  assertCasi(vencidos.dias, 0, 'un cheque vencido aporta plazo cero, no negativo')
  assertIgual(vencidos.tna, null, 'con plazo cero la cartera no se anualiza')
}

// ── 7. Cheques sin operación: se cuentan aparte, no se inventan ───────────
{
  console.log('\n── Cheques sin costo conocido ──')
  const origenes = new Map<string, Origen>([['op1', origen('op1', '2026-11-01', 100_000, 90_000)]])
  const cs = [
    cheque(100_000, '2026-12-01', 'op1'),
    cheque(500_000, '2026-12-01', 'huerfano'),
  ]
  const cartera = tasaDeCartera(cs, origenes, '2026-11-01')!
  assertIgual(cartera.cheques, 1, 'solo se cuenta el que tiene operación')
  assertIgual(cartera.sinCosto, 1, 'el otro se informa aparte')
  assertCasi(cartera.nominal, 100_000, 'el huérfano no entra al nominal: diluiría la tasa')

  assertIgual(costoDeCheque(cs[0], null), null, 'sin operación no hay costo')
  assertIgual(tasaDeCartera([], new Map(), '2026-11-01'), null, 'una cartera vacía no tiene tasa')
  assertIgual(tasaDeCartera([cs[1]], origenes, '2026-11-01'), null,
    'si ninguno tiene costo, la cartera no tiene tasa')
}

// ── 8. Los textos ─────────────────────────────────────────────────────────
{
  console.log('\n── Textos ──')
  assertIgual(tasaTexto(0.12), '12,00 %', 'la tasa va en formato argentino')
  assertIgual(tasaTexto(null), '—', 'una tasa que no se puede calcular no se inventa')
  assertIgual(plazoTexto(45), 'a 45 días', 'plazo en días')
  assertIgual(plazoTexto(1), 'a 1 día', 'singular')
  assertIgual(plazoTexto(0), 'al día', 'un cheque al día')
  assertIgual(plazoTexto(-1), 'vencido hace 1 día', 'vencido, singular')
  assertIgual(plazoTexto(-8), 'vencido hace 8 días', 'vencido, plural')
}

// ── 9. 500 operaciones al azar ────────────────────────────────────────────
{
  console.log('\n── 500 operaciones al azar ──')
  let rotas = 0
  let conProrrateo = 0

  // Generador con semilla fija: una corrida que falla se puede repetir.
  let semilla = 20261127
  const azar = () => {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff
    return semilla / 0x7fffffff
  }

  for (let n = 0; n < 500; n++) {
    const cuantos = 1 + Math.floor(azar() * 5)
    const cs: Cheque[] = []
    let nominal = 0
    for (let i = 0; i < cuantos; i++) {
      const importe = Math.round((5_000 + azar() * 2_000_000) * 100) / 100
      const dias = Math.floor(azar() * 180)
      const f = new Date(Date.UTC(2026, 10, 1))
      f.setUTCDate(f.getUTCDate() + dias)
      cs.push(cheque(importe, f.toISOString().slice(0, 10)))
      nominal += importe
    }
    // Descuento de entre 0,5 % y 25 % del nominal.
    const pagado = Math.round(nominal * (1 - (0.005 + azar() * 0.245)) * 100) / 100
    const op = origen('op1', '2026-11-01', nominal, pagado)

    const costos = cs.map(c => costoDeCheque(c, op))
    if (costos.some(c => c === null)) { rotas++; continue }
    if (cuantos > 1) conProrrateo++

    // La invariante del prorrateo: lo repartido es lo pagado.
    const suma = costos.reduce((a, c) => a + c!.tasa.pagado, 0)
    if (Math.abs(suma - pagado) > 1e-6) {
      rotas++
      console.error(`   operación #${n}: prorrateo suma ${suma}, se pagó ${pagado}`)
      continue
    }

    // La invariante de las dos tasas: la directa nunca llega a la efectiva.
    for (const c of costos) {
      if (!(c!.tasa.directa < c!.tasa.efectiva)) {
        rotas++
        console.error(`   operación #${n}: directa ${c!.tasa.directa} no es menor que efectiva ${c!.tasa.efectiva}`)
        break
      }
    }

    // La cartera de esta operación tiene que dar la misma tasa del período que la
    // operación entera: es la misma plata mirada de dos maneras.
    const cartera = tasaDeCartera(cs, new Map([['op1', op]]), '2026-11-01')
    if (!cartera || Math.abs(cartera.directa - (nominal - pagado) / nominal) > 1e-9) {
      rotas++
      console.error(`   operación #${n}: la cartera no reproduce la directa de la operación`)
    }
  }

  assertIgual(rotas, 0, `500 operaciones al azar cierran (${conProrrateo} con prorrateo)`)
}

console.log(`\n${ok} OK, ${fail} fallidas`)
process.exit(fail > 0 ? 1 : 0)
