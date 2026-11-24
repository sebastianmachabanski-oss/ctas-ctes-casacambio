/**
 * Le pone una contraseña a un usuario que ya existe.
 *
 *   npm run base demo                                    ← elegir la base
 *   npx tsx scripts/reponer-clave.mts demo@ejemplo.com 'NuevaClave123!' --confirmo
 *
 * PARA QUÉ
 * Las claves de los usuarios de demostración se generan al azar y se muestran una sola
 * vez (ver `crear-primer-admin.mts`): si se perdieron, no hay de dónde sacarlas.
 *
 * Y el camino del panel de Supabase no sirve para estos usuarios: el menú de la fila
 * manda un mail de recuperación, pero los usuarios de demo están en dominios inventados
 * —`@ejemplo.com`— así que ese mail no llega a ninguna parte.
 *
 * ── CUIDADO ────────────────────────────────────────────────────────────────
 * Esto usa la service_role, que saltea RLS, y le cambia la clave a CUALQUIER usuario de
 * la base que esté seleccionada. Por eso:
 *   · Exige la bandera `--confirmo`.
 *   · Muestra el proyecto y el rol del usuario ANTES de tocar nada, y espera.
 *   · Marca `debe_cambiar_clave` para que la persona la cambie en su primer ingreso,
 *     salvo que se pase `--sin-cambio-obligatorio` (lo que conviene para una demo, donde
 *     frenar el primer ingreso con un formulario arruina la presentación).
 */
import { createClient } from '@supabase/supabase-js'
import { credenciales } from './env-local'

function salir(msg: string): never { console.error(`\n❌ ${msg}\n`); process.exit(1) }

const [email, clave] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const CONFIRMADO = process.argv.includes('--confirmo')
const SIN_CAMBIO = process.argv.includes('--sin-cambio-obligatorio')

if (!email || !clave) salir(
  'Uso: npx tsx scripts/reponer-clave.mts <email> \'<clave nueva>\' --confirmo\n'
  + '   En PowerShell la clave va entre comillas SIMPLES: los signos ! y $ los\n'
  + '   interpreta la terminal si van entre comillas dobles.')
if (clave.length < 8) salir('La clave tiene que tener al menos 8 caracteres.')
if (!CONFIRMADO) salir(
  'Falta la bandera --confirmo\n'
  + '   Esto le cambia la clave a un usuario real de la base que esté seleccionada.')

const cred = credenciales()
if ('problema' in cred) salir(cred.problema)
const db = createClient(cred.url, cred.key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: perfil, error } = await db
  .from('profiles').select('id, email, rol, nombre').eq('email', email).maybeSingle()
if (error) salir(`No se pudo leer \`profiles\`: ${error.message}`)
if (!perfil) salir(`No hay ningún usuario con el email ${email} en este proyecto.`)

const p = perfil as { id: string; email: string; rol: string; nombre: string | null }

console.log(`
  Proyecto   ${cred.proyecto}
  Usuario    ${p.email}${p.nombre ? ` (${p.nombre})` : ''}
  Rol        ${p.rol}
  Después    ${SIN_CAMBIO ? 'entra directo' : 'le va a pedir cambiar la clave en el primer ingreso'}
`)
console.log('⚠️  Si el proyecto no es el que esperabas, cortá ahora con Ctrl+C.')
for (let i = 5; i > 0; i--) {
  process.stdout.write(`\r   Cambiando en ${i}… `)
  await new Promise(r => setTimeout(r, 1000))
}
process.stdout.write('\r                        \r')

const { error: errClave } = await db.auth.admin.updateUserById(p.id, { password: clave })
if (errClave) salir(`No se pudo cambiar la clave: ${errClave.message}`)

const { error: errPerfil } = await db
  .from('profiles').update({ debe_cambiar_clave: !SIN_CAMBIO }).eq('id', p.id)
if (errPerfil) salir(
  `La clave SÍ se cambió, pero no se pudo actualizar \`debe_cambiar_clave\`: ${errPerfil.message}`)

console.log(`✅ Listo. ${p.email} ya entra con la clave nueva.\n`)
