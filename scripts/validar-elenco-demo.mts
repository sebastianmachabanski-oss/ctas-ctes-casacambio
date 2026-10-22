/**
 * Validador de la guarda que impide escribir datos ficticios en una base real.
 *
 *   npx tsx scripts/validar-elenco-demo.mts
 *
 * QUÉ PROTEGE
 * Tres scripts escriben datos inventados: las operaciones, el usuario del cliente y el
 * registro de auditoría. Apuntados a la base de un cliente, le mezclarían operaciones
 * falsas con las verdaderas — y en el caso de la auditoría, que es inmutable por diseño,
 * sin forma de sacarlas después.
 *
 * La bandera `--confirmo-que-es-una-base-de-demo` no alcanza: se tipea distraído, y para
 * cuando uno se da cuenta ya escribió. La defensa de verdad es `pareceBaseDeDemo()`, que
 * exige que TODAS las cuentas corrientes de la base sean del elenco inventado. Una base de
 * un cliente real no tiene a "ACME CAMBIOS", así que la comprobación no se pasa por error.
 *
 * EN QUÉ DIRECCIÓN TIENE QUE EQUIVOCARSE
 * Si duda, no escribe. Rechazar una base de demo por error cuesta un minuto de confusión;
 * aceptar una base real cuesta datos falsos mezclados con los del negocio. Por eso varias
 * pruebas de acá verifican que RECHACE, incluso en casos donde uno podría querer que pase.
 */
import { pareceBaseDeDemo, CUENTAS } from './elenco-demo'

let ok = 0
const fallas: string[] = []

/** `pareceBaseDeDemo` devuelve null cuando acepta, o el motivo del rechazo. */
function acepta(nombre: string, cuentas: string[]) {
  const r = pareceBaseDeDemo(cuentas)
  if (r === null) { ok++; return }
  fallas.push(`${nombre} — debía ACEPTAR y rechazó: ${r.split('\n')[0]}`)
}

function rechaza(nombre: string, cuentas: string[]) {
  const r = pareceBaseDeDemo(cuentas)
  if (r !== null) { ok++; return }
  fallas.push(`${nombre} — debía RECHAZAR y aceptó`)
}

// ── 1. La base de demostración se acepta ────────────────────────────────────
acepta('1a · el elenco completo', [...CUENTAS])
acepta('1b · el elenco repetido, como viene de la base', [...CUENTAS, ...CUENTAS, CUENTAS[0]])
acepta('1c · una sola cuenta del elenco', [CUENTAS[0]])

// ── 2. Diferencias de forma que no cambian el nombre ────────────────────────
//     La base guarda texto libre: vienen con espacios de más y en cualquier capitalización.
acepta('2a · con espacios alrededor', CUENTAS.map(c => `  ${c}  `))
acepta('2b · en minúsculas', CUENTAS.map(c => c.toLowerCase()))
acepta('2c · capitalización mezclada', CUENTAS.map((c, i) => i % 2 ? c.toLowerCase() : c))
acepta('2d · con filas vacías mezcladas', [...CUENTAS, '', '   '])

// ── 3. Una base con datos reales se rechaza ─────────────────────────────────
rechaza('3a · nombres de clientes reales', ['DISTRIBUIDORA SUR', 'TEXTIL ANDINA', 'M. GOMEZ'])
rechaza('3b · una sola cuenta ajena entre las del elenco', [...CUENTAS, 'DISTRIBUIDORA SUR'])
rechaza('3c · la cuenta ajena al principio', ['DISTRIBUIDORA SUR', ...CUENTAS])
rechaza('3d · una cuenta ajena entre MUCHAS del elenco',
  [...CUENTAS, ...CUENTAS, ...CUENTAS, 'EDY', ...CUENTAS])

// ── 4. Casos límite, todos hacia el lado seguro ─────────────────────────────
rechaza('4a · base sin ninguna cuenta', [])
rechaza('4b · base con solo filas vacías', ['', '   ', ''])
// Un nombre PARECIDO no es el mismo nombre. Si alcanzara con parecerse, una cuenta real
// que empiece igual que una del elenco abriría la puerta.
rechaza('4c · un nombre que contiene uno del elenco', [`${CUENTAS[0]} SRL`])
rechaza('4d · un nombre contenido en uno del elenco', ['ACME'])

// ── 5. El motivo del rechazo tiene que ser legible ──────────────────────────
//     Quien lo vea está a un paso de escribir en la base equivocada: el mensaje es lo
//     único que se lo va a decir.
{
  const r = pareceBaseDeDemo([...CUENTAS, 'DISTRIBUIDORA SUR'])
  const nombra = (r ?? '').includes('DISTRIBUIDORA SUR')
  if (nombra) ok++
  else fallas.push('5a · el motivo no nombra la cuenta que disparó el rechazo')

  const r2 = pareceBaseDeDemo([])
  const explica = (r2 ?? '').includes('sembrar-demo')
  if (explica) ok++
  else fallas.push('5b · el motivo de una base vacía no dice qué hacer')
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
