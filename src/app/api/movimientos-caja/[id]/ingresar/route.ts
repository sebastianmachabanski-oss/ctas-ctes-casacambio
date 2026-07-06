import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Marca que el dinero "en la calle" ingresó a la caja: borra el campo DEBE (repartidor),
// igual que hacen hoy en la planilla. NO escribe en el Google Sheet: si la planilla
// conserva el DEBE, el próximo sync lo vuelve a traer (comportamiento asumido durante
// la convivencia, avisado en la pantalla).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  if ((profile as any)?.rol !== 'superusuario')
    return NextResponse.json({ error: 'Solo el superusuario puede registrar el ingreso' }, { status: 403 })

  const { error } = await supabase.from('movimientos_caja').update({
    debe: null,
    editado_por: (profile as any)?.nombre ?? user.email ?? 'app',
    editado_at: new Date().toISOString(),
  }).eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
