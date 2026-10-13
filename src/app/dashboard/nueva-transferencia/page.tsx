import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NuevaTransferenciaForm from './NuevaTransferenciaForm'
import { esStaff } from '@/lib/roles'

export default async function NuevaTransferenciaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!esStaff((profileData as any)?.rol)) redirect('/dashboard')

  // Sugerencias de participantes. Mismo padrón que usa el alta común y misma precaución:
  // Postgrest corta en 1.000 filas y hay más clientes que eso, así que sin paginar
  // faltarían los del final del abecedario.
  const PAGINA = 1000
  const clientes: string[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data } = await supabase.from('clientes')
      .select('nombre').eq('activo', true).order('nombre')
      .range(desde, desde + PAGINA - 1)
    const filas = (data ?? []) as any[]
    clientes.push(...filas.map(c => c.nombre))
    if (filas.length < PAGINA) break
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Nueva transferencia</h1>
        <p className="text-sm text-gray-500 mt-1">
          Las dos patas se cargan juntas. Así no quedan transferencias a medio cargar, que
          desbalancean la ganancia del período y se descubren días después.
        </p>
      </div>
      <NuevaTransferenciaForm clientes={clientes} />
    </div>
  )
}
