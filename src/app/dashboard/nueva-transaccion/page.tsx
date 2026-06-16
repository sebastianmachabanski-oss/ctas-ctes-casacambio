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
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Nueva transacción</h1>
        <p className="text-gray-500 text-sm mt-1">Registrá un movimiento de caja o cuenta corriente</p>
      </div>

      <div className="max-w-3xl">
        <NuevaTransaccionForm cuentas={(cuentas ?? []).map(c => c.nombre)} />
      </div>
    </div>
  )
}
