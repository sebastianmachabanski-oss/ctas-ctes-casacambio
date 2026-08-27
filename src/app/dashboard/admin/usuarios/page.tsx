import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminUsuariosClient from './AdminUsuariosClient'
import { esAdmin } from '@/lib/roles'

// Siempre fresca: al crear o editar un usuario la pantalla se refresca sola, y con una
// versión guardada en caché el usuario nuevo no aparecía hasta recargar a mano.
export const dynamic = 'force-dynamic'

export default async function AdminUsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || !esAdmin((profile as any).rol)) redirect('/dashboard')

  const { data: usuarios } = await supabase.from('profiles').select('*').order('nombre')
  const { data: cuentas } = await supabase.from('cuentas_corrientes').select('nombre').eq('activo', true).order('nombre')

  return (
    <AdminUsuariosClient
      usuariosIniciales={(usuarios as any[]) ?? []}
      cuentas={(cuentas ?? []).map((c: any) => c.nombre)}
      miId={user.id}
      miRol={(profile as any).rol}
    />
  )
}
