import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Estado de la sincronización, para que el botón de la app haga polling y confirme
// cuándo terminó: `updatedAt` cambia cuando una corrida escribió en base; `total` es
// la cantidad de movimientos CTA CTE actuales.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { data: st } = await supabase
    .from('sync_state').select('updated_at').eq('key', 'caja_modified_time').maybeSingle()

  const { count } = await supabase
    .from('diario').select('*', { count: 'exact', head: true }).eq('tipo', 'CTA CTE')

  return NextResponse.json({
    updatedAt: (st as any)?.updated_at ?? null,
    total: count ?? 0,
  })
}
