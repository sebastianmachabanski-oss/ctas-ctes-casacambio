import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuditoriaView from '@/components/auditoria/AuditoriaView'

// Registro de actividad: quién hizo qué y cuándo (tabla `auditoria`, append-only).
// Exclusivo del superusuario — la policy de SELECT ya lo restringe en la base, acá se
// corta antes para no mostrar una pantalla vacía a quien no corresponde.

const POR_PAGINA = 100

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; accion?: string; usuario?: string; pagina?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if ((profileData as { rol: string } | null)?.rol !== 'superusuario') redirect('/dashboard')

  const desde   = searchParams.desde || ''
  const hasta   = searchParams.hasta || ''
  const accion  = searchParams.accion || ''
  const usuario = searchParams.usuario || ''
  const pagina  = Math.max(1, parseInt(searchParams.pagina ?? '1', 10) || 1)

  let query = supabase.from('auditoria')
    .select('*', { count: 'exact' })
    .order('ts', { ascending: false })
  // `ts` es timestamptz y los filtros son fechas: se toma el día completo.
  if (desde)   query = query.gte('ts', `${desde}T00:00:00`)
  if (hasta)   query = query.lte('ts', `${hasta}T23:59:59.999`)
  if (accion)  query = query.eq('accion', accion)
  if (usuario) query = query.ilike('usuario_nombre', `%${usuario}%`)
  query = query.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)

  const { data, count, error } = await query
  const eventos = (data ?? []) as any[]
  const total = count ?? eventos.length
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <div className="p-4 md:p-6">
      {error ? (
        <div className="card p-6 text-center text-red-600 text-sm">
          No se pudo cargar la auditoría: {error.message}
          <div style={{ marginTop: 8, color: 'var(--muted)' }}>
            ¿Se corrió la migración <code>2026-07-29_auditoria.sql</code>?
          </div>
        </div>
      ) : (
        <AuditoriaView
          eventos={eventos}
          desde={desde} hasta={hasta} accion={accion} usuario={usuario}
          total={total} pagina={pagina} totalPaginas={totalPaginas}
        />
      )}
    </div>
  )
}
