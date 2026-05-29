import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FiltrosMovimientos from '@/components/cuenta-corriente/FiltrosMovimientos'
import TablaMovimientos from '@/components/cuenta-corriente/TablaMovimientos'
import TarjetasSaldos from '@/components/cuenta-corriente/TarjetasSaldos'

export default async function CuentaCorrientePage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; operacion?: string; cuenta?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol, cuenta_cte, nombre').eq('id', user.id).single()
  const profile = profileData as { rol: string; cuenta_cte: string | null; nombre: string } | null
  if (!profile) redirect('/login')

  const esStaff = profile.rol === 'superusuario' || profile.rol === 'operador'
  const esCliente = profile.rol === 'cliente'

  // Para cliente: su cuenta fija. Para staff: la que eligió en el filtro (o null = todas)
  const cuentaFiltro = esCliente
    ? profile.cuenta_cte
    : searchParams.cuenta || null

  if (esCliente && !profile.cuenta_cte) {
    return (
      <div className="p-4 md:p-8">
        <div className="card p-6 text-center text-gray-500">
          Tu cuenta no está configurada. Contactá al administrador.
        </div>
      </div>
    )
  }

  // Saldos: filtrado por cuenta si se eligió una, o todos si no
  let saldosQuery = supabase.from('saldos_cuenta_corriente').select('*')
  if (cuentaFiltro) saldosQuery = saldosQuery.eq('cuenta_cte', cuentaFiltro)
  const { data: saldosData } = await saldosQuery
  const saldos = (saldosData ?? []) as any[]

  // Lista de cuentas para el selector (solo staff)
  let cuentasList: string[] = []
  if (esStaff) {
    const { data: cuentasData } = await supabase
      .from('cuentas_corrientes').select('nombre').eq('activo', true).order('nombre')
    cuentasList = (cuentasData ?? []).map((c: any) => c.nombre)
  }

  const { desde, hasta, operacion } = searchParams
  let movimientos: any[] = []
  let totalMovimientos = 0

  if (desde && hasta) {
    let query = supabase.from('diario').select('*', { count: 'exact' })
      .eq('tipo', 'CTA CTE').eq('anulado', false)
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (cuentaFiltro) query = query.eq('cuenta_cte', cuentaFiltro)
    if (operacion) query = query.eq('operacion', operacion)
    const { data, count } = await query
    movimientos = (data ?? []) as any[]
    totalMovimientos = count ?? 0
  }

  const { data: tiposData } = await supabase
    .from('tipos_operacion').select('codigo, descripcion').eq('activo', true)
  const tiposOp = (tiposData ?? []) as any[]

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Cuenta Corriente</h1>
        {esCliente && profile.cuenta_cte && (
          <p className="text-gray-500 text-sm mt-1">{profile.cuenta_cte}</p>
        )}
        {esStaff && cuentaFiltro && (
          <p className="text-gray-500 text-sm mt-1">{cuentaFiltro}</p>
        )}
        {esStaff && !cuentaFiltro && (
          <p className="text-gray-500 text-sm mt-1">Todas las cuentas</p>
        )}
      </div>

      <TarjetasSaldos saldos={saldos} cuentaCte={cuentaFiltro} />

      <div className="card p-4 md:p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Filtrar movimientos</h2>
        <FiltrosMovimientos
          tiposOperacion={tiposOp}
          valoresIniciales={{
            desde: desde ?? '',
            hasta: hasta ?? '',
            operacion: operacion ?? '',
            cuenta: searchParams.cuenta ?? '',
          }}
          cuentas={cuentasList}
          esSuperusuarioOOperador={esStaff}
        />
      </div>

      {desde && hasta ? (
        <div className="card">
          <div className="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Movimientos</h2>
            <span className="text-sm text-gray-500">{totalMovimientos} registro{totalMovimientos !== 1 ? 's' : ''}</span>
          </div>
          <TablaMovimientos movimientos={movimientos} />
        </div>
      ) : (
        <div className="card p-8 text-center">
          <div className="text-gray-400 text-sm">Seleccioná un rango de fechas para ver los movimientos</div>
        </div>
      )}
    </div>
  )
}
