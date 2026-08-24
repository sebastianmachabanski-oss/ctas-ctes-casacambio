import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NuevaTransaccionForm from './NuevaTransaccionForm'
import { esAdmin, esStaff } from '@/lib/roles'

export default async function NuevaTransaccionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as any)?.rol
  if (!esStaff(rol)) redirect('/dashboard')

  // El selector de cliente depende del Tipo:
  //  - CTA CTE: se elige de las cuentas reales. Si el nombre no existe, la pantalla
  //    ofrece crearla previa confirmación (25/8/2026) — antes era imposible y había que
  //    ir a Usuarios.
  //  - CAJA: sugerencias de los clientes ya conocidos, pero SIGUE siendo texto libre.
  //    La regla de dominio del 5/7/2026 no cambia: son clientes eventuales y no se
  //    normalizan. El desplegable ayuda a no re-tipear, no obliga a elegir.
  const [{ data: cuentasData }, { data: clientesData }] = await Promise.all([
    supabase.from('cuentas_corrientes').select('nombre').eq('activo', true).order('nombre'),
    supabase.from('clientes').select('nombre').eq('activo', true).order('nombre'),
  ])
  const cuentas  = (cuentasData  ?? []).map((c: any) => c.nombre)
  const clientes = (clientesData ?? []).map((c: any) => c.nombre)

  // Umbral de alerta en DÓLARES (configurable en app_config; tolerante si falta la
  // migración: usa el valor por defecto).
  let umbralUsd = 1000
  const { data: cfg } = await (supabase as any)
    .from('app_config').select('value').eq('key', 'umbral_alerta_usd').maybeSingle()
  const cfgUsd = (cfg as any)?.value?.usd
  if (typeof cfgUsd === 'number' && cfgUsd > 0) umbralUsd = cfgUsd

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <NuevaTransaccionForm cuentas={cuentas} clientes={clientes} umbralUsd={umbralUsd} puedeEditarUmbral={esAdmin(rol)} />
    </div>
  )
}
