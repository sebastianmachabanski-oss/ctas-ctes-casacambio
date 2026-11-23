// Valida la aritmética de la cartera de cheques.
// Uso: npx tsx scripts/validar-cheques.mts
//
// QUÉ SE VERIFICA
// Las tres cuentas que la pantalla no puede mostrar mal sin que se note tarde:
//
//   1. La MÁQUINA DE ESTADOS. La pantalla ofrece como botones lo que esta tabla permite y
//      el servidor rechaza lo que no. Si se abriera un camino de más, se podría depositar
//      un cheque ya acreditado; si se cerrara uno, un rechazo no se podría reintentar.
//
//   2. Los CUATRO NÚMEROS de arriba. Son los que miran todos los días, y el borde
//      —vence hoy contra vence esta semana— es donde un error pasa desapercibido: los dos
//      números siguen pareciendo razonables mientras uno cuenta de más.
//
//   3. La CONCENTRACIÓN por librador. Si agrupa mal, las partes no suman el total y la
//      alerta del 20 % nunca se enciende, que es justo lo contrario de lo que se quiere.
//
// Se prueba contra datos fabricados, no contra la base: lo que se valida es la cuenta, y
// para eso hacen falta casos límite que en la base pueden no estar.

import {
  TRANSICIONES, puedeIr, esTerminal, esActivo, ESTADOS,
  resumenCartera, concentracionPorLibrador, UMBRAL_CONCENTRACION,
  diasHasta, textoVencimiento, sumarDias, vencidoSinDepositar,
  validarChequesDelAlta, sumaDeCheques, chequeNuevoVacio,
  type Cheque, type Estado, type ChequeNuevo,
} from '../src/lib/cheques'
import {
  problemaDelArchivo, rutaDeArchivo, esPdf, TAMANO_MAXIMO,
} from '../src/lib/cheques-archivo'

let ok = 0, fail = 0
function assert(cond: boolean, msg: string) {
  if (cond) { ok++; console.log(`✅ ${msg}`) }
  else { fail++; console.error(`❌ ${msg}`) }
}
function igual(actual: unknown, esperado: unknown, msg: string) {
  const bien = JSON.stringify(actual) === JSON.stringify(esperado)
  if (bien) { ok++; console.log(`✅ ${msg}`) }
  else { fail++; console.error(`❌ ${msg} — esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(actual)}`) }
}

const HOY = '2026-11-22'

let n = 0
const cheque = (p: Partial<Cheque> & { fecha_pago: string }): Cheque => ({
  id: `c${++n}`, numero: `0000${n}`, importe: 1000,
  fecha_emision: null, estado: 'en_cartera', tipo: 'papel',
  librador: null, cuit_librador: null, banco: null, sucursal: null, cuenta: null,
  cmc7: null, id_echeq: null, archivo_url: null, notas: null, movimiento_id: 'm1',
  ...p,
})

// ── 1. La máquina de estados ──────────────────────────────────────────────
console.log('\n── Máquina de estados ──')

assert(puedeIr('en_cartera', 'depositado'), 'de cartera se puede depositar')
assert(puedeIr('depositado', 'acreditado'), 'un depositado se puede acreditar')
assert(puedeIr('depositado', 'rechazado'), 'un depositado puede rebotar')
assert(puedeIr('rechazado', 'depositado'), 'un rechazado se puede volver a depositar')
assert(puedeIr('rechazado', 'devuelto'), 'un rechazado se le puede devolver al cliente')

assert(!puedeIr('en_cartera', 'acreditado'), 'NO se acredita sin pasar por depositado')
assert(!puedeIr('en_cartera', 'rechazado'), 'NO rebota un cheque que nunca se depositó')
assert(!puedeIr('acreditado', 'depositado'), 'NO se deposita algo ya acreditado')
assert(!puedeIr('devuelto', 'depositado'), 'NO se deposita algo ya devuelto')
assert(!puedeIr('endosado', 'depositado'), 'NO se deposita algo endosado a un tercero')
assert(!puedeIr('en_cartera', 'en_cartera'), 'un estado no es transición a sí mismo')

for (const e of ['acreditado', 'endosado', 'devuelto'] as Estado[])
  assert(esTerminal(e), `${e} es terminal`)
for (const e of ['en_cartera', 'depositado', 'rechazado'] as Estado[])
  assert(!esTerminal(e), `${e} NO es terminal`)

// Ningún destino inventado: toda transición apunta a un estado que existe.
const destinosValidos = ESTADOS.every(e => TRANSICIONES[e].every(d => ESTADOS.includes(d)))
assert(destinosValidos, 'todas las transiciones apuntan a estados que existen')

igual(ESTADOS.filter(esActivo), ['en_cartera', 'depositado'],
  'solo cartera y depositado cuentan como cartera activa')

// ── 2. Fechas ─────────────────────────────────────────────────────────────
console.log('\n── Fechas ──')

igual(diasHasta(HOY, HOY), 0, 'hoy son 0 días')
igual(diasHasta('2026-11-25', HOY), 3, 'dentro de 3 días da 3')
igual(diasHasta('2026-11-14', HOY), -8, 'hace 8 días da -8')
igual(diasHasta('2026-12-05', HOY), 13, 'cruzando de mes sigue bien')
igual(textoVencimiento(HOY, HOY), 'hoy', 'el texto de hoy es "hoy"')
igual(textoVencimiento('2026-11-25', HOY), 'en 3 d', 'el texto a futuro')
igual(textoVencimiento('2026-11-14', HOY), 'hace 8 d', 'el texto a pasado')
igual(sumarDias(HOY, 7), '2026-11-29', 'sumar una semana')
igual(sumarDias('2026-12-28', 7), '2027-01-04', 'sumar cruzando de año')
// En Argentina no hay horario de verano desde 2009, pero el cálculo se hace al mediodía
// UTC justamente para que un cambio de huso no corra un día. Se prueba igual.
igual(sumarDias('2026-10-17', 1), '2026-10-18', 'sumar un día en octubre no corre la fecha')

// ── 3. Los cuatro números ─────────────────────────────────────────────────
console.log('\n── Resumen de la cartera ──')

const cartera: Cheque[] = [
  cheque({ fecha_pago: '2026-11-14', importe: 185_000 }),                        // vencido
  cheque({ fecha_pago: '2026-11-18', importe: 125_000 }),                        // vencido
  cheque({ fecha_pago: '2026-11-19', importe: 85_000, estado: 'rechazado' }),    // rechazado
  cheque({ fecha_pago: HOY, importe: 240_000 }),                                 // hoy
  cheque({ fecha_pago: HOY, importe: 95_000 }),                                  // hoy
  cheque({ fecha_pago: HOY, importe: 85_000 }),                                  // hoy
  cheque({ fecha_pago: '2026-11-29', importe: 160_000 }),                        // último de la semana
  cheque({ fecha_pago: '2026-11-30', importe: 999_000 }),                        // ya fuera de la semana
  cheque({ fecha_pago: '2026-11-20', importe: 275_000, estado: 'depositado' }),  // vencido PERO depositado
  cheque({ fecha_pago: '2026-11-21', importe: 500_000, estado: 'acreditado' }),  // fuera de cartera
]
const r = resumenCartera(cartera, HOY)

igual(r.vencenHoy, { cheques: 3, importe: 420_000 }, 'vencen hoy: 3 por 420.000')
igual(r.vencenSemana.cheques, 1, 'esta semana cuenta el día 29 y NO el 30')
igual(r.vencenSemana.importe, 160_000, 'esta semana suma solo ese')
assert(r.vencenHoy.cheques + r.vencenSemana.cheques === 4,
  'hoy y esta semana no se pisan: se pueden sumar')
igual(r.vencidosSinDepositar, { cheques: 2, importe: 310_000 }, 'vencidos sin depositar: 2 por 310.000')
igual(r.rechazados, { cheques: 1, importe: 85_000 }, 'rechazados: 1 por 85.000')

// El acreditado no está en cartera; el rechazado tampoco. El depositado sí.
igual(r.enCartera.cheques, 8, 'en cartera: los 7 de cartera más el depositado')
igual(r.enCartera.importe, 185_000 + 125_000 + 240_000 + 95_000 + 85_000 + 160_000 + 999_000 + 275_000,
  'el total en cartera suma los activos y nada más')

assert(!vencidoSinDepositar(cartera[8], HOY),
  'un vencido YA DEPOSITADO no cuenta como "vencido sin depositar"')
assert(vencidoSinDepositar(cartera[0], HOY), 'un vencido en cartera sí cuenta')

// Bordes exactos: el día 29 entra, el 30 no; ayer no es "hoy".
const bordes = resumenCartera([
  cheque({ fecha_pago: sumarDias(HOY, 7), importe: 1 }),
  cheque({ fecha_pago: sumarDias(HOY, 8), importe: 1 }),
  cheque({ fecha_pago: sumarDias(HOY, 1), importe: 1 }),
], HOY)
igual(bordes.vencenSemana.cheques, 2, 'la semana son los próximos 7 días; el 8.º queda afuera')
igual(bordes.vencenHoy.cheques, 0, 'ninguno de esos vence hoy')

// Cartera vacía: todo en cero, sin romperse.
const vacia = resumenCartera([], HOY)
igual([vacia.enCartera.cheques, vacia.vencenHoy.importe], [0, 0], 'una cartera vacía da todo en cero')

// ── 4. Concentración ──────────────────────────────────────────────────────
console.log('\n── Concentración por librador ──')

const porLibrador = concentracionPorLibrador([
  cheque({ fecha_pago: HOY, importe: 2_480_000, librador: 'Metalúrgica Paraná SA', cuit_librador: '30-1-1' }),
  cheque({ fecha_pago: HOY, importe: 1_615_000, librador: 'Distribuidora del Sur SRL', cuit_librador: '30-2-2' }),
  cheque({ fecha_pago: HOY, importe: 980_000, librador: 'Textil Rosario SA', cuit_librador: '30-3-3' }),
  cheque({ fecha_pago: HOY, importe: 925_000, librador: 'Logística Andina SRL', cuit_librador: '30-4-4' }),
  // Fuera de cartera: no debe entrar en el reparto.
  cheque({ fecha_pago: HOY, importe: 9_000_000, librador: 'Fantasma SA', estado: 'acreditado' }),
])

igual(porLibrador.length, 4, 'solo los libradores con cartera activa')
igual(porLibrador[0].librador, 'Metalúrgica Paraná SA', 'ordena de mayor a menor')
const suma = porLibrador.reduce((a, g) => a + g.parte, 0)
assert(Math.abs(suma - 1) < 1e-9, 'las partes suman exactamente el total de la cartera')
assert(porLibrador[0].excede, 'el que pasa el 20 % queda marcado')
assert(!porLibrador[2].excede, 'el que no lo pasa, no')
assert(porLibrador[0].parte > UMBRAL_CONCENTRACION, 'y su parte es, efectivamente, mayor al umbral')

// Mismo CUIT escrito con nombres distintos: UN solo riesgo.
const mismoCuit = concentracionPorLibrador([
  cheque({ fecha_pago: HOY, importe: 600, librador: 'ACME SA', cuit_librador: '30-9-9' }),
  cheque({ fecha_pago: HOY, importe: 400, librador: 'Acme S.A.', cuit_librador: '30-9-9' }),
])
igual([mismoCuit.length, mismoCuit[0].cheques, mismoCuit[0].importe], [1, 2, 1000],
  'dos cheques con el mismo CUIT son un solo librador')

// Sin CUIT, agrupa por nombre normalizado: la variante de tipeo no parte el riesgo.
const sinCuit = concentracionPorLibrador([
  cheque({ fecha_pago: HOY, importe: 600, librador: 'ACME SA' }),
  cheque({ fecha_pago: HOY, importe: 400, librador: 'Acme S.A.' }),
])
igual([sinCuit.length, sinCuit[0].cheques], [1, 2],
  'sin CUIT, "ACME SA" y "Acme S.A." siguen siendo el mismo librador')

// Sin librador cargado no se pierde: se agrupa aparte y se ve.
const anonimo = concentracionPorLibrador([cheque({ fecha_pago: HOY, importe: 100 })])
igual([anonimo.length, anonimo[0].librador], [1, 'Sin librador'],
  'un cheque sin librador aparece como "Sin librador"')

igual(concentracionPorLibrador([]).length, 0, 'una cartera vacía no tiene concentración')

// ── 5. La validación del alta ─────────────────────────────────────────────
// Es la que corren el formulario Y el servidor, con la misma definición. La regla que no
// se puede aflojar es la suma: dejarla pasar sería sembrar el descuadre que
// `cheques_descuadrados()` existe para encontrar.
console.log('\n── Alta de cheques ──')

const nuevo = (p: Partial<ChequeNuevo> = {}): ChequeNuevo => ({
  ...chequeNuevoVacio(),
  numero: '00012345', importe: 1000, fecha_pago: '2027-01-15',
  fecha_emision: '2026-11-20', librador: 'ACME SA', banco: 'Galicia',
  ...p,
})

igual(validarChequesDelAlta([nuevo()], 1000), null, 'un cheque que cierra pasa')
igual(validarChequesDelAlta([nuevo({ importe: 600 }), nuevo({ numero: 'B', importe: 400 })], 1000),
  null, 'dos cheques que suman el nominal pasan')

assert(validarChequesDelAlta([], 1000) !== null, 'sin cheques no pasa')
assert(validarChequesDelAlta([nuevo({ numero: '  ' })], 1000) !== null, 'sin número no pasa')
assert(validarChequesDelAlta([nuevo({ importe: 0 })], 0) !== null, 'importe cero no pasa')
assert(validarChequesDelAlta([nuevo({ importe: -5 })], -5) !== null, 'importe negativo no pasa')
assert(validarChequesDelAlta([nuevo({ fecha_pago: '' })], 1000) !== null, 'sin fecha de pago no pasa')
assert(validarChequesDelAlta([nuevo({ fecha_pago: '15/01/2027' })], 1000) !== null,
  'una fecha con otro formato no pasa')
assert(validarChequesDelAlta([nuevo({ fecha_emision: '2027-02-01' })], 1000) !== null,
  'emisión posterior al pago no pasa')

// El descuadre, que es el motivo de todo esto.
const descuadre = validarChequesDelAlta([nuevo({ importe: 999 })], 1000)
assert(descuadre !== null && descuadre.includes('999'),
  'si la suma no da el nominal, lo dice con los dos números')
igual(validarChequesDelAlta([nuevo({ importe: 1000.004 })], 1000), null,
  'medio centavo de punto flotante no se considera descuadre')

// Duplicado DENTRO de la misma operación: casi seguro una fila repetida por error.
assert(validarChequesDelAlta([nuevo({ importe: 500 }), nuevo({ importe: 500 })], 1000) !== null,
  'el mismo número y banco dos veces en la misma operación no pasa')
igual(validarChequesDelAlta(
  [nuevo({ importe: 500 }), nuevo({ importe: 500, banco: 'Nación' })], 1000), null,
  'el mismo número en bancos distintos sí pasa: pasa de verdad')

igual(sumaDeCheques([nuevo({ importe: 600 }), nuevo({ importe: 400 })]), 1000,
  'la suma de la lista es el nominal de la operación')
igual(sumaDeCheques([]), 0, 'una lista vacía suma cero')

// ── 6. La imagen del cheque ───────────────────────────────────────────────
console.log('\n── Imagen del cheque ──')

const archivo = (type: string, size = 1_000_000) => ({ type, size })

for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
  igual(problemaDelArchivo(archivo(t)), null, `${t} se acepta`)
assert(problemaDelArchivo(archivo('image/gif')) !== null, 'un GIF no se acepta')
assert(problemaDelArchivo(archivo('text/plain')) !== null, 'un texto plano no se acepta')
assert(problemaDelArchivo(archivo('video/mp4')) !== null, 'un video no se acepta')
assert(problemaDelArchivo(archivo('image/jpeg', TAMANO_MAXIMO + 1)) !== null,
  'un archivo que pasa el máximo no se acepta')
igual(problemaDelArchivo(archivo('image/jpeg', TAMANO_MAXIMO)), null,
  'justo en el máximo todavía entra')
assert(problemaDelArchivo(archivo('image/jpeg', 0)) !== null, 'un archivo vacío no se acepta')

// LA COMPROBACIÓN QUE IMPORTA: la ruta que genera el navegador tiene que pasar el
// filtro del servidor. Son dos archivos distintos y, si se separan, la imagen se sube
// bien al bucket y después la ficha la rechaza al guardarla — con el archivo ya subido.
const ES_RUTA_DEL_SERVIDOR = /^\d{4}\/\d{2}\/[A-Za-z0-9._-]+$/
for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']) {
  const r = rutaDeArchivo(t, new Date(Date.UTC(2026, 10, 23)))
  assert(ES_RUTA_DEL_SERVIDOR.test(r) && !r.includes('..'),
    `la ruta de un ${t} pasa el filtro del servidor (${r})`)
}
assert(rutaDeArchivo('application/pdf').endsWith('.pdf'), 'un PDF termina en .pdf')
assert(rutaDeArchivo('image/jpeg').endsWith('.jpg'), 'un JPEG termina en .jpg')
assert(rutaDeArchivo('image/jpeg', new Date(Date.UTC(2027, 0, 5))).startsWith('2027/01/'),
  'la ruta arranca con año y mes, con el mes en dos dígitos')

// Dos rutas seguidas no pueden coincidir: si coincidieran, la segunda subida pisaría a
// la primera y dos cheques compartirían imagen.
assert(rutaDeArchivo('image/jpeg') !== rutaDeArchivo('image/jpeg'), 'dos rutas nunca son iguales')

assert(esPdf('2026/11/abc.pdf'), 'reconoce un PDF')
assert(esPdf('2026/11/ABC.PDF'), 'lo reconoce con mayúsculas')
assert(!esPdf('2026/11/abc.jpg'), 'una foto no es un PDF')
assert(!esPdf(null), 'sin archivo no es un PDF')

// ── Final ─────────────────────────────────────────────────────────────────
console.log(`\n${ok} OK, ${fail} fallidas`)
process.exit(fail ? 1 : 0)
