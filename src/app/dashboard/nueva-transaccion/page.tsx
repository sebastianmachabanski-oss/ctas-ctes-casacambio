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

  // El selector de cliente depende del Tipo (decisión 11/7/2026):
  //  - CTA CTE: SOLO cuentas corrientes reales (si se tipea un cliente eventual acá,
  //    la planilla calcula mal las fórmulas). Se elige de esta lista, sin alta libre.
  //  - CAJA: clientes eventuales, texto libre sin desplegable (regla de dominio:
  //    NO normalizado).
  const { data: cuentasData } = await supabase
    .from('cuentas_corrientes')
    .select('nombre')
    .eq('activo', true)
    .order('nombre')
  const cuentas = (cuentasData ?? []).map((c: any) => c.nombre)

  // Umbral de alerta en DÓLARES (configurable en app_config; tolerante si falta la
  // migración: usa el valor por defecto).
  let umbralUsd = 1000
  const { data: cfg } = await (supabase as any)
    .from('app_config').select('value').eq('key', 'umbral_alerta_usd').maybeSingle()
  const cfgUsd = (cfg as any)?.value?.usd
  if (typeof cfgUsd === 'number' && cfgUsd > 0) umbralUsd = cfgUsd

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <NuevaTransaccionForm cuentas={cuentas} umbralUsd={umbralUsd} puedeEditarUmbral={rol === 'superusuario'} />
    </div>
  )
}
