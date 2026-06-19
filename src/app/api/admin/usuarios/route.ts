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

  const debug: any = { step: 'init', email }
  const ser = (e: any) => e && JSON.parse(JSON.stringify(e, Object.getOwnPropertyNames(e)))

  try {
    const admin = createAdminClient()
    const emailLower = email.toLowerCase()

    // Buscar y borrar usuario(s) de Auth preexistentes con el mismo email.
    debug.step = 'listUsers'
    let encontrados = 0
    for (let page = 1; page <= 50; page++) {
      const { data: existing, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (listErr) { debug.listError = ser(listErr); break }
      const users = existing?.users ?? []
      for (const u of users as any[]) {
        if ((u.email ?? '').toLowerCase() === emailLower) {
          encontrados++
          debug.step = 'deleteUser'
          const { error: delErr } = await admin.auth.admin.deleteUser(u.id)
          if (delErr) debug.deleteError = ser(delErr)
        }
      }
      if (users.length < 1000) break
    }
    debug.preexistentesEnAuth = encontrados

    // Limpiar perfil huérfano (mismo email, sin auth user)
    debug.step = 'deleteProfile'
    const { error: delProfErr } = await admin.from('profiles').delete().eq('email', email)
    if (delProfErr) debug.deleteProfileError = ser(delProfErr)

    // Crear usuario en Supabase Auth
    debug.step = 'createUser'
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password: CLAVE_INICIAL,
      email_confirm: true,
      user_metadata: { nombre, rol, cuenta_cte: cuenta_cte || null },
    })
    if (createError) {
      return NextResponse.json({ error: createError.message, debug: { ...debug, createError: ser(createError) } }, { status: 500 })
    }

    // Upsert perfil
    debug.step = 'upsertProfile'
    debug.newUserId = newUser.user.id
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
    if (profileError) {
      return NextResponse.json({ error: profileError.message, debug: { ...debug, profileError: ser(profileError) } }, { status: 500 })
    }

    return NextResponse.json({ success: true, clave_inicial: CLAVE_INICIAL })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error inesperado', debug: { ...debug, exception: ser(e) } }, { status: 500 })
  }
}
