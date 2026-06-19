import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const CLAVE_INICIAL = 'Cliente1234!'

async function isSuperusuario(supabase: any, userId: string) {
  const { data } = await supabase.from('profiles').select('rol').eq('id', userId).single()
  return data?.rol === 'superusuario'
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!await isSuperusuario(supabase, user.id)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  const admin = createAdminClient()

  // Restablecer contraseña
  if (body.reset_password) {
    const { error } = await admin.auth.admin.updateUserById(params.id, { password: CLAVE_INICIAL })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await admin.from('profiles').update({ debe_cambiar_clave: true }).eq('id', params.id)
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

  const { error } = await admin.from('profiles').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!await isSuperusuario(supabase, user.id)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
