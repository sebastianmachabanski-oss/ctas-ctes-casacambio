import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const maxDuration = 30

// El botón "Sincronizar" de la app NO procesa el Excel de forma síncrona: descargar y
// parsear ~33k filas excede el timeout de la ruta y se cuelga. En su lugar dispara la
// función background `sync-background` (igual que cron-job.org), que hace el trabajo en
// segundo plano (hasta 15 min) y devuelve enseguida. Por defecto, modo incremental.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const mode = new URL(request.url).searchParams.get('mode') === 'full' ? 'full' : 'incremental'
  const secret = process.env.SYNC_SECRET || ''
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(request.url).origin

  // sync_state tiene RLS sin políticas de usuario; hay que usar el service role para leerla.
  // Marca de la última corrida ANTES de disparar: la UI hace polling y sabe que terminó
  // cuando esta marca cambia (la función la actualiza al final de cada corrida).
  const admin = createAdminClient()
  const { data: st } = await admin
    .from('sync_state').select('value').eq('key', 'last_run').maybeSingle()
  const before = (st as any)?.value ?? null

  try {
    // force=1: el botón manual siempre procesa (aunque no haya cambios) para poder confirmar.
    // GET con el secreto (en query y header). El middleware deja pasar /.netlify/.
    const res = await fetch(
      `${base}/.netlify/functions/sync-background?mode=${mode}&force=1&secret=${encodeURIComponent(secret)}`,
      { headers: { 'x-sync-secret': secret } }
    )
    if (!res.ok) {
      return NextResponse.json(
        { error: `No se pudo iniciar la sincronización (HTTP ${res.status})` },
        { status: 502 }
      )
    }
    return NextResponse.json({ started: true, mode, before })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error al iniciar la sincronización: ' + err.message }, { status: 500 })
  }
}
