import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TransaccionesView from '@/components/transacciones/TransaccionesView'
import { esAdmin, esStaff } from '@/lib/roles'

// Siempre se renderiza en el momento: es una pantalla de datos que cambian con cada
// carga. Sin esto, Next puede servir una versión guardada y mostrar información vieja.
export const dynamic = 'force-dynamic'


// Pantalla de staff: TODOS los movimientos de la caja (tabla movimientos_caja, el espejo
// completo de la solapa CAJA que llena el sync). Por defecto muestra los 100 más recientes;
// se pagina de a 100 y se puede acotar por rango de fechas. Los filtros por columna
// (cliente / operación / monto) refinan en vivo la página cargada.

const POR_PAGINA = 100

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: {
    desde?: string; hasta?: string; pagina?: string
    cli?: string; tipo?: string; op?: string; notas?: string; autor?: string; monto?: string
  }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as { rol: string } | null)?.rol
  if (!esStaff(rol)) redirect('/dashboard')

  const desde = searchParams.desde || ''
  const hasta = searchParams.hasta || ''
  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1', 10) || 1)

  // Filtros por columna. Van EN EL SERVIDOR, no sobre la página ya traída: filtrando en
  // el cliente, buscar un cliente mostraba solo sus movimientos dentro de las 100 filas
  // de la página actual y seguía ofreciendo 23 páginas del resto (25/8/2026).
  const fCli   = (searchParams.cli   ?? '').trim()
  const fTipo  = (searchParams.tipo  ?? '').trim()
  const fOp    = (searchParams.op    ?? '').trim()
  const fNotas = (searchParams.notas ?? '').trim()
  const fAutor = (searchParams.autor ?? '').trim()
  const fMonto = (searchParams.monto ?? '').trim()

  // Un solo lugar arma los filtros: lo usan la consulta de la página y la de los totales.
  // Duplicarlos sería garantizar que en algún momento dejen de coincidir.
  const conFiltros = (columnas: string, opciones?: { count: 'exact' }) => {
    let q = supabase.from('movimientos_caja')
      .select(columnas, opciones)
      .neq('operacion', 'OPERACION?')
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)
    if (fCli)   q = q.ilike('cliente', `%${fCli}%`)
    if (fTipo)  q = q.eq('tipo', fTipo)
    if (fOp)    q = q.eq('operacion', fOp)
    if (fNotas) q = q.ilike('notas', `%${fNotas}%`)
    if (fAutor) {
      q = /CARGA/i.test(fAutor)
        ? q.is('creado_por', null)
        : q.or(`creado_por.ilike.%${fAutor}%,editado_por.ilike.%${fAutor}%`)
    }
    if (fMonto) {
      const op = fMonto.match(/^(>=|<=|>|<|=)/)?.[1] ?? '='
      const crudo = fMonto.replace(/^(>=|<=|>|<|=)\s*/, '').replace(/\./g, '').replace(',', '.')
      const val = Number(crudo)
      if (isFinite(val) && crudo !== '') {
        // Se compara el valor ABSOLUTO: los egresos se guardan en negativo.
        if (op === '>')       q = q.or(`monto.gt.${val},monto.lt.${-val}`)
        else if (op === '>=') q = q.or(`monto.gte.${val},monto.lte.${-val}`)
        else if (op === '<')  q = q.lt('monto', val).gt('monto', -val)
        else if (op === '<=') q = q.lte('monto', val).gte('monto', -val)
        else                  q = q.or(`monto.eq.${val},monto.eq.${-val}`)
      }
    }
    return q
  }

  let query = conFiltros('*', { count: 'exact' })
    // MISMA SECUENCIA QUE LA PLANILLA, dada vuelta: lo más nuevo arriba (25/8/2026).
    //
    // Manda `fila_sheet` —la posición de la fila en la solapa CAJA— y NO la fecha. La
    // planilla es un registro corrido: el orden de carga es el de las filas, y ese es el
    // orden que el negocio reconoce. Ordenar por fecha se despegaba de la planilla en
    // cuanto alguien cargaba una fila con fecha anterior a la de arriba.
    //
    // Los nulos van PRIMERO a propósito: son las transacciones cargadas en la app que
    // todavía no tienen lugar en el Sheet, y tienen que verse arriba de todo. Entre
    // ellas desempata la fecha de carga.
    //
    // Ojo con no invertir estas dos: al sincronizar, las filas que nacieron en la app
    // recuperan su `creado_at` desde la auditoría. Si `creado_at` mandara, esas filas
    // saltarían arriba de toda la planilla aunque ya estén integradas en el Sheet.
    .order('fila_sheet', { ascending: false, nullsFirst: true })
    .order('creado_at', { ascending: false, nullsFirst: false })
  query = query.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)

  // Totales del resultado filtrado COMPLETO. Sumar solo la página respondería otra
  // pregunta: filtrando un cliente, lo que interesa es su total, no el de las 100 filas
  // que entraron en pantalla. Se traen tres columnas y se sumaN acá; Postgrest no agrega.
  const PAGINA_TOT = 1000
  const totales = { monto: 0, pesos: 0, dolares: 0 }
  for (let from = 0; ; from += PAGINA_TOT) {
    const { data: pg } = await conFiltros('monto, pesos, dolares').range(from, from + PAGINA_TOT - 1)
    const filas = (pg ?? []) as any[]
    for (const f of filas) {
      totales.monto   += Math.abs(Number(f.monto) || 0)
      totales.pesos   += Number(f.pesos) || 0
      totales.dolares += Number(f.dolares) || 0
    }
    if (filas.length < PAGINA_TOT) break
  }

  const { data, count, error } = await query
  const movimientos = (data ?? []) as any[]
  const total = count ?? movimientos.length
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <div className="p-4 md:p-6">
      {error ? (
        <div className="card p-6 text-center text-red-600 text-sm">
          No se pudieron cargar los movimientos: {error.message}
        </div>
      ) : (
        <TransaccionesView
          filtros={{ cli: fCli, tipo: fTipo, op: fOp, notas: fNotas, autor: fAutor, monto: fMonto }}
          totales={totales}
          movimientos={movimientos}
          puedeEditar={esAdmin(rol)}
          desde={desde}
          hasta={hasta}
          total={total}
          pagina={pagina}
          totalPaginas={totalPaginas}
        />
      )}
    </div>
  )
}
