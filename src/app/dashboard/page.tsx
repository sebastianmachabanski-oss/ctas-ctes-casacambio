import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile) redirect('/login')
  // Staff arranca en el tablero de Inicio; el cliente en su cuenta corriente.
  const rol = (profile as any).rol
  if (rol === 'superusuario' || rol === 'operador') redirect('/dashboard/inicio')
  redirect('/dashboard/cuenta-corriente')
}
