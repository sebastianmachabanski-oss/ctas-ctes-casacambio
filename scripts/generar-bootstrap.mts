/**
 * Genera `migrations/BOOTSTRAP.sql`: el SQL que levanta una base vacía de cero.
 *
 *   npx tsx scripts/generar-bootstrap.mts
 *
 * POR QUÉ UN GENERADOR Y NO UN ARCHIVO A MANO
 * Un SQL consolidado escrito a mano se desactualiza con la primera migración que alguien
 * agregue y no copie. Esto lo arma desde las fuentes reales, así que basta con volver a
 * correrlo. Y el MANIFIESTO de abajo obliga a decidir explícitamente qué hace cada
 * migración nueva: si no está listada, el generador falla y avisa.
 *
 * POR QUÉ NO ALCANZA CON CONCATENAR `migrations/*.sql` EN ORDEN
 * Cuatro archivos no van en el camino de ida:
 *   - un ROLLBACK, que deshace la migración anterior;
 *   - dos correcciones/diagnósticos sobre datos YA cargados, que en una base vacía no
 *     tienen nada que corregir;
 *   - una migración superada por otra posterior.
 * Y `add_cotizacion.sql` no tiene fecha en el nombre, así que el orden alfabético la
 * mandaba al final cuando en realidad es de las primeras.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(RAIZ, 'migrations')

/**
 * Orden exacto de ejecución sobre una base vacía. Es una lista explícita y no un `ls`
 * ordenado a propósito: el orden y las exclusiones son decisiones, no un efecto del
 * nombre de los archivos.
 */
const ORDEN = [
  'schema.sql',                                 // tablas base: profiles, cuentas_corrientes, tipos_operacion, diario
  'migrations/add_cotizacion.sql',              // sin fecha en el nombre, pero va temprano: agrega diario.cotizacion
  'migrations/2026-06-15_diario_delete_policy.sql',
  'migrations/2026-06-24_sync_state.sql',
  'migrations/2026-06-30_clientes.sql',
  'migrations/2026-07-05_movimientos_caja.sql',
  'migrations/2026-07-06_cot_efectiva.sql',
  'migrations/2026-07-06_editar_movimientos.sql',
  'migrations/2026-07-09_tablero_inicio.sql',
  'migrations/2026-07-10_caja_clientes_periodo.sql',
  'migrations/2026-07-11_app_config.sql',
  'migrations/2026-07-11_delete_movimientos_caja.sql',
  'migrations/2026-07-11_insert_movimientos_caja.sql',
  'migrations/2026-07-20_usdt.sql',
  'migrations/2026-07-29_auditoria.sql',
  'migrations/2026-08-11_roles.sql',
  'migrations/2026-08-25_clientes_ultimo_movimiento.sql',
  'migrations/2026-08-25_indice_fila_sheet.sql',
  // OJO CON ESTAS DOS: van al revés del orden alfabético. `usdt_cta_cte` agrega la
  // columna `diario.cc_usdt` y `cta_cte_paginado` la lee, así que la que agrega tiene que
  // ir primero. Las dos son del mismo día y el nombre del archivo no conserva en qué
  // orden se corrieron realmente. Lo detectó la prueba contra un Postgres de verdad.
  'migrations/2026-08-25_usdt_cta_cte.sql',
  'migrations/2026-08-25_cta_cte_paginado.sql',
  'migrations/2026-08-26_op_transferencias.sql',
  'migrations/2026-09-11_senal_cambios.sql',
  // Va al final: agrega columnas y recrea seis objetos que enumeran las monedas.
  'migrations/2026-10-16_libras.sql',
]

/** Lo que NO va, y por qué. Cada exclusión es una decisión que hay que poder defender. */
const EXCLUIDAS: Record<string, string> = {
  '2026-07-06_ve_ganancias.sql':
    'SUPERADA por 2026-08-11_roles.sql, que elimina `ve_ganancias` y la reemplaza por el rol. '
    + 'Esa migración se protege con un `if exists` sobre la columna, así que funciona sin esta.',
  '2026-08-13_rollback_roles.sql':
    'ROLLBACK: deshace el modelo de roles. Incluirla dejaría la base en el modelo viejo.',
  '2026-09-01_corregir_signo_cta_cte.sql':
    'Corrige el signo de filas YA CARGADAS. En una base vacía no hay nada que corregir.',
  '2026-09-01_detectar_huerfanas_diario.sql':
    'Diagnóstico: solo consulta, no modifica nada. Es una herramienta, no un paso de instalación.',
}

// ── Control: ninguna migración puede quedar sin clasificar ──────────────────
// Si alguien agrega una migración y no la lista acá, el generador falla. Es a propósito:
// que el bootstrap quede viejo en silencio es exactamente lo que esto viene a evitar.
const enDisco = readdirSync(DIR).filter(f => f.endsWith('.sql') && f !== 'BOOTSTRAP.sql')
const enOrden = new Set(ORDEN.filter(p => p.startsWith('migrations/')).map(p => p.replace('migrations/', '')))
const sinClasificar = enDisco.filter(f => !enOrden.has(f) && !(f in EXCLUIDAS))

if (sinClasificar.length) {
  console.error(
    `❌ Hay ${sinClasificar.length} migración(es) sin clasificar en scripts/generar-bootstrap.mts:\n`
    + sinClasificar.map(f => `   - ${f}`).join('\n')
    + `\n\nAgregala a ORDEN (si crea o modifica estructura) o a EXCLUIDAS con el motivo\n`
    + `(si corrige datos existentes, diagnostica, o quedó superada por otra).`
  )
  process.exit(1)
}

// ── Armado ──────────────────────────────────────────────────────────────────
const hoy = new Date().toISOString().slice(0, 10)
const partes: string[] = [
  `-- ============================================================================`,
  `-- BOOTSTRAP — base completa desde cero`,
  `--`,
  `-- GENERADO por scripts/generar-bootstrap.mts el ${hoy}. NO EDITAR A MANO:`,
  `-- el próximo que corra el generador pisa los cambios. Para modificarlo, tocá la`,
  `-- migración correspondiente y volvé a generar.`,
  `--`,
  `-- CÓMO SE USA: pegar entero en el SQL Editor de un proyecto Supabase NUEVO.`,
  `-- Es idempotente (todo va con \`if not exists\` / \`create or replace\`), así que`,
  `-- se puede correr dos veces sin romper nada.`,
  `--`,
  `-- Contiene ${ORDEN.length} archivos. Quedan afuera ${Object.keys(EXCLUIDAS).length}:`,
  ...Object.entries(EXCLUIDAS).map(([f, motivo]) =>
    `--   · ${f}\n--     ${motivo.replace(/\n\s*/g, '\n--     ')}`),
  `-- ============================================================================`,
  '',
]

/**
 * Funciones que una migración posterior redefine con MÁS COLUMNAS de retorno.
 * Hay que borrarlas antes de recrearlas; ver el porqué en `hacerIdempotente`.
 * Si algún día otra función gana columnas, va acá con su firma.
 */
const FUNCIONES_QUE_CAMBIAN_DE_FIRMA = [
  // Gana las columnas de USDT en 2026-07-20_usdt.sql.
  { nombre: 'public.caja_totales', args: 'date, date' },
  // Gana `ultimo_movimiento` en 2026-08-25_clientes_ultimo_movimiento.sql.
  { nombre: 'public.caja_clientes_periodo', args: 'date, date' },
]

/**
 * Hace idempotentes las sentencias que no lo son.
 *
 * Postgres no tiene `create policy if not exists` ni `create trigger if not exists`: la
 * segunda corrida falla con "already exists". Algunas migraciones ya hacen el `drop` ellas
 * mismas, pero no todas — y el bootstrap tiene que tolerar que alguien lo pegue dos veces,
 * porque es exactamente lo que va a pasar cuando una instalación quede a medias.
 *
 * Se antepone un `drop ... if exists` a cada una. Se hace ACÁ y no editando las
 * migraciones: esos archivos son el registro histórico de lo que se corrió en producción
 * y no se tocan.
 */
function hacerIdempotente(sql: string): string {
  return sql
    .replace(
      /^([ \t]*)create\s+policy\s+("(?:[^"]+)"|[\w]+)([\s\S]{0,120}?)\bon\s+([\w."]+)/gim,
      (m, sangria, nombre, medio, tabla) =>
        `${sangria}drop policy if exists ${nombre} on ${tabla};\n${m}`,
    )
    .replace(
      /^([ \t]*)create\s+trigger\s+([\w]+)([\s\S]{0,120}?)\bon\s+([\w."]+)/gim,
      (m, sangria, nombre, medio, tabla) =>
        `${sangria}drop trigger if exists ${nombre} on ${tabla};\n${m}`,
    )
    // `create or replace view` NO puede quitar columnas, y acá pasa: schema.sql define
    // una vista que una migración posterior enriquece. En la segunda corrida, la versión
    // corta de schema.sql no puede reemplazar a la larga y falla con "cannot drop columns
    // from view". Se la borra antes. El `cascade` es seguro dentro del bootstrap: lo que
    // dependa de esta vista se define más adelante en el mismo archivo y se vuelve a crear.
    .replace(
      /^([ \t]*)create\s+or\s+replace\s+view\s+([\w."]+)/gim,
      (m, sangria, nombre) => `${sangria}drop view if exists ${nombre} cascade;\n${m}`,
    )
    // Mismo problema con las funciones que GANAN COLUMNAS en una migración posterior:
    // `create or replace function` no puede cambiar el tipo de retorno. En la segunda
    // corrida, la versión corta no puede reemplazar a la larga y falla.
    //
    // Va con una LISTA EXPLÍCITA y no con una regla general a propósito: un `drop function
    // ... cascade` indiscriminado se llevaría puestas las policies, porque `es_admin()`,
    // `es_staff()` y `ve_ganancias()` están referenciadas por ellas. Esas tres no hacen
    // falta dropearlas — se redefinen con el mismo tipo de retorno y `create or replace`
    // alcanza. Las de acá abajo no las usa ninguna policy ni ninguna vista, así que el
    // drop simple es seguro.
    .replace(
      new RegExp(`^([ \\t]*)create\\s+or\\s+replace\\s+function\\s+(${
        FUNCIONES_QUE_CAMBIAN_DE_FIRMA.map(f => f.nombre.replace('.', '\\.')).join('|')
      })\\s*\\(`, 'gim'),
      (m, sangria, nombre) => {
        const f = FUNCIONES_QUE_CAMBIAN_DE_FIRMA.find(x => x.nombre.toLowerCase() === nombre.toLowerCase())!
        return `${sangria}drop function if exists ${f.nombre}(${f.args});\n${m}`
      },
    )
}

for (const rel of ORDEN) {
  const sql = hacerIdempotente(readFileSync(join(RAIZ, rel), 'utf8').trimEnd())
  partes.push(
    '',
    `-- ${'═'.repeat(74)}`,
    `-- ${rel}`,
    `-- ${'═'.repeat(74)}`,
    '',
    sql,
    '',
  )
}

const destino = join(DIR, 'BOOTSTRAP.sql')
const contenido = partes.join('\n') + '\n'
writeFileSync(destino, contenido, 'utf8')

const kb = (contenido.length / 1024).toFixed(1)
console.log(`✅ migrations/BOOTSTRAP.sql — ${ORDEN.length} archivos, ${contenido.split('\n').length} líneas, ${kb} KB`)
console.log(`   Excluidas ${Object.keys(EXCLUIDAS).length}: ${Object.keys(EXCLUIDAS).join(', ')}`)
