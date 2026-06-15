import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DeudoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || !['superusuario', 'operador'].includes((profile as any).rol)) redirect('/dashboard')

  const { data: saldos } = await supabase
    .from('saldos_cuenta_corriente')
    .select('*')
    .order('saldo_dolares', { ascending: false })

  // Filtrar solo los que deben en alguna moneda (saldo positivo = deuda)
  const deudores = (saldos ?? []).filter((s: any) =>
    (s.saldo_dolares ?? 0) > 0 ||
    (s.saldo_pesos ?? 0) > 0 ||
    (s.saldo_euros ?? 0) > 0 ||
    (s.saldo_reales ?? 0) > 0
  ).sort((a: any, b: any) => (b.saldo_dolares ?? 0) - (a.saldo_dolares ?? 0))

  // Totales
  const totalDolares = deudores.reduce((acc: number, s: any) => acc + Math.max(0, s.saldo_dolares ?? 0), 0)
  const totalPesos   = deudores.reduce((acc: number, s: any) => acc + Math.max(0, s.saldo_pesos ?? 0), 0)
  const totalEuros   = deudores.reduce((acc: number, s: any) => acc + Math.max(0, s.saldo_euros ?? 0), 0)
  const totalReales  = deudores.reduce((acc: number, s: any) => acc + Math.max(0, s.saldo_reales ?? 0), 0)

  function fmt(n: number, sym: string) {
    if (!n || n === 0) return '—'
    return `${sym} ${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(n)}`
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Saldos Pendientes</h1>
        <p className="text-gray-500 text-sm mt-1">
          {deudores.length} cuenta{deudores.length !== 1 ? 's' : ''} con saldo pendiente
        </p>
      </div>

      {/* Resumen totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Dólares', value: totalDolares, sym: 'U$S', color: 'bg-red-50 border-red-200 text-red-900' },
          { label: 'Total Pesos',   value: totalPesos,   sym: '$',   color: 'bg-orange-50 border-orange-200 text-orange-900' },
          { label: 'Total Euros',   value: totalEuros,   sym: '€',   color: 'bg-purple-50 border-purple-200 text-purple-900' },
          { label: 'Total Reales',  value: totalReales,  sym: 'R$',  color: 'bg-yellow-50 border-yellow-200 text-yellow-900' },
        ].filter(t => t.value > 0).map(t => (
          <div key={t.label} className={`card border p-3 md:p-4 ${t.color}`}>
            <p className="text-xs font-medium opacity-70 uppercase tracking-wide mb-1">{t.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-medium opacity-60">{t.sym}</span>
              <span className="text-xl md:text-2xl font-bold">
                {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(t.value)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        {/* Mobile: cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {deudores.map((s: any) => (
            <div key={s.cuenta_cte} className="p-4">
              <p className="font-medium text-gray-900 mb-2">{s.cuenta_cte}</p>
              <div className="flex flex-wrap gap-3">
                {(s.saldo_dolares ?? 0) > 0 && (
                  <span className="text-sm font-medium text-red-600">U$S {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(s.saldo_dolares)}</span>
                )}
                {(s.saldo_pesos ?? 0) > 0 && (
                  <span className="text-sm font-medium text-orange-600">$ {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(s.saldo_pesos)}</span>
                )}
                {(s.saldo_euros ?? 0) > 0 && (
                  <span className="text-sm font-medium text-purple-600">€ {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(s.saldo_euros)}</span>
                )}
                {(s.saldo_reales ?? 0) > 0 && (
                  <span className="text-sm font-medium text-yellow-600">R$ {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(s.saldo_reales)}</span>
                )}
              </div>
            </div>
          ))}
          {/* Total mobile */}
          <div className="p-4 bg-gray-50">
            <p className="font-bold text-gray-900 mb-2">TOTAL</p>
            <div className="flex flex-wrap gap-3">
              {totalDolares > 0 && <span className="text-sm font-bold text-red-600">U$S {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(totalDolares)}</span>}
              {totalPesos   > 0 && <span className="text-sm font-bold text-orange-600">$ {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(totalPesos)}</span>}
              {totalEuros   > 0 && <span className="text-sm font-bold text-purple-600">€ {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(totalEuros)}</span>}
              {totalReales  > 0 && <span className="text-sm font-bold text-yellow-600">R$ {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(totalReales)}</span>}
            </div>
          </div>
        </div>

        {/* Desktop: tabla */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cuenta corriente</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Dólares</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Pesos</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Euros</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Reales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {deudores.map((s: any, idx: number) => (
                <tr key={s.cuenta_cte} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{s.cuenta_cte}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(s.saldo_dolares ?? 0) > 0
                      ? <span className="text-red-600 font-medium">{fmt(s.saldo_dolares, 'U$S')}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(s.saldo_pesos ?? 0) > 0
                      ? <span className="text-orange-600 font-medium">{fmt(s.saldo_pesos, '$')}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(s.saldo_euros ?? 0) > 0
                      ? <span className="text-purple-600 font-medium">{fmt(s.saldo_euros, '€')}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(s.saldo_reales ?? 0) > 0
                      ? <span className="text-yellow-600 font-medium">{fmt(s.saldo_reales, 'R$')}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Fila de totales */}
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 font-bold text-gray-900">TOTAL</td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600">
                  {totalDolares > 0 ? fmt(totalDolares, 'U$S') : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-600">
                  {totalPesos > 0 ? fmt(totalPesos, '$') : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-purple-600">
                  {totalEuros > 0 ? fmt(totalEuros, '€') : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-yellow-600">
                  {totalReales > 0 ? fmt(totalReales, 'R$') : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
