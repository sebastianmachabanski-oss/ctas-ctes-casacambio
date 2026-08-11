import { createClient, createAdminClient } from '@/lib/supabase/server'
import { registrarAuditoria } from '@/lib/auditoria'
import { esAdmin, veGanancias, puedeAsignarRol, puedeAdministrarA, ROL_LABEL, type Rol } from '@/lib/roles'
import { NextResponse } from 'next/server'

const CLAVE_INICIAL = 'Cliente1234!'

// Contención del administrador (definido 11/8/2026).
//
// `administrador` tiene acceso total salvo Ganancias; `superadmin` lo tiene todo. Sin
// las reglas de abajo, un administrador llegaba a Ganancias por tres caminos:
//   1. cambiándose el rol a sí mismo desde la pantalla de Usuarios,
//   2. creando otro usuario como superadmin y entrando con él,
//   3. reseteando la clave de un superadmin —queda en la inicial conocida— y
//      entrando como él.
// La 3 es la determinante: quien administra credenciales puede hacerse pasar por
// cualquiera, así que sin cerrarla las otras dos son decorativas.
type Perfil = { id: string; nombre: string | null; rol: string | null }

async function perfil(client: any, id: string): Promise<Perfil | null> {
  const { data } = await client.from('profiles').select('id, nombre, rol').eq('id', id).single()
  return data ?? null
}

/** Autentica y aplica las reglas comunes. Devuelve el error listo para responder, o los perfiles. */
async function autorizar(params: { id: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }

  const admin = createAdminClient()
  const actor = await perfil(supabase, user.id)
  if (!esAdmin(actor?.rol)) {
    return { error: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) }
  }

  const objetivo = await perfil(admin, params.id)

  // Un administrador no puede tocar la cuenta de un superadmin: ni editarla, ni
  // desactivarla, ni resetearle la clave, ni borrarla.
  if (objetivo && objetivo.id !== actor!.id && !puedeAdministrarA(actor?.rol, objetivo.rol)) {
    return {
      error: NextResponse.json(
        { error: 'No podés administrar la cuenta de un Superadmin.' },
        { status: 403 },
      ),
    }
  }

  return { admin, actor, objetivo }
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

  // Se compara contra el valor actual: el formulario reenvía todos los campos, así que
  // rechazar por "vino en el body" bloquearía hasta un cambio de teléfono.
  const cambiaRol = updates.rol !== undefined && updates.rol !== objetivo?.rol

  if (cambiaRol && esSuPropioUsuario) {
    return NextResponse.json({ error: 'No podés modificar tu propio rol.' }, { status: 403 })
  }

  // Nadie asigna un nivel al que no llega.
  if (cambiaRol && !puedeAsignarRol(actor?.rol, String(updates.rol))) {
    return NextResponse.json(
      { error: `Solo un Superadmin puede asignar el rol ${ROL_LABEL[updates.rol as Rol] ?? updates.rol}.` },
      { status: 403 },
    )
  }

  const { error } = await admin!.from('profiles').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (cambiaRol) {
    await registrarAuditoria(admin, {
      usuarioId: actor!.id, usuarioNombre: actor!.nombre ?? '—', usuarioRol: actor!.rol,
      accion: 'usuario', entidad: 'profiles',
      resumen: `Cambió el rol de ${objetivo?.nombre ?? params.id}: ` +
               `${ROL_LABEL[objetivo?.rol as Rol] ?? objetivo?.rol} → ${ROL_LABEL[updates.rol as Rol] ?? updates.rol}`,
      campos: ['rol'],
      datosAntes:   { rol: objetivo?.rol },
      datosDespues: { rol: updates.rol },
    })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await autorizar(params)
  if (auth.error) return auth.error
  const { admin, actor, objetivo } = auth

  // Un superadmin es la única cuenta que puede llegar a Ganancias: borrarse a sí mismo
  // dejaría el módulo inaccesible sin forma de recuperarlo desde la app.
  if (params.id === actor!.id && veGanancias(actor?.rol)) {
    return NextResponse.json({ error: 'Un Superadmin no puede borrar su propia cuenta.' }, { status: 403 })
  }

  // Intentar borrar de auth (puede no existir si fue creado con el RPC viejo)
  await admin!.auth.admin.deleteUser(params.id)

  // Siempre borrar el perfil
  const { error } = await admin!.from('profiles').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrarAuditoria(admin, {
    usuarioId: actor!.id, usuarioNombre: actor!.nombre ?? '—', usuarioRol: actor!.rol,
    accion: 'usuario', entidad: 'profiles',
    resumen: `Borró el usuario ${objetivo?.nombre ?? params.id} (${ROL_LABEL[objetivo?.rol as Rol] ?? objetivo?.rol})`,
    datosAntes: objetivo as any,
  })
  return NextResponse.json({ success: true })
}
