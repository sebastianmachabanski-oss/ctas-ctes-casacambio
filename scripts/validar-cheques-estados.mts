// Valida la máquina de estados del cheque.
// Uso: npx tsx scripts/validar-cheques-estados.mts
//
// QUÉ SE VERIFICA
// La máquina decide qué botones ve el operador y qué acepta la API, y desde el 27/11/2026
// además decide cuándo se mueve plata. Lo que se cuida:
//
//   1. Que los caminos reales del negocio existan: depósito, cobro por ventanilla,
//      acreditación bancaria, rechazo, endoso, devolución.
//   2. Que no se pueda llegar a ningún estado por un camino que no ocurrió. El caso que
//      lo motivó: antes había que marcar DEPOSITADO un cheque cobrado por ventanilla,
//      inventando un depósito en el historial.
//   3. Que deshacer un cobro devuelva el cheque DE DONDE VINO, no siempre al mismo lugar.
//   4. Que `esRiesgo` incluya los rechazados: el librador del que más hay que desconfiar
//      quedaba fuera de la alerta de concentración.

import {
  ESTADOS, TRANSICIONES, puedeIr, esTerminal, esActivo, esRiesgo, muevePlata,
  estadoAnterior, concentracionPorLibrador, type Estado, type Cheque,
} from '../src/lib/cheques'

let ok = 0
let fail = 0

function assert(cond: boolean, msg: string) {
  if (cond) { ok++; console.log(`✅ ${msg}`) }
  else { fail++; console.error(`❌ ${msg}`) }
}

function assertIgual<T>(actual: T, esperado: T, msg: string) {
  if (actual === esperado) { ok++; console.log(`✅ ${msg}`) }
  else { fail++; console.error(`❌ ${msg} — esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(actual)}`) }
}

const ev = (...estados: Estado[]) => estados.map(estado => ({ estado }))

// ── 1. Los caminos del negocio ────────────────────────────────────────────
{
  console.log('\n── Los caminos que una oficina usa de verdad ──')
  assert(puedeIr('en_cartera', 'depositado'), 'se puede depositar lo que está en cartera')
  assert(puedeIr('en_cartera', 'acreditado'), 'se puede cobrar por ventanilla, sin depositar')
  assert(puedeIr('en_cartera', 'endosado'), 'se puede endosar a un tercero')
  assert(puedeIr('en_cartera', 'devuelto'), 'se puede devolver al cliente')
  assert(puedeIr('depositado', 'acreditado'), 'el banco acredita')
  assert(puedeIr('depositado', 'rechazado'), 'o el cheque rebota')
  assert(puedeIr('rechazado', 'depositado'), 'un rechazado se puede reintentar')
  assert(puedeIr('rechazado', 'devuelto'), 'o devolver al cliente')
  assert(puedeIr('rechazado', 'incobrable'), 'o darlo por incobrable si nadie lo levanta')
  assert(puedeIr('incobrable', 'rechazado'), 'y la baja se puede deshacer')
}

// ── 2. Los caminos que NO pueden existir ──────────────────────────────────
{
  console.log('\n── Lo que no se puede hacer ──')
  assert(!puedeIr('en_cartera', 'rechazado'),
    'no rebota lo que nunca se presentó al banco')
  assert(!puedeIr('depositado', 'endosado'),
    'no se endosa un cheque que ya está en el banco')
  assert(!puedeIr('depositado', 'devuelto'),
    'ni se le devuelve al cliente un papel que no se tiene')
  assert(!puedeIr('devuelto', 'depositado'), 'lo devuelto no vuelve')
  assert(!puedeIr('endosado', 'depositado'), 'lo endosado tampoco')
  assert(!puedeIr('acreditado', 'rechazado'),
    'un cheque cobrado no puede rebotar después')
  assert(!puedeIr('en_cartera', 'incobrable'),
    'no se da por incobrable algo que nunca se presentó')
  assert(!puedeIr('depositado', 'incobrable'),
    'ni algo que todavía está en el banco: primero tiene que rebotar')
  assert(!puedeIr('incobrable', 'depositado') && !puedeIr('incobrable', 'devuelto'),
    'de la baja solo se vuelve al rechazo, que es de donde vino')

  // Nadie vuelve a su propio estado: sería un evento sin hecho detrás.
  for (const e of ESTADOS) assert(!puedeIr(e, e), `${e} no transiciona a sí mismo`)
}

// ── 3. Terminal, activo, riesgo y plata ───────────────────────────────────
{
  console.log('\n── Las clasificaciones ──')
  assert(esTerminal('endosado'), 'endosado es terminal')
  assert(esTerminal('devuelto'), 'devuelto es terminal')
  assert(!esTerminal('acreditado'),
    'acreditado NO es terminal: desde que mueve plata hay que poder deshacerlo')

  assert(esActivo('en_cartera') && esActivo('depositado'), 'la cartera son esos dos')
  assert(!esActivo('rechazado'), 'un rechazado no es cartera')
  assert(esRiesgo('rechazado'), 'pero SÍ es riesgo: la plata sigue afuera')
  assert(esRiesgo('en_cartera') && esRiesgo('depositado'), 'la cartera también es riesgo')
  assert(!esRiesgo('acreditado') && !esRiesgo('endosado') && !esRiesgo('devuelto'),
    'lo que salió del circuito ya no es riesgo')

  assert(muevePlata('acreditado'), 'acreditar mueve plata')
  assert(muevePlata('incobrable'), 'dar de baja un incobrable también')
  for (const e of ESTADOS) {
    if (e === 'acreditado' || e === 'incobrable') continue
    assert(!muevePlata(e), `${e} todavía no mueve plata`)
  }

  // Todo lo que mueve plata tiene que poder deshacerse, o un clic cuesta una corrección
  // a mano en la base.
  for (const e of ESTADOS) {
    if (muevePlata(e)) assert(!esTerminal(e), `${e} mueve plata y no es terminal`)
  }
}

// ── 4. Deshacer vuelve de donde vino ──────────────────────────────────────
{
  console.log('\n── Deshacer un cobro ──')
  assertIgual(
    estadoAnterior(ev('en_cartera', 'depositado', 'acreditado'), 'acreditado'),
    'depositado',
    'cobrado por banco: vuelve a depositado')
  assertIgual(
    estadoAnterior(ev('en_cartera', 'acreditado'), 'acreditado'),
    'en_cartera',
    'cobrado por ventanilla: vuelve a cartera, no inventa un depósito')
  assertIgual(
    estadoAnterior(ev('en_cartera', 'depositado', 'rechazado', 'depositado', 'acreditado'), 'acreditado'),
    'depositado',
    'con rechazo y reintento en el medio, vuelve al último depósito')
  assertIgual(
    estadoAnterior(ev('en_cartera'), 'acreditado'), null,
    'sin historial previo no se adivina')

  // Los dos destinos del deshacer tienen que ser transiciones válidas, o la API los
  // rechazaría después de que la pantalla los ofreció.
  assert(puedeIr('acreditado', 'depositado'), 'deshacer a depositado es válido')
  assert(puedeIr('acreditado', 'en_cartera'), 'deshacer a cartera es válido')

  // Y no puede haber un camino a `acreditado` cuyo regreso no exista.
  for (const e of ESTADOS) {
    if (!puedeIr(e, 'acreditado')) continue
    assert(puedeIr('acreditado', e), `se puede volver de acreditado a ${e}`)
  }
}

// ── 5. La concentración cuenta los rechazados ─────────────────────────────
{
  console.log('\n── Concentración por librador ──')
  const cheque = (importe: number, estado: Estado, librador: string): Cheque => ({
    id: `${librador}-${estado}-${importe}`, numero: '1', importe,
    fecha_pago: '2026-12-01', fecha_emision: null, estado, tipo: 'papel',
    librador, cuit_librador: null, banco: null, sucursal: null, cuenta: null,
    cmc7: null, id_echeq: null, archivo_url: null, notas: null, movimiento_id: 'op1',
  })

  // ACME tiene uno en cartera y uno rechazado. Si el rechazado no contara, su parte
  // daría 50 % en vez del 75 % real, y la alerta no se encendería donde más importa.
  const c = concentracionPorLibrador([
    cheque(100, 'en_cartera', 'ACME'),
    cheque(200, 'rechazado', 'ACME'),
    cheque(100, 'en_cartera', 'OTRO'),
  ])
  const acme = c.find(g => g.librador === 'ACME')!
  assertIgual(acme.importe, 300, 'el rechazado suma al riesgo del librador')
  assertIgual(acme.parte, 0.75, 'y la parte sale sobre el total en riesgo')
  assert(acme.excede, 'con 75 % excede el umbral de concentración')

  // Lo que ya salió del circuito no cuenta: cobrado es cobrado.
  const d = concentracionPorLibrador([
    cheque(100, 'en_cartera', 'ACME'),
    cheque(900, 'acreditado', 'ACME'),
    cheque(100, 'en_cartera', 'OTRO'),
  ])
  assertIgual(d.find(g => g.librador === 'ACME')!.importe, 100,
    'un cheque ya acreditado no suma riesgo')

  // Variantes de escritura sin CUIT: el mismo librador es un solo riesgo.
  const e = concentracionPorLibrador([
    cheque(100, 'en_cartera', 'ACME SA'),
    cheque(100, 'en_cartera', 'Acme S.A.'),
  ])
  assertIgual(e.length, 1, 'las variantes de escritura se agrupan')
}

console.log(`\n${ok} OK, ${fail} fallidas`)
process.exit(fail > 0 ? 1 : 0)
