import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'

// Alta de una cuenta corriente desde "Nueva transacción", cuando el nombre tipeado
// todavía no existe (pedido del 25/8/2026).
//
// POR QUÉ CON CONFIRMACIÓN EN LA PANTALLA: el nombre de la cuenta es la clave con la que
// se agrupan los saldos. Si se crea sin querer por un error de tipeo, "COLO" y "Colo"
// quedan como dos cuentas distintas y el saldo se parte en dos sin que nadie lo note.
// Por eso la pantalla pregunta antes de llamar acá, y acá se rechaza cualquier nombre
// que ya exista con otra combinación de mayúsculas.
//
// Usa el service role: la policy de escritura de `cuentas_corrientes` es solo para
// administradores, pero esta pantalla también la usa el rol operador — el permiso ya se
// valida arriba.
/**
 * Deja el nombre en `clientes`, que es el padrón del que sale el desplegable del filtro
 * del listado de transacciones.
 *
 * POR QUÉ HACE FALTA (12/11/2026)
 * `clientes` la llenaba SOLO la sincronización desde la planilla. Una cuenta creada desde
 * la app quedaba en `cuentas_corrientes` pero no en el padrón, así que sus movimientos se
 * veían en el listado y el filtro no la ofrecía: para el operador, el filtro "no
 * encontraba" algo que estaba a la vista. Pasó en producción con dos cuentas.
 *
 * No corta el alta si falla: la cuenta ya quedó creada, y quedarse sin poder filtrarla es
 * mucho menos grave que no poder crearla.
 */
async function anotarEnPadron(admin: ReturnType<typeof createAdminClient>, nombre: string) {
  const { error } = await admin.from('clientes')
    .upsert({ nombre, activo: true }, { onConflict: 'nombre', ignoreDuplicates: true })
  if (error) console.error('No se pudo anotar en el padrón de clientes:', error.message)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!esStaff((profile as any)?.rol))
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  const nombre = String(body?.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 })

  const admin = createAdminClient()

  // Choque por mayúsculas/minúsculas: devolver la que ya existe en vez de crear un duplicado.
  const { data: existente } = await admin
    .from('cuentas_corrientes').select('nombre, activo').ilike('nombre', nombre).maybeSingle()

  if (existente) {
    if (!existente.activo) {
      await admin.from('cuentas_corrientes').update({ activo: true }).eq('nombre', existente.nombre)
    }
    await anotarEnPadron(admin, existente.nombre)
    return NextResponse.json({ success: true, nombre: existente.nombre, ya_existia: true })
  }

  const { error } = await admin.from('cuentas_corrientes').insert({ nombre, activo: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await anotarEnPadron(admin, nombre)
  return NextResponse.json({ success: true, nombre, ya_existia: false })
}
