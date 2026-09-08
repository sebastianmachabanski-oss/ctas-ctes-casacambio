import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'
import PosicionConsolidada, { type Saldo } from '@/components/deudores/PosicionConsolidada'

// Siempre se renderiza en el momento: es una pantalla de datos que cambian con cada
// carga. Sin esto, Next puede servir una versión guardada y mostrar información vieja.
export const dynamic = 'force-dynamic'

// Posición consolidada de cuentas corrientes (8/9/2026).
//
// Antes esta pantalla filtraba los saldos positivos y descartaba el resto: mostraba lo que
// los clientes deben y nada de lo que la casa les debe a ellos. Con la mitad de los datos
// no había forma de saber cómo está parado el negocio. Ahora se traen todas las cuentas
// con saldo, de los dos signos, y el componente arma la posición por moneda.

export default async function DeudoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || !esStaff((profile as any).rol)) redirect('/dashboard')

  // Sin `.range()` PostgREST corta en 1.000 filas y el resto desaparece sin aviso: con
  // más de mil cuentas corrientes la posición saldría mal y nada lo indicaría.
  const PAGE = 1000
  const filas: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: pg } = await supabase
      .from('saldos_cuenta_corriente')
      .select('cuenta_cte,saldo_pesos,saldo_dolares,saldo_euros,saldo_reales,saldo_usdt,ultimo_movimiento')
      .order('cuenta_cte', { ascending: true })
      .range(from, from + PAGE - 1)
    const rows = (pg ?? []) as any[]
    filas.push(...rows)
    if (rows.length < PAGE) break
  }

  // Las cuentas en cero no aportan nada a la posición y son la mayoría del padrón.
  const saldos = filas.filter((s: any) =>
    (['saldo_dolares', 'saldo_pesos', 'saldo_euros', 'saldo_reales', 'saldo_usdt'] as const)
      .some(k => (Number(s[k]) || 0) !== 0)
  ) as Saldo[]

  return <PosicionConsolidada saldos={saldos} />
}
