import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  await supabase.rpc('marcar_clave_cambiada', { p_user_id: user.id })

  return NextResponse.json({ success: true })
}
