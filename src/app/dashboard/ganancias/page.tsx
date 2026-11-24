import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GananciasView from '@/components/ganancias/GananciasView'
import NavGanancias from '@/components/ganancias/NavGanancias'
import { veGanancias } from '@/lib/roles'
import { esPeriodoValido, hoyArgentina, rangoDe } from '@/lib/periodos'
import { cargarGanancias } from '@/lib/ganancias-datos'

// Módulo de Ganancias — exclusivo del rol superadmin (ver src/lib/roles.ts).
// Réplica de la solapa COLO: el servidor agrega por día las operaciones COMPRA/VENTA/
// GASTOS del período usando las columnas CALCULADAS POR EL MOTOR (exactitud garantizada);
// el cliente aplica la configuración (par, cta cte, valuación del stock, gastos) sin
// volver a consultar.
//
// La carga vive en `src/lib/ganancias-datos.ts` porque la comparte con la pantalla de
// composición; el cálculo, en `src/lib/ganancias-composicion.ts`.
//
// Los "Reportes de caja" —saldos por cliente y evolución del saldo en dólares— se sacaron
// el 24/11/2026: contestaban "cuánto me debe cada uno", que es la pregunta de Cuentas
// Corrientes y Deudores, no la de esta pantalla. La vista `caja_clientes` y las funciones
// `caja_clientes_periodo` y `caja_saldo_diario` quedaron en la base sin que nadie las
// llame; borrarlas es una migración aparte.

export default async function GananciasPage({
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

  // Período: p=dia|semana|mes|anio con fecha cursor, o rango explícito desde/hasta.
  const hoy = hoyArgentina()
  // Por defecto abre en DÍA (26/8/2026): la pregunta de todos los días es cuánto se ganó
  // hoy, y con el mes por defecto había que cambiar el período en cada visita.
  const p = esPeriodoValido(searchParams.p) ? searchParams.p! : 'dia'
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? '') ? searchParams.fecha! : hoy
  const esRango = !!(searchParams.desde && searchParams.hasta)
  const [ini, fin] = esRango ? [searchParams.desde!, searchParams.hasta!] : rangoDe(p, fecha)

  const { dias, abiertas, puntasAbiertas, paresNegativos } = await cargarGanancias(supabase, ini, fin)

  // El período viaja a las otras vistas para no perderlo al cambiar de pantalla.
  const qs = new URLSearchParams(
    esRango ? { desde: searchParams.desde!, hasta: searchParams.hasta! } : { p, fecha },
  ).toString()

  return (
    <GananciasView
      nav={<NavGanancias actual="moneda" qs={qs} />}
      dias={dias}
      abiertas={abiertas}
      puntasAbiertas={puntasAbiertas}
      paresNegativos={paresNegativos}
      periodo={esRango ? '' : p}
      fecha={fecha}
      rDesde={esRango ? searchParams.desde! : ''}
      rHasta={esRango ? searchParams.hasta! : ''}
      hoy={hoy}
    />
  )
}
