import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function generarClave(): string {
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minus = 'abcdefghjkmnpqrstuvwxyz'
  const nums  = '23456789'
  const esp   = '!@#$%&*'
  const todos = mayus + minus + nums + esp
  let pass = [
    mayus[Math.floor(Math.random() * mayus.length)],
    minus[Math.floor(Math.random() * minus.length)],
    nums [Math.floor(Math.random() * nums.length)],
    esp  [Math.floor(Math.random() * esp.length)],
  ]
  for (let i = 0; i < 6; i++) pass.push(todos[Math.floor(Math.random() * todos.length)])
  return pass.sort(() => Math.random() - 0.5).join('')
}

async function isSuperusuario(supabase: any, userId: string) {
  const { data } = await supabase.from('profiles').select('rol').eq('id', userId).single()
  return data?.rol === 'superusuario'
}

// PATCH: editar datos O cambiar clave O suspender
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!await isSuperusuario(supabase, user.id)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()

  // Cambiar clave
  if (body.reset_password) {
    const nuevaClave = generarClave()
    const { error } = await supabase.rpc('admin_cambiar_clave', {
      p_user_id: params.id,
      p_nueva_clave: nuevaClave
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, nueva_clave: nuevaClave })
  }

  // Editar perfil
  const updates: Record<string, unknown> = {}
  if (body.nombre    !== undefined) updates.nombre    = body.nombre
  if (body.rol       !== undefined) updates.rol       = body.rol
  if (body.cuenta_cte !== undefined) updates.cuenta_cte = body.cuenta_cte
  if (body.activo    !== undefined) updates.activo    = body.activo
  if (body.notas     !== undefined) updates.notas     = body.notas

  const { error } = await supabase.from('profiles').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
