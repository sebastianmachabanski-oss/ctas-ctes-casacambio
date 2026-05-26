import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const CLAVE_INICIAL = 'Cliente1234!'

async function isSuperusuario(supabase: any, userId: string) {
  const { data } = await supabase.from('profiles').select('rol').eq('id', userId).single()
  return data?.rol === 'superusuario'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!await isSuperusuario(supabase, user.id)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const { data } = await supabase.from('profiles').select('*').order('nombre')
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!await isSuperusuario(supabase, user.id)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { email, nombre, rol, cuenta_cte, telefono, notas } = await request.json()
  if (!email || !nombre || !rol) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  if (rol === 'cliente' && !cuenta_cte) return NextResponse.json({ error: 'La cuenta corriente es obligatoria para clientes' }, { status: 400 })

  const { data, error } = await supabase.rpc('crear_usuario_admin', {
    p_email: email,
    p_password: CLAVE_INICIAL,
    p_nombre: nombre,
    p_rol: rol,
    p_cuenta_cte: cuenta_cte || null
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Guardar teléfono, notas y forzar cambio de clave
  await supabase.from('profiles').update({
    telefono: telefono || null,
    notas: notas || null,
    debe_cambiar_clave: true
  }).eq('id', data)

  return NextResponse.json({ success: true, clave_inicial: CLAVE_INICIAL })
}
