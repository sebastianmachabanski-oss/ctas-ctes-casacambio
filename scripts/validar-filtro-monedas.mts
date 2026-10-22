/**
 * Validador del filtro por monedas del listado de transacciones.
 *
 *   npx tsx scripts/validar-filtro-monedas.mts
 *
 * QUÉ PRUEBA
 * Que `traerTransacciones` arme las condiciones correctas al filtrar por moneda propia y
 * por moneda externa. No consulta ninguna base: se le pasa un cliente FALSO que anota las
 * condiciones que le piden, y se revisa esa anotación.
 *
 * POR QUÉ ASÍ
 * El filtro se construye encadenando llamadas sobre el cliente de Supabase. Probarlo
 * contra una base de verdad exigiría credenciales, datos cargados y una base a mano; y
 * aun así, un filtro que no se aplica NO SE VE: la pantalla muestra filas de más, que es
 * exactamente lo que uno espera ver cuando no filtró bien. El error se confunde con el
 * uso normal.
 *
 * LO QUE MÁS IMPORTA ACÁ es el caso "sin externa". Las operaciones que no cambian una
 * moneda por otra —INGRESAN, EGRESAN, GASTOS— guardaron ese campo de dos maneras: `null`
 * en lo cargado desde la app y cadena vacía en parte de lo migrado. Un filtro que mire
 * una sola de las dos deja afuera media tabla sin avisar.
 */
import { traerTransacciones, SIN_EXTERNA } from '../src/lib/consultas/transacciones'

let ok = 0
const fallas: string[] = []

function asert(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok++; return }
  fallas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

/** Cliente falso: no consulta nada, solo anota qué condiciones le pidieron. */
function clienteFalso() {
  const condiciones: string[] = []
  const consulta: any = {
    select: () => consulta,
    neq: () => consulta,
    gte: () => consulta, lte: () => consulta, gt: () => consulta, lt: () => consulta,
    is: (col: string, val: any) => { condiciones.push(`is:${col}=${val}`); return consulta },
    eq: (col: string, val: any) => { condiciones.push(`eq:${col}=${val}`); return consulta },
    in: (col: string, val: any) => { condiciones.push(`in:${col}=${val}`); return consulta },
    ilike: (col: string, val: any) => { condiciones.push(`ilike:${col}=${val}`); return consulta },
    or: (expr: string) => { condiciones.push(`or:${expr}`); return consulta },
    order: () => consulta,
    range: () => consulta,
    then: (resolver: any) => resolver({ data: [], count: 0, error: null }),
  }
  const db: any = { from: () => consulta }
  return { db, condiciones }
}

async function condicionesDe(params: Record<string, string>) {
  const { db, condiciones } = clienteFalso()
  await traerTransacciones(db, params as any)
  return condiciones
}

const tiene = (cs: string[], aguja: string) => cs.some(c => c.includes(aguja))

// ── 1. Sin filtros, no se pide ninguna moneda ──────────────────────────────
{
  const c = await condicionesDe({})
  asert('1a · no filtra por moneda propia', !tiene(c, 'propio'))
  asert('1b · no filtra por moneda externa', !tiene(c, 'externo'))
}

// ── 2. Moneda propia ───────────────────────────────────────────────────────
{
  const c = await condicionesDe({ propio: 'DOLARES' })
  asert('2a · filtra por la moneda propia pedida', tiene(c, 'eq:propio=DOLARES'), c.join(' | '))
  asert('2b · sin tocar la moneda externa', !tiene(c, 'externo'))
}

// ── 3. Moneda externa ──────────────────────────────────────────────────────
{
  const c = await condicionesDe({ externo: 'EUROS' })
  asert('3a · filtra por la moneda externa pedida', tiene(c, 'eq:externo=EUROS'), c.join(' | '))
  asert('3b · sin tocar la moneda propia', !tiene(c, 'eq:propio'))
}

// ── 4. Las dos a la vez ────────────────────────────────────────────────────
//     Es como se busca un cambio concreto: "pesos por dólares".
{
  const c = await condicionesDe({ propio: 'PESOS', externo: 'DOLARES' })
  asert('4a · aplica la propia', tiene(c, 'eq:propio=PESOS'))
  asert('4b · y también la externa', tiene(c, 'eq:externo=DOLARES'))
}

// ── 5. "Sin externa": las dos formas de guardar el vacío ───────────────────
{
  const c = await condicionesDe({ externo: SIN_EXTERNA })
  const condicion = c.find(x => x.startsWith('or:') && x.includes('externo')) ?? ''
  asert('5a · contempla el nulo', condicion.includes('externo.is.null'), c.join(' | '))
  asert('5b · y la cadena vacía', condicion.includes('externo.eq.'), c.join(' | '))
  asert('5c · no lo busca como si fuera una moneda', !tiene(c, `eq:externo=${SIN_EXTERNA}`))
}

// ── 6. Tolerancia a la forma de lo escrito ─────────────────────────────────
//     Las monedas están guardadas en mayúsculas; el valor puede llegar de otra manera
//     desde la URL, escrito a mano.
{
  const c = await condicionesDe({ propio: ' dolares ' })
  asert('6a · normaliza espacios y minúsculas', tiene(c, 'eq:propio=DOLARES'), c.join(' | '))
  const c2 = await condicionesDe({ externo: '(sin)' })
  asert('6b · "sin externa" en minúsculas también funciona',
    tiene(c2, 'externo.is.null'), c2.join(' | '))
}

// ── 7. Los filtros de antes siguen funcionando ─────────────────────────────
//     Se agregaron condiciones a una consulta que ya tenía varias: lo que importa es que
//     convivan, no que la nueva ande sola.
{
  const c = await condicionesDe({ tipo: 'CAJA', op: 'COMPRA', propio: 'PESOS', externo: 'DOLARES' })
  asert('7a · el tipo sigue', tiene(c, 'eq:tipo=CAJA'))
  asert('7b · la operación sigue', tiene(c, 'eq:operacion=COMPRA'))
  asert('7c · conviven con las monedas', tiene(c, 'eq:propio=PESOS') && tiene(c, 'eq:externo=DOLARES'))
}

// ── 8. Lo elegido vuelve para que la pantalla lo muestre ───────────────────
//     Si no volviera, al recargar la página los desplegables aparecerían en "todas"
//     mientras el listado sigue filtrado: la pantalla mentiría sobre lo que muestra.
{
  const { db } = clienteFalso()
  const r = await traerTransacciones(db, { propio: 'dolares', externo: SIN_EXTERNA } as any)
  asert('8a · devuelve la moneda propia elegida', r.filtros.propio === 'DOLARES', r.filtros.propio)
  asert('8b · y la externa', r.filtros.externo === SIN_EXTERNA.toUpperCase(), r.filtros.externo)
}

console.log(fallas.length === 0
  ? `✅ ${ok} verificaciones OK`
  : `❌ ${fallas.length} falla(s) sobre ${ok + fallas.length}:\n  - ${fallas.join('\n  - ')}`)
process.exit(fallas.length === 0 ? 0 : 1)
