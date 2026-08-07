/**
 * Backup de los DATOS de la base, sin instalar PostgreSQL ni Docker.
 *
 * Usa @supabase/supabase-js, que ya es dependencia del proyecto: no hay nada nuevo
 * que instalar. Escribe un archivo NDJSON por tabla (una fila por línea) más un
 * manifiesto con los conteos.
 *
 * QUÉ CUBRE Y QUÉ NO
 *   Cubre:    todas las filas de todas las tablas de `public`.
 *   NO cubre: el esquema (tablas, índices, policies de RLS, funciones, triggers).
 *             No hace falta: el esquema vive versionado en `schema.sql` y `migrations/`.
 *   Juntos —este backup + el repositorio— reconstruyen la base completa.
 *
 * USO
 *   node scripts/backup-datos.mjs [carpeta-destino]
 *
 * Credenciales: toma NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno
 * o de .env.local. Hace falta la clave de servicio (service role) para saltear las
 * policies de RLS y poder leer TODAS las filas.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, createWriteStream, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Todas las tablas de `public`. Si se agrega una tabla nueva, sumarla acá.
const TABLAS = [
  'profiles', 'cuentas_corrientes', 'tipos_operacion', 'clientes',
  'app_config', 'sync_state', 'diario', 'movimientos_caja', 'auditoria',
]

const LOTE = 1000   // Postgrest corta en 1.000 filas por pedido: hay que paginar SIEMPRE.

// ── Credenciales: entorno, si no .env.local ────────────────────────────────
function leerEnv() {
  const env = { ...process.env }
  const archivo = resolve(raiz, '.env.local')
  if (existsSync(archivo)) {
    for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const env = leerEnv()
const URL   = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const CLAVE = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !CLAVE) {
  console.error('\nFaltan credenciales.\n')
  console.error('  Definí NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY,')
  console.error('  o dejalas en el archivo .env.local del proyecto.\n')
  console.error('  Se sacan de: Dashboard > Settings > API')
  console.error('  (la clave service_role es la SECRETA: no compartirla ni commitearla)\n')
  process.exit(1)
}

const supabase = createClient(URL, CLAVE, { auth: { persistSession: false } })

// ── Destino ────────────────────────────────────────────────────────────────
const sello = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
const destino = resolve(process.argv[2] || resolve(raiz, 'backups'), `backup-${sello}`)
mkdirSync(destino, { recursive: true })

console.log(`\nBackup de datos → ${destino}\n`)

const manifiesto = { generado: new Date().toISOString(), origen: URL, tablas: {} }
let errores = 0

for (const tabla of TABLAS) {
  // Conteo primero: sirve para verificar al final que se bajó todo.
  const { count, error: errConteo } = await supabase
    .from(tabla).select('*', { count: 'exact', head: true })

  if (errConteo) {
    console.log(`  ${tabla.padEnd(20)} ✗  ${errConteo.message}`)
    manifiesto.tablas[tabla] = { error: errConteo.message }
    errores++
    continue
  }

  const salida = createWriteStream(resolve(destino, `${tabla}.ndjson`), { encoding: 'utf8' })
  let bajadas = 0
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await supabase
      .from(tabla).select('*').range(desde, desde + LOTE - 1)
    if (error) {
      console.log(`  ${tabla.padEnd(20)} ✗  ${error.message}`)
      manifiesto.tablas[tabla] = { error: error.message, parcial: bajadas }
      errores++
      break
    }
    for (const fila of data) salida.write(JSON.stringify(fila) + '\n')
    bajadas += data.length
    if (data.length < LOTE) break
  }
  await new Promise(r => salida.end(r))

  // Verificación: lo escrito tiene que coincidir con el conteo de la base.
  const ok = bajadas === (count ?? 0)
  if (!ok) errores++
  manifiesto.tablas[tabla] = { filas: bajadas, esperadas: count, ok }
  console.log(`  ${tabla.padEnd(20)} ${ok ? '✓' : '✗'}  ${bajadas.toLocaleString('es-AR')} fila${bajadas === 1 ? '' : 's'}` +
              (ok ? '' : `  (se esperaban ${count?.toLocaleString('es-AR')})`))
}

manifiesto.ok = errores === 0
const mf = createWriteStream(resolve(destino, 'manifiesto.json'), { encoding: 'utf8' })
mf.write(JSON.stringify(manifiesto, null, 2))
await new Promise(r => mf.end(r))

console.log(
  errores === 0
    ? '\n✓ Backup completo. Los conteos coinciden con la base.\n'
    : `\n✗ Terminó con ${errores} problema(s). Revisá manifiesto.json.\n`
)
console.log('Recordá: el ESQUEMA no está acá, está en schema.sql y migrations/ del repositorio.')
console.log('Para restaurar: aplicar el esquema y después `node scripts/restaurar-datos.mjs <carpeta>`.\n')
process.exit(errores === 0 ? 0 : 1)
