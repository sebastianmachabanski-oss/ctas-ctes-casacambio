/**
 * Restaura los datos de un backup hecho con `backup-datos.mjs`.
 *
 * ANTES DE CORRER ESTO: el esquema tiene que existir en la base de destino. Se aplica
 * `schema.sql` y después las `migrations/` en orden, desde el SQL Editor de Supabase.
 * Este script solo carga FILAS; no crea tablas ni policies.
 *
 * USO
 *   node scripts/restaurar-datos.mjs <carpeta-del-backup> [--confirmar]
 *
 * Sin --confirmar hace una PRUEBA EN SECO: valida los archivos y muestra qué haría,
 * sin escribir nada. Un backup que nunca se probó no es un backup.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Orden de carga: las tablas referenciadas van primero, para no violar claves foráneas.
const ORDEN = [
  'profiles', 'cuentas_corrientes', 'tipos_operacion', 'clientes',
  'app_config', 'sync_state', 'diario', 'movimientos_caja', 'auditoria',
]
const LOTE = 500

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

const carpeta = process.argv[2]
const confirmar = process.argv.includes('--confirmar')

if (!carpeta || !existsSync(carpeta)) {
  console.error('\nUso: node scripts/restaurar-datos.mjs <carpeta-del-backup> [--confirmar]\n')
  if (carpeta) console.error(`No existe la carpeta: ${carpeta}\n`)
  process.exit(1)
}

const env = leerEnv()
const URL   = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const CLAVE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !CLAVE) {
  console.error('\nFaltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.\n')
  process.exit(1)
}

console.log(`\n${confirmar ? 'RESTAURANDO' : 'PRUEBA EN SECO (no escribe nada)'}`)
console.log(`  Origen : ${carpeta}`)
console.log(`  Destino: ${URL}\n`)

if (confirmar) {
  console.log('⚠️  Se van a INSERTAR filas en la base de destino.')
  console.log('    Si la base ya tiene datos, puede haber conflictos de clave.\n')
}

const supabase = createClient(URL, CLAVE, { auth: { persistSession: false } })
const presentes = readdirSync(carpeta).filter(f => f.endsWith('.ndjson'))
let errores = 0

for (const tabla of ORDEN) {
  const archivo = resolve(carpeta, `${tabla}.ndjson`)
  if (!presentes.includes(`${tabla}.ndjson`)) continue

  const lineas = readFileSync(archivo, 'utf8').split('\n').filter(Boolean)
  let filas
  try {
    filas = lineas.map(l => JSON.parse(l))
  } catch (e) {
    console.log(`  ${tabla.padEnd(20)} ✗  archivo corrupto: ${e.message}`)
    errores++
    continue
  }

  if (!confirmar) {
    console.log(`  ${tabla.padEnd(20)} ·  ${filas.length.toLocaleString('es-AR')} fila${filas.length === 1 ? '' : 's'} lista${filas.length === 1 ? '' : 's'}`)
    continue
  }

  let cargadas = 0
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await supabase.from(tabla).insert(filas.slice(i, i + LOTE))
    if (error) {
      console.log(`  ${tabla.padEnd(20)} ✗  ${error.message}`)
      errores++
      break
    }
    cargadas += Math.min(LOTE, filas.length - i)
  }
  if (cargadas === filas.length) {
    console.log(`  ${tabla.padEnd(20)} ✓  ${cargadas.toLocaleString('es-AR')} fila${cargadas === 1 ? '' : 's'}`)
  }
}

if (!confirmar) {
  console.log('\nPrueba en seco terminada. Para escribir de verdad, agregá --confirmar.\n')
} else {
  console.log(errores === 0 ? '\n✓ Restauración completa.\n' : `\n✗ Terminó con ${errores} problema(s).\n`)
}
process.exit(errores === 0 ? 0 : 1)
