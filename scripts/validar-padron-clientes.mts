/**
 * Validador del padrón del filtro de clientes (`unirPadron`, en src/lib/consultas).
 *
 *   npx tsx scripts/validar-padron-clientes.mts
 *
 * No toca la base. Cubre el caso real del 12/11/2026: las cuentas PILO y PADDLE QUILMES
 * tenían movimientos a la vista en el listado, pero el filtro no las ofrecía y por lo
 * tanto "no encontraba" nada. El desplegable salía solo de `clientes`, que llena la
 * sincronización desde la planilla; una cuenta creada desde la app nunca pasaba por ahí.
 */
import { unirPadron } from '../src/lib/consultas/transacciones'

let ok = 0
const fallas: string[] = []

function asert(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok++; return }
  fallas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

// ── 1. EL CASO REAL: la cuenta existe pero no está en el padrón ─────────────
{
  const padron = ['EDY', 'LEVI', 'MATI CENT']
  const cuentas = ['EDY', 'LEVI', 'PILO', 'PADDLE QUILMES']
  const r = unirPadron(padron, cuentas)
  asert('1a · la cuenta que faltaba aparece', r.includes('PILO'))
  asert('1b · y la otra también', r.includes('PADDLE QUILMES'))
  asert('1c · sin perder las del padrón', r.includes('MATI CENT'))
  asert('1d · sin repetir las que están en las dos', r.filter(n => n === 'EDY').length === 1)
}

// ── 2. Clientes eventuales de CAJA: no son cuentas y tienen que quedar ──────
//     Son los que la planilla trae en la columna CLIENTE. Si el desplegable saliera solo
//     de `cuentas_corrientes` —que es la otra forma de "arreglarlo"— desaparecerían todos.
{
  const r = unirPadron(['S. NAVARRO', 'C. DOMINGUEZ'], ['EDY'])
  asert('2 · los eventuales sobreviven', r.includes('S. NAVARRO') && r.includes('C. DOMINGUEZ'))
}

// ── 3. El mismo nombre escrito distinto cuenta UNA vez ──────────────────────
//     Las dos tablas se llenaron por caminos distintos y el mismo nombre puede estar con
//     otra combinación de mayúsculas o con un espacio de más. Dos entradas que se leen
//     igual en la lista son indistinguibles para quien filtra.
{
  const r = unirPadron(['Pilo'], ['PILO', ' pilo '])
  asert('3a · queda una sola', r.length === 1, `quedaron ${r.length}: ${JSON.stringify(r)}`)
  // Gana la del padrón: es la que coincide carácter por carácter con lo guardado en los
  // movimientos, y el filtro compara por igualdad EXACTA. Elegir la otra daría una opción
  // en la lista que al usarse no trae nada — exactamente el error que esto arregla.
  asert('3b · y es la del padrón', r[0] === 'Pilo', `quedó "${r[0]}"`)
}

// ── 4. Nombres vacíos o de puro espacio no entran ───────────────────────────
{
  const r = unirPadron(['', '   ', 'EDY'], [''])
  asert('4 · se descartan', r.length === 1 && r[0] === 'EDY', JSON.stringify(r))
}

// ── 5. Orden alfabético en español ──────────────────────────────────────────
//     Con el orden del navegador por defecto, la Ñ cae después de la Z y "ÁVILA" se va al
//     final: en una lista de cientos de nombres, el que busca uno deja de encontrarlo.
{
  const r = unirPadron(['ZURITA', 'ÑANDU', 'ÁVILA', 'BENITEZ'], [])
  asert('5 · ÁVILA primero y ÑANDU antes de ZURITA',
    r[0] === 'ÁVILA' && r.indexOf('ÑANDU') < r.indexOf('ZURITA'), JSON.stringify(r))
}

// ── 6. Sin cuentas, el padrón queda como estaba ─────────────────────────────
//     Es el caso de una instalación donde todo viene de la planilla: no puede cambiar nada.
{
  const r = unirPadron(['BENITEZ', 'ALVAREZ'], [])
  asert('6 · solo se ordena', r.join('|') === 'ALVAREZ|BENITEZ', JSON.stringify(r))
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
