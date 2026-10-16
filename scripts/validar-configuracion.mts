/**
 * Validador de la configuración por cliente (`src/lib/configuracion.ts`).
 *
 *   npx tsx scripts/validar-configuracion.mts
 *
 * Lo que más importa acá no es que apagar funcione, sino que NO APAGAR sea idéntico a
 * como estaba antes: si una instalación sin variables definidas perdiera una pantalla,
 * el cliente actual se quedaría sin ella de un día para el otro.
 *
 * El módulo lee la variable de entorno al importarse, así que cada escenario se prueba
 * en un proceso aparte. Importarlo una vez y cambiar `process.env` después no serviría:
 * el valor ya quedó resuelto.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const MOD = join(RAIZ, 'src/lib/configuracion.ts').replace(/\\/g, '/')

let ok = 0
const fallas: string[] = []

function asert(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok++; return }
  fallas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

/** Corre una expresión contra el módulo, con las variables de entorno dadas. */
function conEntorno(env: Record<string, string>, expr: string): string {
  const codigo = `import * as c from '${MOD}'; console.log(JSON.stringify(${expr}))`
  return execFileSync('npx', ['tsx', '--eval', codigo], {
    cwd: RAIZ,
    env: { ...process.env, NEXT_PUBLIC_MODULOS_OFF: '', NEXT_PUBLIC_APP_NOMBRE: '', ...env },
    encoding: 'utf8',
  }).trim()
}

const RUTAS_DE_MODULO = [
  '/dashboard/nueva-transferencia', '/dashboard/transferencias', '/dashboard/gastos',
  '/dashboard/calle', '/dashboard/deudores', '/dashboard/ganancias',
  '/dashboard/admin/auditoria',
]
const RUTAS_NUCLEO = [
  '/dashboard/inicio', '/dashboard/cuenta-corriente', '/dashboard/nueva-transaccion',
  '/dashboard/admin/usuarios', '/dashboard/mi-cuenta', '/dashboard',
]

// ── 1. SIN CONFIGURAR: todo prendido, nombre de siempre ─────────────────────
//     Es la comprobación que protege al cliente actual.
{
  const todas = [...RUTAS_DE_MODULO, ...RUTAS_NUCLEO]
  const r = JSON.parse(conEntorno({}, `[${todas.map(x => `c.rutaActiva('${x}')`).join(',')}]`))
  asert('1a · sin variables, todas las rutas quedan activas',
    r.every((x: boolean) => x === true), `activas ${r.filter(Boolean).length}/${todas.length}`)
  asert('1b · el nombre por defecto no cambia',
    JSON.parse(conEntorno({}, 'c.APP_NOMBRE')) === 'Mi Cuenta Corriente')
}

// ── 2. Apagar un módulo apaga TODAS sus rutas ───────────────────────────────
//     Transferencias tiene dos pantallas: el alta y el listado. Apagar una sola dejaría
//     la otra accesible y sería peor que no apagar nada.
{
  const r = JSON.parse(conEntorno({ NEXT_PUBLIC_MODULOS_OFF: 'transferencias' },
    `[c.rutaActiva('/dashboard/nueva-transferencia'), c.rutaActiva('/dashboard/transferencias'), c.rutaActiva('/dashboard/gastos')]`))
  asert('2a · se apaga el alta de transferencias', r[0] === false)
  asert('2b · y también su listado', r[1] === false)
  asert('2c · sin tocar los demás módulos', r[2] === true)
}

// ── 3. Varios módulos a la vez ──────────────────────────────────────────────
{
  const r = JSON.parse(conEntorno({ NEXT_PUBLIC_MODULOS_OFF: 'gastos,calle,ganancias' },
    `[c.rutaActiva('/dashboard/gastos'), c.rutaActiva('/dashboard/calle'), c.rutaActiva('/dashboard/ganancias'), c.rutaActiva('/dashboard/deudores')]`))
  asert('3a · los tres apagados', r.slice(0, 3).every((x: boolean) => x === false))
  asert('3b · el que no se nombró sigue prendido', r[3] === true)
}

// ── 4. El NÚCLEO no se puede apagar ─────────────────────────────────────────
//     Ni nombrándolo: sin Inicio ni Cuentas Corrientes no hay producto.
{
  const expr = `[${RUTAS_NUCLEO.map(x => `c.rutaActiva('${x}')`).join(',')}]`
  const r = JSON.parse(conEntorno({ NEXT_PUBLIC_MODULOS_OFF: 'inicio,cuenta-corriente,usuarios,nucleo' }, expr))
  asert('4 · el núcleo queda activo aunque se lo nombre', r.every((x: boolean) => x === true))
}

// ── 5. Tolerancia a lo mal escrito ──────────────────────────────────────────
//     Un error de tipeo en una variable de entorno no debe dejar la app sin arrancar.
{
  const r = JSON.parse(conEntorno({ NEXT_PUBLIC_MODULOS_OFF: '  GASTOS , , noexiste ,calle ' },
    `[c.rutaActiva('/dashboard/gastos'), c.rutaActiva('/dashboard/calle'), c.rutaActiva('/dashboard/ganancias')]`))
  asert('5a · ignora mayúsculas y espacios', r[0] === false)
  asert('5b · y los separadores vacíos', r[1] === false)
  asert('5c · un nombre inexistente no rompe nada', r[2] === true)
}

// ── 6. La marca ─────────────────────────────────────────────────────────────
{
  asert('6a · toma el nombre del cliente',
    JSON.parse(conEntorno({ NEXT_PUBLIC_APP_NOMBRE: 'Cambio Fulano' }, 'c.APP_NOMBRE')) === 'Cambio Fulano')
  asert('6b · un valor en blanco cae al nombre por defecto',
    JSON.parse(conEntorno({ NEXT_PUBLIC_APP_NOMBRE: '   ' }, 'c.APP_NOMBRE')) === 'Mi Cuenta Corriente')
}

// ── 7. Cada módulo declarado tiene al menos una ruta ────────────────────────
//     Un módulo sin rutas se podría "apagar" sin que pase nada: el menú lo escondería
//     pero la pantalla seguiría abierta. Esto lo detecta al agregar uno nuevo.
{
  const sinRuta = JSON.parse(conEntorno({},
    `c.MODULOS.filter(m => ![${[...RUTAS_DE_MODULO].map(x => `'${x}'`).join(',')}].some(r => c.moduloDeRuta(r) === m))`))
  asert('7 · todos los módulos tienen ruta', sinRuta.length === 0, `sin ruta: ${sinRuta.join(', ')}`)
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
