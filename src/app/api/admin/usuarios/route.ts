import { createClient, createAdminClient } from '@/lib/supabase/server'
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

  const admin = createAdminClient()

  // Crear usuario en Supabase Auth — se pasa metadata para que el trigger de profiles lo use
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password: CLAVE_INICIAL,
    email_confirm: true,
    user_metadata: { nombre, rol, cuenta_cte: cuenta_cte || null },
  })
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })

  // Upsert perfil (por si el trigger no lo creó o para completar campos)
  const { error: profileError } = await admin.from('profiles').upsert({
    id: newUser.user.id,
    email,
    nombre,
    rol,
    cuenta_cte: cuenta_cte || null,
    telefono: telefono || null,
    notas: notas || null,
    debe_cambiar_clave: true,
    activo: true,
  }, { onConflict: 'id' })
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  return NextResponse.json({ success: true, clave_inicial: CLAVE_INICIAL })
}
