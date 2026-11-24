import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ComposicionView from '@/components/ganancias/ComposicionView'
import { veGanancias } from '@/lib/roles'
import { esPeriodoValido, hoyArgentina, rangoDe } from '@/lib/periodos'
import { cargarGanancias } from '@/lib/ganancias-datos'

// De dónde sale la ganancia del período (24/11/2026).
//
// Misma fuente y mismo período que /dashboard/ganancias —comparten `cargarGanancias`—,
// pero la cuenta es la del negocio entero en vez de la de una moneda. Ver
// `src/lib/ganancias-composicion.ts`.
//
// La ruta cuelga de /dashboard/ganancias, así que el interruptor de módulo la cubre sola:
// `moduloDeRuta` busca por prefijo (ver src/lib/configuracion.ts). Apagar 'ganancias'
// apaga también esta pantalla, que es lo que corresponde.

export default async function ComposicionPage({
  searchParams,
}: {
  searchParams: { p?: string; fecha?: string; desde?: string; hasta?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const profile = profileData as { rol: string } | null

  if (!veGanancias(profile?.rol)) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <div className="card p-8 text-center space-y-3">
          <p className="text-4xl">🔒</p>
          <p className="font-semibold text-gray-900">Acceso restringido</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            El módulo de Ganancias es exclusivo del rol <b>Superadmin</b>, que tu usuario no tiene.
            Solo otro Superadmin puede asignarlo, desde la pantalla de <b>Usuarios</b>.
          </p>
        </div>
      </div>
    )
  }

  const hoy = hoyArgentina()
  // Abre en MES, al revés que Ganancias. Esa pantalla contesta "cuánto gané hoy"; esta
  // contesta "de dónde salió", y la composición de un solo día es casi siempre una moneda
  // y un par de operaciones: no hay nada que componer.
  const p = esPeriodoValido(searchParams.p) ? searchParams.p! : 'mes'
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? '') ? searchParams.fecha! : hoy
  const esRango = !!(searchParams.desde && searchParams.hasta)
  const [ini, fin] = esRango ? [searchParams.desde!, searchParams.hasta!] : rangoDe(p, fecha)

  const { dias } = await cargarGanancias(supabase, ini, fin)

  return (
    <ComposicionView
      dias={dias}
      periodo={esRango ? '' : p}
      fecha={fecha}
      rDesde={esRango ? searchParams.desde! : ''}
      rHasta={esRango ? searchParams.hasta! : ''}
      hoy={hoy}
    />
  )
}
