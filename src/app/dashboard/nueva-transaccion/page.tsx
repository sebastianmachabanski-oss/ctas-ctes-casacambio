import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NuevaTransaccionForm from './NuevaTransaccionForm'

export default async function NuevaTransaccionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as any)?.rol
  if (rol !== 'superusuario' && rol !== 'operador') redirect('/dashboard')

  const { data: cuentas } = await supabase
    .from('cuentas_corrientes')
    .select('nombre')
    .eq('activo', true)
    .order('nombre')

  return (
    <div className="p-4 md:p-8 max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Nueva transacción</h1>
      <NuevaTransaccionForm cuentas={(cuentas ?? []).map(c => c.nombre)} />
    </div>
  )
}
