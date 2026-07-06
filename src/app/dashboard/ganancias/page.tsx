import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Módulo de Ganancias — acceso por permiso INDIVIDUAL (profiles.ve_ganancias), no por
// rol: lo asigna el superusuario desde la pantalla de Usuarios. El contenido (réplica
// parametrizable de la solapa COLO, ya validada al peso contra la planilla) se conecta
// cuando el cliente apruebe el mockup (ítem 7 de docs/PLAN-VS-REAL.md).
export default async function GananciasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol, ve_ganancias').eq('id', user.id).single()
  const profile = profileData as { rol: string; ve_ganancias?: boolean } | null
  if (!profile?.ve_ganancias) redirect('/dashboard')

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Ganancias</h1>
        <p className="text-gray-500 text-sm mt-1">Resultados del negocio</p>
      </div>

      <div className="card p-8 text-center space-y-3">
        <p className="text-4xl">💰</p>
        <p className="font-semibold text-gray-900">Módulo en construcción</p>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          El cálculo ya está desarrollado y validado contra la planilla (réplica exacta de la
          solapa COLO, con los supuestos parametrizables). Se conecta a esta pantalla apenas
          se apruebe el diseño que está en revisión.
        </p>
        <p className="text-xs text-gray-400">
          Tenés acceso a este módulo porque tu usuario tiene el permiso 💰 Ganancias.
        </p>
      </div>
    </div>
  )
}
