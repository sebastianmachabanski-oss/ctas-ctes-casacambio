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

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Resumen totales — tarjetas KPI del tablero */}
      <div className="kpis">
        {[
          { label: 'Total Dólares', value: totalDolares, sym: 'U$S', dot: '#16a34a' },
          { label: 'Total Pesos',   value: totalPesos,   sym: '$',   dot: '#2563eb' },
          { label: 'Total Euros',   value: totalEuros,   sym: '€',   dot: '#7c3aed' },
          { label: 'Total Reales',  value: totalReales,  sym: 'R$',  dot: '#eab308' },
        ].filter(t => t.value > 0).map(t => (
          <div key={t.label} className="kpi">
            <div className="top"><span className="dot" style={{ background: t.dot }} /><span className="cur">{t.label}</span></div>
            <div className="val num">{t.sym} {new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(t.value)}</div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900">Cuentas con saldo pendiente</div>
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

        {/* Desktop: tabla (estilo mockup, números planos) */}
        <div className="hidden md:block tbl-wrap">
          <table className="cc-tbl">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>#</th>
                <th style={{ textAlign: 'left' }}>Cuenta corriente</th>
                <th>Dólares</th>
                <th>Pesos</th>
                <th>Euros</th>
                <th>Reales</th>
              </tr>
            </thead>
            <tbody>
              {deudores.map((s: any, idx: number) => (
                <tr key={s.cuenta_cte}>
                  <td style={{ color: 'var(--muted)', fontWeight: 400 }}>{idx + 1}</td>
                  <td>{s.cuenta_cte}</td>
                  {[s.saldo_dolares, s.saldo_pesos, s.saldo_euros, s.saldo_reales].map((v: number | null, i: number) => (
                    <td key={i} className="num">
                      {(v ?? 0) > 0
                        ? new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(v as number)
                        : <span className="zero">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--grid)' }}>
                <td></td>
                <td style={{ fontWeight: 700 }}>TOTAL</td>
                {[totalDolares, totalPesos, totalEuros, totalReales].map((v: number, i: number) => (
                  <td key={i} className="num" style={{ fontWeight: 700 }}>
                    {v > 0 ? new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(v) : <span className="zero">—</span>}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
