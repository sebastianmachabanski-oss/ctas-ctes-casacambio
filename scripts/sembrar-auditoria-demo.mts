/**
 * Llena el registro de auditoría de la base de DEMOSTRACIÓN.
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/sembrar-auditoria-demo.mts --confirmo-que-es-una-base-de-demo
 *
 * POR QUÉ HACE FALTA UN SCRIPT APARTE
 * El registro de auditoría no es una tabla que se llene junto con los movimientos: lo
 * escribe la APP cuando una persona hace algo. `sembrar-demo.mts` inserta directo contra
 * la base, así que deja la auditoría vacía — correcto, porque ahí nadie hizo nada.
 * El resultado es que la pantalla de Auditoría, que es de las que más tranquiliza a quien
 * evalúa el sistema, aparece en blanco justo cuando se la quiere mostrar.
 *
 * QUÉ INVENTA Y QUÉ NO
 * Las acciones son inventadas, igual que todo lo demás en esta base. Pero se construyen
 * SOBRE los movimientos que ya existen: cada alta apunta a un movimiento real de la base
 * de demo, con su fecha y su resumen. Un registro que no se corresponda con nada deja
 * preguntas incómodas en una demostración ("¿y ese movimiento dónde está?").
 *
 * ── LAS GUARDAS ────────────────────────────────────────────────────────────
 *   1. La bandera, escrita entera.
 *   2. Todas las cuentas de la base tienen que ser del elenco ficticio.
 *   3. La auditoría tiene que estar vacía. Es un registro INMUTABLE —un trigger bloquea
 *      UPDATE y DELETE— así que lo que se escriba mal no se puede sacar después.
 */
import { createClient } from '@supabase/supabase-js'
import { OPERADORES, CONCEPTOS_GASTO, pareceBaseDeDemo } from './elenco-demo'

const URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, '')
const KEY = (process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim()
const CONFIRMADO = process.argv.includes('--confirmo-que-es-una-base-de-demo')

function salir(msg: string): never { console.error(`❌ ${msg}`); process.exit(1) }

if (!URL || !KEY) salir('Faltan SUPABASE_URL y SERVICE_ROLE_KEY en el entorno.')
if (!CONFIRMADO) salir(
  'Falta la bandera --confirmo-que-es-una-base-de-demo\n'
  + '   La auditoría es un registro INMUTABLE: lo que se escribe no se puede borrar.')

const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// ── Azar repetible ──────────────────────────────────────────────────────────
// La misma semilla da siempre la misma auditoría: si hay que rehacer la base de demo, el
// video no cambia de contenido entre una grabación y otra.
let semilla = 20261020
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648
const uno = <T>(xs: T[]): T => xs[Math.floor(azar() * xs.length)]
const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))

// ── Guarda 1: ¿es la base de demostración? ──────────────────────────────────
const { data: ctas, error: errCtas } = await db
  .from('movimientos_caja').select('cliente').eq('tipo', 'CTA CTE').limit(2000)
if (errCtas) salir(`No se pudo leer movimientos_caja: ${errCtas.message}`)
const motivo = pareceBaseDeDemo((ctas ?? []).map((f: any) => f.cliente))
if (motivo) salir(motivo)

// ── Guarda 2: ¿está vacía? ──────────────────────────────────────────────────
const { count, error: errCount } = await db
  .from('auditoria').select('id', { count: 'exact', head: true })
if (errCount) salir(`No se pudo leer auditoria: ${errCount.message}`)
if ((count ?? 0) > 0) salir(
  `La auditoría ya tiene ${count} registros y es INMUTABLE: no se puede deshacer lo que\n`
  + '   se escriba de más. Si querés rehacerla, recreá la base desde BOOTSTRAP.sql.')

// ── Los movimientos sobre los que se construye el registro ──────────────────
const { data: movs, error: errMovs } = await db
  .from('movimientos_caja')
  .select('id, fecha, cliente, operacion, propio, monto')
  .order('fecha', { ascending: false })
  .limit(400)
if (errMovs) salir(`No se pudo leer movimientos_caja: ${errMovs.message}`)
if (!movs?.length) salir('No hay movimientos: ¿corriste scripts/sembrar-demo.mts?')

type Registro = Record<string, unknown>
const registros: Registro[] = []

/** Una hora de oficina para un día dado. Nadie carga operaciones a las 4 de la mañana. */
function momento(fecha: string): string {
  const h = String(entre(9, 18)).padStart(2, '0')
  const m = String(entre(0, 59)).padStart(2, '0')
  return `${fecha}T${h}:${m}:${entre(10, 59)}-03:00`
}

const importe = (n: unknown) => Number(n ?? 0).toLocaleString('es-AR')

// ── 1. Altas: la mayoría del registro, como en la vida real ─────────────────
for (const m of movs as any[]) {
  const quien = uno(OPERADORES)
  registros.push({
    ts: momento(m.fecha),
    usuario_nombre: quien.nombre,
    usuario_rol: quien.rol,
    actor: 'usuario',
    accion: 'alta',
    entidad: 'movimientos_caja',
    movimiento_id: m.id,
    resumen: `${m.operacion} ${m.propio} ${importe(m.monto)} — ${m.cliente}`,
  })
}

// ── 2. Ediciones: pocas, y con el detalle de qué cambió ─────────────────────
// Es lo que hace valiosa la pantalla: no dice "alguien tocó algo", dice qué campo, qué
// decía antes y qué dice ahora.
for (const m of (movs as any[]).slice(0, 12)) {
  const quien = uno(OPERADORES)
  const antes = Math.round(Number(m.monto ?? 0) * 0.97)
  registros.push({
    ts: momento(m.fecha),
    usuario_nombre: quien.nombre,
    usuario_rol: quien.rol,
    actor: 'usuario',
    accion: 'edicion',
    entidad: 'movimientos_caja',
    movimiento_id: m.id,
    resumen: `Corrección de importe — ${m.cliente}`,
    campos: ['monto'],
    datos_antes: { monto: antes },
    datos_despues: { monto: Number(m.monto ?? 0) },
  })
}

// ── 3. Borrados: guardan la fila entera, que es lo que permite reponerla ────
for (let i = 0; i < 4; i++) {
  const m = uno(movs as any[])
  const quien = uno(OPERADORES)
  registros.push({
    ts: momento(m.fecha),
    usuario_nombre: quien.nombre,
    usuario_rol: quien.rol,
    actor: 'usuario',
    accion: 'borrado',
    entidad: 'movimientos_caja',
    resumen: `Cargado por duplicado — ${m.cliente}`,
    datos_antes: {
      fecha: m.fecha, cliente: m.cliente, operacion: m.operacion,
      propio: m.propio, monto: Number(m.monto ?? 0),
    },
  })
}

// ── 4. Ingresos y egresos de la calle ───────────────────────────────────────
for (let i = 0; i < 6; i++) {
  const m = uno(movs as any[])
  const quien = uno(OPERADORES)
  registros.push({
    ts: momento(m.fecha),
    usuario_nombre: quien.nombre,
    usuario_rol: quien.rol,
    actor: 'usuario',
    accion: 'ingreso_calle',
    entidad: 'movimientos_caja',
    movimiento_id: m.id,
    resumen: `Rendición del repartidor — ${importe(m.monto)}`,
  })
}

// ── 5. Ingresos al sistema, incluido uno fallido ────────────────────────────
// El intento fallido es el que convence: el sistema no solo registra lo que salió bien.
const fechas = [...new Set((movs as any[]).map(m => m.fecha))].slice(0, 14)
for (const f of fechas) {
  const quien = uno(OPERADORES)
  registros.push({
    ts: momento(f), usuario_nombre: quien.nombre, usuario_rol: quien.rol,
    actor: 'usuario', accion: 'login', entidad: 'profiles',
    resumen: 'Ingreso al sistema',
  })
}
registros.push({
  ts: momento(fechas[1] ?? (movs as any[])[0].fecha),
  usuario_nombre: 'Martín Paz', usuario_rol: 'operador',
  actor: 'usuario', accion: 'login_fallido', entidad: 'profiles',
  resumen: 'Contraseña incorrecta',
})

// ── 6. Administración: usuarios y configuración ─────────────────────────────
registros.push({
  ts: momento(fechas[3] ?? (movs as any[])[0].fecha),
  usuario_nombre: 'Ana Ortiz', usuario_rol: 'administrador',
  actor: 'usuario', accion: 'usuario', entidad: 'profiles',
  resumen: 'Alta de usuario: Lucía Fernández (operador)',
})
registros.push({
  ts: momento(fechas[5] ?? (movs as any[])[0].fecha),
  usuario_nombre: 'Ana Ortiz', usuario_rol: 'administrador',
  actor: 'usuario', accion: 'config', entidad: 'app_config',
  resumen: 'Umbral de aviso por importe grande',
  campos: ['umbral_grande'],
  datos_antes: { umbral_grande: 50_000 },
  datos_despues: { umbral_grande: 100_000 },
})

// ── 7. Un gasto cargado, para que se vea que también quedan registrados ─────
registros.push({
  ts: momento(fechas[2] ?? (movs as any[])[0].fecha),
  usuario_nombre: uno(OPERADORES).nombre, usuario_rol: 'operador',
  actor: 'usuario', accion: 'alta', entidad: 'movimientos_caja',
  resumen: `GASTOS PESOS ${importe(entre(200_000, 900_000))} — ${uno(CONCEPTOS_GASTO)}`,
})

// ── Escritura ───────────────────────────────────────────────────────────────
registros.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))

const LOTE = 200
for (let i = 0; i < registros.length; i += LOTE) {
  const { error } = await db.from('auditoria').insert(registros.slice(i, i + LOTE))
  if (error) salir(`Error insertando en auditoria: ${error.message}`)
}

const porAccion = registros.reduce<Record<string, number>>((acc, r) => {
  const a = String(r.accion); acc[a] = (acc[a] ?? 0) + 1; return acc
}, {})

console.log(`
✅ Auditoría de demostración cargada: ${registros.length} registros
`)
for (const [accion, n] of Object.entries(porAccion).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${accion.padEnd(16)} ${String(n).padStart(4)}`)
}
console.log('')
