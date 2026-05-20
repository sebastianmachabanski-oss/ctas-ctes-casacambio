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

  const { email, nombre, rol, cuenta_cte } = await request.json()
  if (!email || !nombre || !rol) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  const clave = generarClave()

  const { data, error } = await supabase.rpc('crear_usuario_admin', {
    p_email: email, p_password: clave, p_nombre: nombre,
    p_rol: rol, p_cuenta_cte: cuenta_cte || null
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, clave_generada: clave, data })
}
