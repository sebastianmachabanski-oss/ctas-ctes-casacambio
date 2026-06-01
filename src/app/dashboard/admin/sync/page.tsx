import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SyncClient from './SyncClient'

export default async function SyncPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario') redirect('/dashboard')

  // Último estado del diario
  const { count } = await supabase.from('diario')
    .select('*', { count: 'exact', head: true })
    .eq('tipo', 'CTA CTE').eq('anulado', false)

  const { data: ultimoMov } = await supabase.from('diario')
    .select('created_at').eq('tipo', 'CTA CTE')
    .order('created_at', { ascending: false }).limit(1)

  return (
    <SyncClient
      totalMovimientos={count ?? 0}
      ultimaSync={ultimoMov?.[0]?.created_at ?? null}
    />
  )
}
