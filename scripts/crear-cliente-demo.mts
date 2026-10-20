/**
 * Crea el usuario CLIENTE de la base de demostración.
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/crear-cliente-demo.mts --confirmo-que-es-una-base-de-demo
 *
 * PARA QUÉ
 * Una de las cosas que más impresiona al mostrar el sistema es que el cliente de la casa
 * de cambio entra con su propio usuario y mira su saldo cuando quiere, sin llamar por
 * teléfono. Para poder MOSTRARLO hay que entrar como cliente, y para eso hace falta un
 * usuario con rol `cliente` atado a una cuenta corriente.
 *
 * POR QUÉ NO SE CREA DESDE LA PANTALLA DE USUARIOS
 * Se podría, y para un cliente real es el camino correcto. Pero la app marca a todo
 * usuario nuevo con `debe_cambiar_clave`, así que el primer ingreso lo manda a cambiar la
 * contraseña. En una grabación guionada eso descarrila el recorrido: el navegador queda
 * parado en una pantalla que no es la que se quería mostrar. Acá se crea ya listo para
 * entrar, que es lo que necesita la demostración y nada más.
 *
 * ── LAS GUARDAS ────────────────────────────────────────────────────────────
 *   1. La bandera, escrita entera.
 *   2. La cuenta tiene que ser del elenco ficticio.
 *   3. TODAS las cuentas de la base tienen que ser del elenco. Una sola cuenta ajena y
 *      aborta: podría ser la base de un cliente real.
 * La tercera es la que de verdad protege. Las banderas se tipean distraído; que la base
 * entera esté poblada de nombres inventados, no.
 */
import { createClient } from '@supabase/supabase-js'
import { CUENTAS, pareceBaseDeDemo } from './elenco-demo'

const URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, '')
const KEY = (process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim()
const CONFIRMADO = process.argv.includes('--confirmo-que-es-una-base-de-demo')

/** La cuenta que va a ver el cliente. Se puede cambiar por otra del elenco. */
const CUENTA = process.env.DEMO_CUENTA?.trim().toUpperCase() || CUENTAS[0]
const EMAIL = process.env.DEMO_CLIENTE_USUARIO?.trim() || 'cliente@ejemplo.com'
/** Fija y conocida a propósito: es una base de demostración, no hay nada que proteger. */
const CLAVE = process.env.DEMO_CLIENTE_CLAVE?.trim() || 'Demo1234!'

function salir(msg: string): never { console.error(`❌ ${msg}`); process.exit(1) }

if (!URL || !KEY) salir('Faltan SUPABASE_URL y SERVICE_ROLE_KEY en el entorno.')
if (!CONFIRMADO) salir(
  'Falta la bandera --confirmo-que-es-una-base-de-demo\n'
  + '   Este script crea un usuario que puede entrar al sistema. Escribila entera.')
if (!CUENTAS.map(c => c.toUpperCase()).includes(CUENTA)) salir(
  `"${CUENTA}" no es una cuenta del elenco ficticio.\n   Son: ${CUENTAS.join(', ')}`)

const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// ── Guarda: ¿esta base es la de demostración? ───────────────────────────────
const { data: filas, error: errCuentas } = await db
  .from('movimientos_caja')
  .select('cliente')
  .eq('tipo', 'CTA CTE')
  .limit(2000)
if (errCuentas) salir(`No se pudo leer movimientos_caja: ${errCuentas.message}`)

const motivo = pareceBaseDeDemo((filas ?? []).map((f: any) => f.cliente))
if (motivo) salir(`${motivo}`)

// ── Crear el usuario ────────────────────────────────────────────────────────
// Si ya existe de una corrida anterior, se le repone la clave en lugar de fallar: este
// script se vuelve a correr cada vez que se rehace la base de demo.
const { data: existentes } = await db.from('profiles').select('id').eq('email', EMAIL).maybeSingle()

let id = (existentes as any)?.id as string | undefined

if (id) {
  const { error } = await db.auth.admin.updateUserById(id, { password: CLAVE })
  if (error) salir(`No se pudo reponer la clave: ${error.message}`)
  console.log('ℹ️  El usuario ya existía: se le repuso la clave.')
} else {
  const { data, error } = await db.auth.admin.createUser({
    email: EMAIL,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { nombre: CUENTA, rol: 'cliente', cuenta_cte: CUENTA },
  })
  if (error) salir(`No se pudo crear el usuario: ${error.message}`)
  id = data.user.id
}

const { error: errPerfil } = await db.from('profiles').upsert({
  id,
  email: EMAIL,
  nombre: CUENTA,
  rol: 'cliente',
  cuenta_cte: CUENTA,
  activo: true,
  // En cero a propósito: si pidiera cambiar la clave, el primer ingreso de la grabación
  // terminaría en la pantalla de cambio de contraseña en vez de en la cuenta corriente.
  debe_cambiar_clave: false,
}, { onConflict: 'id' })
if (errPerfil) salir(`No se pudo guardar el perfil: ${errPerfil.message}`)

console.log(`
✅ Cliente de demostración listo

   Usuario:  ${EMAIL}
   Clave:    ${CLAVE}
   Ve la cuenta corriente de: ${CUENTA}

   Para la grabación:
     $env:DEMO_CLIENTE_USUARIO="${EMAIL}"
     $env:DEMO_CLIENTE_CLAVE="${CLAVE}"
`)
