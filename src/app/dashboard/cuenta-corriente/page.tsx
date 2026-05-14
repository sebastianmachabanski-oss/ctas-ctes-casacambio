import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FiltrosMovimientos from '@/components/cuenta-corriente/FiltrosMovimientos'
import TablaMovimientos from '@/components/cuenta-corriente/TablaMovimientos'
import TarjetasSaldos from '@/components/cuenta-corriente/TarjetasSaldos'

export default async function CuentaCorrientePage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; concepto?: string; operacion?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol, cuenta_cte, nombre').eq('id', user.id).single()
  if (!profile) redirect('/login')
  const cuentaCte = profile.rol === 'cliente' ? profile.cuenta_cte : null
  if (profile.rol === 'cliente' && !cuentaCte) {
    return <div className="p-8"><div className="card p-6 text-center text-gray-500">Tu cuenta no está configurada. Contactá al administrador.</div></div>
  }
  let saldosQuery = supabase.from('saldos_cuenta_corriente').select('*')
  if (cuentaCte) saldosQuery = saldosQuery.eq('cuenta_cte', cuentaCte)
  const { data: saldos } = await saldosQuery
  const { desde, hasta, concepto, operacion } = searchParams
  let movimientos = null
  let totalMovimientos = 0
  if (desde && hasta) {
    let query = supabase.from('diario').select('*', { count: 'exact' })
      .eq('tipo', 'CTA CTE').eq('anulado', false)
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (cuentaCte) query = query.eq('cuenta_cte', cuentaCte)
    if (concepto) query = query.ilike('concepto', `%${concepto}%`)
    if (operacion) query = query.eq('operacion', operacion)
    const { data, count } = await query
    movimientos = data; totalMovimientos = count ?? 0
  }
  const { data: tiposOp } = await supabase.from('tipos_operacion').select('codigo, descripcion').eq('activo', true)
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cuenta Corriente</h1>
        {cuentaCte && <p className="text-gray-500 text-sm mt-1">{cuentaCte}</p>}
      </div>
      <TarjetasSaldos saldos={saldos ?? []} cuentaCte={cuentaCte} />
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Filtrar movimientos</h2>
        <FiltrosMovimientos
          tiposOperacion={tiposOp ?? []}
          valoresIniciales={{ desde: desde ?? '', hasta: hasta ?? '', concepto: concepto ?? '', operacion: operacion ?? '' }}
        />
      </div>
      {desde && hasta ? (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Movimientos</h2>
            <span className="text-sm text-gray-500">{totalMovimientos} registro{totalMovimientos !== 1 ? 's' : ''}</span>
          </div>
          <TablaMovimientos movimientos={movimientos ?? []} />
        </div>
      ) : (
        <div className="card p-8 text-center">
          <div className="text-gray-400 text-sm">Seleccioná un rango de fechas para ver los movimientos</div>
        </div>
      )}
    </div>
  )
}
