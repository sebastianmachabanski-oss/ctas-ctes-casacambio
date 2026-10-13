/**
 * Validador del alta de transferencias completas (`src/lib/transferencia.ts`).
 *
 *   npx tsx scripts/validar-transferencia.mts
 *
 * No toca la base. Comprueba además que las dos patas que se arman caigan en las columnas
 * correctas del motor de cálculo, con el signo correcto — hacer eso a mano ya produjo un
 * signo invertido antes (1/9/2026).
 */
import { armarTransferencia, validarTransferencia, gananciaDe, gananciaNegativa,
         type EntradaTransferencia } from '../src/lib/transferencia'
import { calcularMovimiento } from '../src/lib/motor-calculo'

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

const base = (p: Partial<EntradaTransferencia> = {}): EntradaTransferencia => ({
  fecha: '2026-10-13',
  referencia: 'BOH - GRA',
  moneda: 'DOLARES',
  entra: { participante: 'BOH X TT', monto: 10_000 },
  sale: { participante: 'GRA X TT', monto: 9_800 },
  ...p,
})

// ── 1. El caso normal ───────────────────────────────────────────────────────
{
  const e = base()
  asert('1a · no hay nada que corregir', validarTransferencia(e) === null)
  igual('1b · la ganancia es lo que entra menos lo que sale', gananciaDe(e), 200)
  asert('1c · no es negativa', !gananciaNegativa(e))

  const { patas } = armarTransferencia(e)
  asert('1d · se arman dos patas', patas.length === 2)
  asert('1e · la primera INGRESA', patas[0].operacion === 'INGRESAN')
  asert('1f · la segunda EGRESA', patas[1].operacion === 'EGRESAN')
  asert('1g · las dos son de CAJA', patas.every(p => p.tipo === 'CAJA'))
  asert('1h · misma moneda en propio y externo', patas.every(p => p.propio === p.externo))
  asert('1i · cada pata lleva su participante',
    patas[0].cliente === 'BOH X TT' && patas[1].cliente === 'GRA X TT')
}

// ── 2. El impacto en caja lo calcula el MOTOR, y con el signo correcto ──────
//     Es el control que importa: un signo invertido acá se lleva puesta la caja.
{
  const { patas } = armarTransferencia(base())
  const impacto = patas.map(p => calcularMovimiento({
    tipo: p.tipo, operacion: p.operacion, propio: p.propio, externo: p.externo,
    monto: p.monto, cotizacion: null, costoPorcentaje: null,
  }).valores)

  igual('2a · lo que entra suma en DOLARES', Number(impacto[0]['DOLARES']), 10_000)
  igual('2b · lo que sale resta en DOLARES', Number(impacto[1]['DOLARES']), -9_800)
  igual('2c · la suma de las dos patas es la ganancia',
    Number(impacto[0]['DOLARES']) + Number(impacto[1]['DOLARES']), 200)
  // Siendo CAJA, no debe tocar ninguna cuenta corriente.
  igual('2d · no toca cc_pesos', Number(impacto[0]['CC PESOS'] ?? 0), 0)
  igual('2e · no toca cc_dolares', Number(impacto[0]['CC DOLARES'] ?? 0), 0)
  igual('2f · tampoco la pata que sale', Number(impacto[1]['CC DOLARES'] ?? 0), 0)
}

// ── 3. Otras monedas ────────────────────────────────────────────────────────
{
  for (const [moneda, col] of [['PESOS', 'PESOS'], ['EUROS', 'EUROS'], ['REALES', 'REALES']]) {
    const { patas } = armarTransferencia(base({ moneda }))
    const v = calcularMovimiento({
      tipo: patas[0].tipo, operacion: patas[0].operacion, propio: patas[0].propio,
      externo: patas[0].externo, monto: patas[0].monto, cotizacion: null, costoPorcentaje: null,
    }).valores
    igual(`3 · ${moneda} impacta en su columna`, Number(v[col]), 10_000)
  }
}

// ── 4. La referencia es obligatoria: sin ella las patas no se parean ───────
{
  asert('4a · referencia vacía', validarTransferencia(base({ referencia: '' })) !== null)
  asert('4b · referencia solo espacios', validarTransferencia(base({ referencia: '   ' })) !== null)
}

// ── 5. El resto de lo obligatorio ──────────────────────────────────────────
{
  asert('5a · sin fecha', validarTransferencia(base({ fecha: '' })) !== null)
  asert('5b · sin moneda', validarTransferencia(base({ moneda: '' })) !== null)
  asert('5c · sin quien entrega',
    validarTransferencia(base({ entra: { participante: '', monto: 100 } })) !== null)
  asert('5d · sin quien recibe',
    validarTransferencia(base({ sale: { participante: '', monto: 100 } })) !== null)
  asert('5e · monto que entra en cero',
    validarTransferencia(base({ entra: { participante: 'X', monto: 0 } })) !== null)
  asert('5f · monto que sale negativo',
    validarTransferencia(base({ sale: { participante: 'X', monto: -5 } })) !== null)
}

// ── 6. Sale más de lo que entra: se SEÑALA, no se rechaza ──────────────────
//     "El ingreso siempre mayor o igual al egreso, si no no hay negocio". Es una señal
//     para que el operador confirme, no un error de carga: por eso `validar` la deja pasar
//     y es `gananciaNegativa` quien la marca.
{
  const e = base({ sale: { participante: 'GRA X TT', monto: 10_500 } })
  asert('6a · validar la deja pasar', validarTransferencia(e) === null)
  asert('6b · pero queda marcada como negativa', gananciaNegativa(e))
  igual('6c · con su importe', gananciaDe(e), -500)
}

// ── 7. Ingreso igual al egreso: válido, sin ganancia pero con negocio ──────
{
  const e = base({ sale: { participante: 'GRA X TT', monto: 10_000 } })
  asert('7a · no se marca como negativa', !gananciaNegativa(e))
  igual('7b · ganancia cero', gananciaDe(e), 0)
}

// ── 8. Se normaliza lo tipeado ─────────────────────────────────────────────
{
  const { patas } = armarTransferencia(base({
    moneda: 'dolares',
    entra: { participante: '  BOH X TT  ', monto: 10_000 },
  }))
  asert('8a · la moneda queda en mayúsculas', patas[0].propio === 'DOLARES')
  asert('8b · el participante sin espacios de sobra', patas[0].cliente === 'BOH X TT')
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
