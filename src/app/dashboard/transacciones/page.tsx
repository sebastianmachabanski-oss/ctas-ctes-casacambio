import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FiltrosTransacciones from '@/components/transacciones/FiltrosTransacciones'
import TablaTransacciones from '@/components/transacciones/TablaTransacciones'

// Pantalla de staff: TODOS los movimientos de la caja (tabla movimientos_caja, el espejo
// completo de la solapa CAJA que llena el sync). Solo lectura por ahora; la edición se
// habilita cuando la app deje de convivir con la planilla (ver docs/PLAN-VS-REAL.md).

const POR_PAGINA = 50

function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; cliente?: string; operacion?: string; tipo?: string; pagina?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as { rol: string } | null)?.rol
  if (rol !== 'superusuario' && rol !== 'operador') redirect('/dashboard')

  // Rango por defecto: últimos 7 días (el histórico completo se pide filtrando).
  const hoy = hoyArgentina()
  const desde = searchParams.desde || restarDias(hoy, 7)
  const hasta = searchParams.hasta || hoy
  const cliente = (searchParams.cliente ?? '').trim()
  const operacion = searchParams.operacion ?? ''
  const tipo = searchParams.tipo ?? ''
  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1', 10) || 1)

  let query = supabase.from('movimientos_caja')
    .select('*', { count: 'exact' })
    // Defensivo: las filas pre-armadas de la planilla (OPERACIÓN = "OPERACION?") no son
    // movimientos. El sync ya las excluye, pero si la tabla se cargó con una versión
    // anterior podrían seguir ahí hasta el próximo full.
    .neq('operacion', 'OPERACION?')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('fila_sheet', { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)

  if (cliente) query = query.ilike('cliente', `%${cliente}%`)
  if (operacion) query = query.eq('operacion', operacion)
  if (tipo) query = query.eq('tipo', tipo)

  const { data, count, error } = await query
  const movimientos = (data ?? []) as any[]
  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  // Link de paginación conservando los filtros activos.
  const linkPagina = (p: number) => {
    const params = new URLSearchParams()
    if (searchParams.desde) params.set('desde', searchParams.desde)
    if (searchParams.hasta) params.set('hasta', searchParams.hasta)
    if (cliente) params.set('cliente', cliente)
    if (operacion) params.set('operacion', operacion)
    if (tipo) params.set('tipo', tipo)
    params.set('pagina', String(p))
    return `/dashboard/transacciones?${params.toString()}`
  }

  const desdeN = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1
  const hastaN = Math.min(pagina * POR_PAGINA, total)

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Transacciones</h1>
        <p className="text-gray-500 text-sm mt-1">
          Todos los movimientos de la caja, sincronizados desde la planilla
        </p>
      </div>

      <div className="card p-4 md:p-5">
        <FiltrosTransacciones
          valoresIniciales={{ desde, hasta, cliente, operacion, tipo }}
        />
      </div>

      {error ? (
        <div className="card p-6 text-center text-red-600 text-sm">
          No se pudieron cargar los movimientos: {error.message}
          <p className="text-gray-500 mt-2">
            Si la tabla todavía no existe, falta correr la migración
            <code className="mx-1">2026-07-05_movimientos_caja.sql</code> y un sync full.
          </p>
        </div>
      ) : (
        <>
          <TablaTransacciones movimientos={movimientos} puedeEditar={rol === 'superusuario'} />

          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              {total === 0 ? 'Sin movimientos para estos filtros' : `${desdeN}–${hastaN} de ${total.toLocaleString('es-AR')} movimientos`}
            </span>
            {totalPaginas > 1 && (
              <div className="flex items-center gap-2">
                {pagina > 1 ? (
                  <Link href={linkPagina(pagina - 1)} className="btn-secondary px-3 py-1.5">← Anterior</Link>
                ) : (
                  <span className="btn-secondary px-3 py-1.5 opacity-40 cursor-default">← Anterior</span>
                )}
                <span className="px-2">página {pagina} de {totalPaginas}</span>
                {pagina < totalPaginas ? (
                  <Link href={linkPagina(pagina + 1)} className="btn-secondary px-3 py-1.5">Siguiente →</Link>
                ) : (
                  <span className="btn-secondary px-3 py-1.5 opacity-40 cursor-default">Siguiente →</span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
