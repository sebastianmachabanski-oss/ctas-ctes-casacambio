import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Consulta del listado de transacciones.
 *
 * Vive acá y no en la página porque desde el 10/9/2026 el listado se muestra DENTRO de
 * Inicio: la pantalla propia de Transacciones desapareció del menú. Dejar la consulta
 * pegada a una página que ya no se usa era la forma segura de que las dos versiones se
 * separaran con el tiempo.
 */

export const POR_PAGINA = 100

export type ParamsTransacciones = {
  desde?: string; hasta?: string; pagina?: string
  cli?: string; tipo?: string; op?: string; notas?: string; autor?: string; monto?: string
}

export async function traerTransacciones(
  supabase: SupabaseClient<any, any, any>,
  sp: ParamsTransacciones,
) {
  const desde = sp.desde || ''
  const hasta = sp.hasta || ''
  const pagina = Math.max(1, parseInt(sp.pagina ?? '1', 10) || 1)

  // Filtros por columna. Van EN EL SERVIDOR, no sobre la página ya traída: filtrando en
  // el cliente, buscar un cliente mostraba solo sus movimientos dentro de las 100 filas
  // de la página actual y seguía ofreciendo 23 páginas del resto (25/8/2026).
  // Lista de clientes elegidos. Van separados por "|" porque la coma aparece en nombres
  // reales ("PEREZ, JUAN") y rompería el separador.
  const clientesSel = (sp.cli ?? '').split('|').map(c => c.trim()).filter(Boolean)
  const fCli = clientesSel.join('|')
  const fTipo  = (sp.tipo  ?? '').trim()
  const fOp    = (sp.op    ?? '').trim()
  const fNotas = (sp.notas ?? '').trim()
  const fAutor = (sp.autor ?? '').trim()
  const fMonto = (sp.monto ?? '').trim()

  // Un solo lugar arma los filtros: lo usan la consulta de la página y la de los totales.
  // Duplicarlos sería garantizar que en algún momento dejen de coincidir.
  const conFiltros = (columnas: string, opciones?: { count: 'exact' }) => {
    let q = supabase.from('movimientos_caja')
      .select(columnas, opciones)
      .neq('operacion', 'OPERACION?')
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)
    // Selección exacta, no búsqueda por texto: el usuario ya eligió de la lista.
    if (clientesSel.length === 1) q = q.eq('cliente', clientesSel[0])
    else if (clientesSel.length > 1) q = q.in('cliente', clientesSel)
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

  // Padrón para el desplegable del filtro. Paginado: Postgrest corta en 1.000 y hay más
  // clientes que eso, así que sin esto faltarían los del final del abecedario.
  const clientes: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('clientes')
      .select('nombre').eq('activo', true).order('nombre').range(from, from + 999)
    const filas = (data ?? []) as any[]
    clientes.push(...filas.map(c => c.nombre))
    if (filas.length < 1000) break
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
  // que entraron en pantalla. Se traen tres columnas y se suman acá; Postgrest no agrega.
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

  return {
    error,
    movimientos,
    clientes,
    clientesSel,
    totales,
    total,
    pagina,
    totalPaginas,
    desde,
    hasta,
    filtros: { cli: fCli, tipo: fTipo, op: fOp, notas: fNotas, autor: fAutor, monto: fMonto },
  }
}
