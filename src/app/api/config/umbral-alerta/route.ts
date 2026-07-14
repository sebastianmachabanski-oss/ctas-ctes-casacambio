import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Actualiza el umbral de alerta de Nueva transacción (en DÓLARES). Solo superusuario.
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if ((profile as any)?.rol !== 'superusuario')
    return NextResponse.json({ error: 'Solo el superusuario puede cambiar el umbral' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const usd = Number(body.usd)
  if (!isFinite(usd) || usd <= 0)
    return NextResponse.json({ error: 'El umbral debe ser un número mayor a 0 (en dólares)' }, { status: 400 })

  const { error } = await (supabase as any).from('app_config').upsert(
    { key: 'umbral_alerta_usd', value: { usd }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, usd })
}
