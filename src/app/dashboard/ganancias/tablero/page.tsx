import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TableroView from '@/components/ganancias/TableroView'
import NavGanancias from '@/components/ganancias/NavGanancias'
import { veGanancias } from '@/lib/roles'
import { hoyArgentina } from '@/lib/periodos'
import { cargarGanancias } from '@/lib/ganancias-datos'
import {
  compararUltimo, inicioDeVentana, serieMensual, tramoDeComparacion, MESES_TABLERO,
} from '@/lib/ganancias-series'

// Tablero de Ganancias (24/11/2026): trece meses y la comparación.
//
// Es la única de las tres pantallas que mira MÁS DE UN PERÍODO, y por eso el período no
// se elige con el selector de siempre: una serie mensual de trece "días" no significa
// nada. Se navega por mes con ?mes=AAAA-MM.
//
// UNA SOLA CARGA para los trece meses, no trece. Además del costo, `repartirTT` decide
// qué transferencias están realizadas mirando la historia hasta el fin del período:
// recortar la ventana trece veces daría trece repartos distintos. Ver
// `src/lib/ganancias-series.ts`.

/** El último día del mes 'AAAA-MM'. El día 0 del siguiente es el último del actual. */
function finDeMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

function mesVecino(mes: string, dir: 1 | -1): string {
  const [a, m] = mes.split('-').map(Number)
  const abs = a * 12 + (m - 1) + dir
  return `${Math.floor(abs / 12)}-${String((abs % 12) + 1).padStart(2, '0')}`
}

export default async function TableroPage({
  searchParams,
}: {
  searchParams: { mes?: string }
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
  const mesHoy = hoy.slice(0, 7)
  // Un `mes` con formato raro cae al actual en vez de romper: la URL es editable a mano.
  const pedido = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.mes ?? '') ? searchParams.mes! : mesHoy
  // No se mira hacia adelante: no hay datos y el gráfico quedaría con la mitad vacía.
  const mes = pedido > mesHoy ? mesHoy : pedido

  const desde = inicioDeVentana(`${mes}-01`, MESES_TABLERO)
  const hasta = finDeMes(mes)
  const { dias } = await cargarGanancias(supabase, desde, hasta)

  const OP = { cc: true, gastos: true, transferencias: true }
  const serie = serieMensual(dias, `${mes}-01`, OP, MESES_TABLERO)

  // DOS series, de la misma carga. El gráfico muestra los meses ENTEROS, que es la
  // historia real. La comparación, en cambio, se hace contra el MISMO TRAMO de los meses
  // anteriores cuando el mes que se mira todavía no cerró: el día 24 de noviembre contra
  // un octubre completo no dice nada, y la variación que sale de ahí asusta sin motivo.
  const tramo = tramoDeComparacion(mes, hoy)
  const serieCmp = tramo == null ? serie : serieMensual(dias, `${mes}-01`, OP, MESES_TABLERO, tramo)
  const comparacion = compararUltimo(serieCmp, tramo)

  return (
    <TableroView
      nav={<NavGanancias actual="tablero" />}
      serie={serie}
      comparacion={comparacion}
      mesCursor={mes}
      mesAnterior={mesVecino(mes, -1)}
      mesSiguiente={mesVecino(mes, 1)}
      haySiguiente={mes < mesHoy}
    />
  )
}
