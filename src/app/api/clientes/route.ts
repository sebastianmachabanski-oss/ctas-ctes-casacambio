import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// Alta manual de un cliente nuevo desde "Nueva Transacción" (cliente nuevo o eventual
// que todavía no aparece en la planilla). Se agrega ya mismo a la tabla `clientes` para
// que sea buscable de inmediato, sin esperar al próximo sync — que de todos modos lo va
// a re-confirmar la próxima vez que corra, una vez que la transacción quede escrita en
// la planilla con este nombre.
//
// Usa el service role: la política de escritura de `clientes` es solo para superusuario,
// pero esta pantalla también la usa el rol operador — el permiso ya se valida acá arriba.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profile as any)?.rol
  if (rol !== 'superusuario' && rol !== 'operador')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  const nombre = String(body?.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'Nombre vacío' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('clientes')
    .upsert({ nombre, activo: true }, { onConflict: 'nombre' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, nombre })
}
