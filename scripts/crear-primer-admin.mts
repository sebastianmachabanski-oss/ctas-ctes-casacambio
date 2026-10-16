/**
 * Crea el PRIMER superadministrador de una base recién instalada.
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/crear-primer-admin.mts <email> "<nombre>"
 *
 * POR QUÉ HACE FALTA
 * Después de correr BOOTSTRAP.sql la base está completa pero VACÍA: no hay ningún
 * usuario, así que nadie puede entrar. Y la pantalla de Usuarios no sirve para salir del
 * paso, porque para crear un usuario hay que estar adentro.
 *
 * POR QUÉ NO SE USA `crear_usuario_admin()` DE schema.sql
 * Esa función exige `es_admin()`, que en una base vacía no lo cumple nadie. Además está
 * sin uso: la app crea usuarios con la Admin API de Supabase
 * (`auth.admin.createUser`, ver src/app/api/admin/usuarios/route.ts), no con ella. Este
 * script usa EXACTAMENTE el mismo camino que la app, que es el que está probado.
 *
 * SE CIERRA SOLO
 * Si ya existe algún usuario de staff, aborta. No es un script de administración: es el
 * primer arranque y una sola vez. Para todo lo demás está la pantalla de Usuarios.
 *
 * LA CLAVE NO ES FIJA. La app usa una clave inicial conocida para los usuarios que crea
 * un administrador —tiene sentido, es para dictarla por teléfono—, pero la del PRIMER
 * superadmin viaja por donde sea que se instale el sistema. Acá se genera al azar y se
 * imprime una sola vez. Igual queda marcada para cambio obligatorio en el primer ingreso.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const [email, nombre] = process.argv.slice(2)

function salir(msg: string): never {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

if (!URL || !KEY) salir(
  'Faltan las credenciales. Se esperan SUPABASE_URL y SERVICE_ROLE_KEY en el entorno.\n'
  + '   Las dos salen de Supabase → Project Settings → API.\n'
  + '   OJO: la service_role key da acceso TOTAL salteando RLS. No la pegues en un chat\n'
  + '   ni la dejes en un archivo versionado.')

if (!email || !nombre) salir(
  'Uso: npx tsx scripts/crear-primer-admin.mts <email> "<nombre y apellido>"')

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) salir(`"${email}" no parece un email`)

/** Clave al azar, legible para dictarla pero no adivinable. */
function claveAlAzar(): string {
  // Sin caracteres que se confundan al leerlos en voz alta (l/I/1, O/0).
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(16)
  const cuerpo = Array.from(bytes, b => abc[b % abc.length]).join('')
  // El símbolo y el dígito van fijos al final para cumplir cualquier política de complejidad.
  return `${cuerpo}7!`
}

const admin = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// ── 1. ¿La base ya tiene dueño? ─────────────────────────────────────────────
// Si ya hay staff, este script no corresponde: crear otro superadmin por fuera de la
// pantalla de Usuarios saltea las reglas de contención (nadie asigna un rol al que no
// llega, un administrador no toca la cuenta de un superadmin).
const { data: staff, error: errStaff } = await admin
  .from('profiles')
  .select('email, rol')
  .in('rol', ['superadmin', 'administrador', 'operador'])
  .limit(5)

if (errStaff) salir(
  `No se pudo consultar \`profiles\`: ${errStaff.message}\n`
  + '   ¿Corriste migrations/BOOTSTRAP.sql en esta base?')

if (staff && staff.length) {
  console.error('❌ Esta base ya tiene usuarios de staff:')
  for (const u of staff) console.error(`     · ${u.email} (${u.rol})`)
  console.error('\n   Este script es solo para el primer arranque. Para crear más usuarios,')
  console.error('   entrá a la app y usá la pantalla de Usuarios.')
  process.exit(1)
}

// ── 2. Crear el usuario ─────────────────────────────────────────────────────
const password = claveAlAzar()
console.log(`→ Creando superadministrador ${email} …`)

const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
  email,
  password,
  // Sin esto queda esperando que confirme el mail y no puede entrar.
  email_confirm: true,
  user_metadata: { nombre, rol: 'superadmin' },
})
if (errCrear) salir(`No se pudo crear el usuario: ${errCrear.message}`)

// ── 3. El perfil ────────────────────────────────────────────────────────────
// Un trigger (`handle_new_user`) ya crea la fila, pero no necesariamente con el rol que
// queremos: se deja explícito, igual que hace la app.
const { error: errPerfil } = await admin.from('profiles').upsert({
  id: creado.user.id,
  email,
  nombre,
  rol: 'superadmin',
  cuenta_cte: null,
  debe_cambiar_clave: true,
  activo: true,
}, { onConflict: 'id' })

if (errPerfil) {
  console.error(`⚠️  El usuario se creó pero su perfil quedó mal: ${errPerfil.message}`)
  console.error(`   Borralo desde Supabase → Authentication → Users y volvé a correr esto.`)
  process.exit(1)
}

console.log(`
✅ Superadministrador creado.

   Usuario: ${email}
   Clave:   ${password}

   Esta clave se muestra UNA SOLA VEZ y no queda guardada en ningún lado.
   Anotala ahora. En el primer ingreso la app va a pedir cambiarla.
`)
