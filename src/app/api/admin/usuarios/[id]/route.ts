import { createClient, createAdminClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { NextResponse } from 'next/server'

const CLAVE_INICIAL = 'Cliente1234!'

// Reglas de contención del administrador del sistema (definido 11/8/2026).
//
// El rol `superusuario` administra usuarios pero NO necesariamente ve Ganancias: el
// permiso `ve_ganancias` es del dueño. Sin estas reglas, un superusuario sin acceso a
// Ganancias podía obtenerlo de tres formas distintas:
//   1. marcándose el permiso a sí mismo desde la pantalla de Usuarios,
//   2. creando otro usuario y marcándoselo a ese, para después entrar con él,
//   3. reseteando la clave del dueño (queda en la inicial conocida) y entrando como él.
// Las tres se cierran acá, del lado del servidor. La 3 es la importante: sin ella
// cualquier otra restricción es decorativa, porque quien administra credenciales puede
// hacerse pasar por cualquiera.
type Perfil = { id: string; nombre: string | null; rol: string | null; ve_ganancias: boolean }

async function perfil(client: any, id: string): Promise<Perfil | null> {
  const { data } = await client
    .from('profiles').select('id, nombre, rol, ve_ganancias').eq('id', id).single()
  return data ? { ...data, ve_ganancias: !!data.ve_ganancias } : null
}

/** Autentica y aplica las reglas comunes. Devuelve el error listo para responder, o los perfiles. */
async function autorizar(params: { id: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }

  const admin = createAdminClient()
  const actor = await perfil(supabase, user.id)
  if (actor?.rol !== 'superusuario') {
    return { error: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) }
  }

  const objetivo = await perfil(admin, params.id)

  // Un superusuario sin acceso a Ganancias no puede tocar la cuenta de quien sí lo
  // tiene: ni editarla, ni desactivarla, ni resetearle la clave, ni borrarla.
  if (objetivo?.ve_ganancias && !actor.ve_ganancias && objetivo.id !== actor.id) {
    return {
      error: NextResponse.json(
        { error: 'No podés administrar la cuenta de un usuario con acceso a Ganancias.' },
        { status: 403 },
      ),
    }
  }

  return { supabase, admin, actor, objetivo }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await autorizar(params)
  if (auth.error) return auth.error
  const { admin, actor, objetivo } = auth

  const body = await request.json()
  const esSuPropioUsuario = params.id === actor!.id

  // Restablecer contraseña
  if (body.reset_password) {
    const { error } = await admin!.auth.admin.updateUserById(params.id, { password: CLAVE_INICIAL })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await admin!.from('profiles').update({ debe_cambiar_clave: true }).eq('id', params.id)
    await registrarAuditoria(admin, {
      usuarioId: actor!.id, usuarioNombre: actor!.nombre ?? '—', usuarioRol: actor!.rol,
      accion: 'usuario', entidad: 'profiles',
      resumen: `Restableció la contraseña de ${objetivo?.nombre ?? params.id}`,
    })
    return NextResponse.json({ success: true, clave: CLAVE_INICIAL })
  }

  // Editar perfil
  const updates: Record<string, unknown> = {}
  if (body.nombre     !== undefined) updates.nombre     = body.nombre
  if (body.rol        !== undefined) updates.rol        = body.rol
  if (body.cuenta_cte !== undefined) updates.cuenta_cte = body.cuenta_cte
  if (body.activo     !== undefined) updates.activo     = body.activo
  if (body.telefono   !== undefined) updates.telefono   = body.telefono
  if (body.notas      !== undefined) updates.notas      = body.notas
  if (body.ve_ganancias !== undefined) updates.ve_ganancias = !!body.ve_ganancias

  // Se comparan contra el valor actual: el formulario reenvía todos los campos, así que
  // rechazar por "vino en el body" bloquearía hasta un cambio de teléfono.
  const cambia = (campo: keyof Perfil) =>
    updates[campo] !== undefined && updates[campo] !== (objetivo as any)?.[campo]

  if (esSuPropioUsuario && (cambia('rol') || cambia('ve_ganancias'))) {
    return NextResponse.json(
      { error: 'No podés modificar tu propio rol ni tus propios permisos.' },
      { status: 403 },
    )
  }

  // Nadie otorga lo que no tiene.
  if (cambia('ve_ganancias') && !actor!.ve_ganancias) {
    return NextResponse.json(
      { error: 'Solo un usuario con acceso a Ganancias puede otorgar o quitar ese permiso.' },
      { status: 403 },
    )
  }

  const permisoCambia = cambia('ve_ganancias') || cambia('rol')
  const { error } = await admin!.from('profiles').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (permisoCambia) {
    await registrarAuditoria(admin, {
      usuarioId: actor!.id, usuarioNombre: actor!.nombre ?? '—', usuarioRol: actor!.rol,
      accion: 'usuario', entidad: 'profiles',
      resumen: `Cambió rol/permisos de ${objetivo?.nombre ?? params.id}`,
      campos: [cambia('rol') ? 'rol' : null, cambia('ve_ganancias') ? 've_ganancias' : null]
        .filter(Boolean) as string[],
      datosAntes:   { rol: objetivo?.rol, ve_ganancias: objetivo?.ve_ganancias },
      datosDespues: { rol: updates.rol ?? objetivo?.rol, ve_ganancias: updates.ve_ganancias ?? objetivo?.ve_ganancias },
    })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await autorizar(params)
  if (auth.error) return auth.error
  const { admin, actor, objetivo } = auth

  // Intentar borrar de auth (puede no existir si fue creado con el RPC viejo)
  await admin!.auth.admin.deleteUser(params.id)

  // Siempre borrar el perfil
  const { error } = await admin!.from('profiles').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrarAuditoria(admin, {
    usuarioId: actor!.id, usuarioNombre: actor!.nombre ?? '—', usuarioRol: actor!.rol,
    accion: 'usuario', entidad: 'profiles',
    resumen: `Borró el usuario ${objetivo?.nombre ?? params.id}`,
    datosAntes: objetivo as any,
  })
  return NextResponse.json({ success: true })
}
