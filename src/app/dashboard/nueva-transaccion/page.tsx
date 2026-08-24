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
  //
  // OJO: hay más de 1.000 clientes y Postgrest corta CUALQUIER respuesta en 1.000 filas
  // si no se pagina. Sin el `range` la lista llegaba truncada y, como viene ordenada
  // alfabéticamente, los clientes del final del abecedario no aparecían nunca (25/8/2026).
  const traerNombres = async (tabla: string): Promise<string[]> => {
    const PAGINA = 1000
    const acc: string[] = []
    for (let desde = 0; ; desde += PAGINA) {
      const { data } = await supabase.from(tabla)
        .select('nombre').eq('activo', true).order('nombre')
        .range(desde, desde + PAGINA - 1)
      const filas = (data ?? []) as any[]
      acc.push(...filas.map(c => c.nombre))
      if (filas.length < PAGINA) break
    }
    return acc
  }

  const [cuentas, clientes] = await Promise.all([
    traerNombres('cuentas_corrientes'),
    traerNombres('clientes'),
  ])

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
