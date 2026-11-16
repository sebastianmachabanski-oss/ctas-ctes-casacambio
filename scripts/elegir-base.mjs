/**
 * Cambia a qué base de datos apunta la aplicación en esta computadora.
 *
 *   npm run base              ← dice a cuál está apuntando AHORA
 *   node scripts/elegir-base.mjs demo
 *   node scripts/elegir-base.mjs mictacte
 *
 * ── PARA QUÉ ───────────────────────────────────────────────────────────────
 * La aplicación lee sus credenciales de `.env.local`, uno solo. Para mostrarle el sistema
 * a un interesado hay que apuntarlo a la base de DEMOSTRACIÓN, y para trabajar sobre un
 * problema real, a la del cliente. Hasta ahora eso era editar el archivo a mano, y ahí
 * está el accidente que importa: arrancar una demostración creyendo que son datos
 * ficticios y proyectar los nombres y los saldos verdaderos de un cliente.
 *
 * Esto guarda un archivo por base y copia el que corresponda, diciendo en voz alta a cuál
 * quedó apuntando. El `npm run base` sin nombre es el que conviene correr ANTES de
 * compartir pantalla: contesta la única pregunta que importa en ese momento.
 *
 * ── CÓMO SE PREPARA (una sola vez por base) ────────────────────────────────
 * Un archivo por cada una, con el nombre en el medio:
 *
 *     .env.demo.local        credenciales del proyecto Supabase de demostración
 *     .env.mictacte.local    credenciales del proyecto Supabase del cliente
 *
 * Adentro va lo mismo que en `.env.local` (ver docs/NUEVO-CLIENTE.md, paso 3.2):
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY.
 *
 * El `.local` del final no es decorativo: es lo que hace que `.gitignore` los agarre con
 * la regla que ya existe (`.env*.local`). Son claves; no se versionan nunca.
 *
 * ── LO QUE NO HACE ─────────────────────────────────────────────────────────
 * No muestra ninguna clave, solo la dirección del proyecto. Y no reinicia la aplicación:
 * si `npm run dev` está corriendo, hay que cortarlo y volver a levantarlo, porque las
 * variables se leen al arrancar.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ACTIVO = join(RAIZ, '.env.local')

/** `.env.demo.local` → `demo`. El `.env.local` a secas no es un perfil: es el activo. */
const nombreDePerfil = (archivo) => {
  const m = /^\.env\.(.+)\.local$/.exec(archivo)
  return m ? m[1] : null
}

const perfiles = readdirSync(RAIZ)
  .map(a => ({ archivo: a, nombre: nombreDePerfil(a) }))
  .filter(p => p.nombre)
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

function salir(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1) }

/** La dirección del proyecto Supabase, que es lo que identifica la base sin exponer nada. */
function direccionDe(ruta) {
  if (!existsSync(ruta)) return null
  const texto = readFileSync(ruta, 'utf8')
  const m = /^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)$/m.exec(texto)
  return m ? m[1].trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '') : null
}

/** El nombre con el que la aplicación se presenta, si está puesto. */
function rotuloDe(ruta) {
  if (!existsSync(ruta)) return null
  const m = /^\s*NEXT_PUBLIC_APP_NOMBRE\s*=\s*(.+)$/m.exec(readFileSync(ruta, 'utf8'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

/** A qué perfil corresponde el `.env.local` de ahora, comparando la dirección. */
function perfilActivo() {
  const dir = direccionDe(ACTIVO)
  if (!dir) return null
  return perfiles.find(p => direccionDe(join(RAIZ, p.archivo)) === dir) ?? null
}

function listar() {
  if (perfiles.length === 0) {
    console.log('\n   No hay ninguna base preparada todavía.')
    console.log('   Se prepara una copiando las credenciales a un archivo .env.<nombre>.local')
    console.log('   (ver el comentario de arriba de este script).\n')
    return
  }
  console.log('\n   Bases preparadas:')
  for (const p of perfiles) console.log(`     · ${p.nombre}`)
  console.log(`\n   Para cambiar:  node scripts/elegir-base.mjs ${perfiles[0].nombre}\n`)
}

const pedido = process.argv[2]

// ── Sin nombre: decir a cuál está apuntando ahora ───────────────────────────
if (!pedido) {
  if (!existsSync(ACTIVO)) {
    console.log('\n⚠  No hay .env.local: la aplicación no apunta a ninguna base.')
    listar()
    process.exit(0)
  }
  const activo = perfilActivo()
  const dir = direccionDe(ACTIVO) ?? '(sin NEXT_PUBLIC_SUPABASE_URL)'
  const rotulo = rotuloDe(ACTIVO)
  if (activo) {
    console.log(`\n   La aplicación apunta a:  ${activo.nombre.toUpperCase()}`)
  } else {
    console.log('\n⚠  La aplicación apunta a una base que no coincide con ninguna preparada.')
  }
  console.log(`   Proyecto: ${dir}`)
  if (rotulo) console.log(`   Se presenta como: ${rotulo}`)
  listar()
  process.exit(0)
}

// ── Con nombre: cambiar ─────────────────────────────────────────────────────
const elegido = perfiles.find(p => p.nombre.toLowerCase() === pedido.toLowerCase())
if (!elegido) {
  const conocidas = perfiles.map(p => p.nombre).join(', ') || '(ninguna)'
  salir(`No existe una base preparada que se llame "${pedido}".\n`
    + `   Preparadas: ${conocidas}\n`
    + `   Se prepara creando .env.${pedido}.local con las credenciales de ese proyecto.`)
}

const origen = join(RAIZ, elegido.archivo)
const dir = direccionDe(origen)
if (!dir) salir(`${elegido.archivo} no tiene NEXT_PUBLIC_SUPABASE_URL. Revisalo antes de usarlo.`)

// Si había un .env.local que no corresponde a ningún perfil, es un archivo escrito a mano
// y perderlo sería perder credenciales. Se guarda antes de pisarlo.
if (existsSync(ACTIVO) && !perfilActivo()) {
  const rescate = join(RAIZ, '.env.anterior.local')
  writeFileSync(rescate, readFileSync(ACTIVO))
  console.log(`\n⚠  El .env.local que había no correspondía a ninguna base preparada.`)
  console.log(`   Se guardó una copia en .env.anterior.local por las dudas.`)
}

copyFileSync(origen, ACTIVO)

const rotulo = rotuloDe(ACTIVO)
console.log(`\n✅ La aplicación ahora apunta a:  ${elegido.nombre.toUpperCase()}`)
console.log(`   Proyecto: ${dir}`)
if (rotulo) console.log(`   Se presenta como: ${rotulo}`)
console.log('\n   Si `npm run dev` está corriendo, cortalo y volvé a levantarlo:')
console.log('   las variables se leen al arrancar.\n')
