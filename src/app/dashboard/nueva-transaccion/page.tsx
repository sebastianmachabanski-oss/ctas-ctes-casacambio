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

  // Unión de todos los nombres que aparecen en las columnas CLIENTE y CAJA de la planilla
  // (la calcula el sync). Distinto de `cuentas_corrientes`, que solo tiene clientes con
  // movimientos de tipo CTA CTE.
  //
  // Postgrest corta cada consulta en un máximo de filas (por defecto 1000) aunque no se
  // pida un .limit() explícito — con miles de clientes hay que paginar con .range() para
  // traerlos todos, si no la lista llega incompleta (cortada a mitad del alfabeto).
  const clientes: string[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from('clientes')
      .select('nombre')
      .eq('activo', true)
      .order('nombre')
      .range(from, from + PAGE - 1)
    if (!page || !page.length) break
    clientes.push(...page.map(c => c.nombre))
    if (page.length < PAGE) break
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <NuevaTransaccionForm clientes={clientes} />
    </div>
  )
}
