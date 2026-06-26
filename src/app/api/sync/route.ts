import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  try {
    // GET con el secreto (en query y header). El middleware deja pasar /.netlify/.
    const res = await fetch(
      `${base}/.netlify/functions/sync-background?mode=${mode}&secret=${encodeURIComponent(secret)}`,
      { headers: { 'x-sync-secret': secret } }
    )
    if (!res.ok) {
      return NextResponse.json(
        { error: `No se pudo iniciar la sincronización (HTTP ${res.status})` },
        { status: 502 }
      )
    }
    return NextResponse.json({ started: true, mode })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error al iniciar la sincronización: ' + err.message }, { status: 500 })
  }
}
