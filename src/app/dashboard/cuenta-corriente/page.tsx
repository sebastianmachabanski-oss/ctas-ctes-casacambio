import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FiltrosMovimientos from '@/components/cuenta-corriente/FiltrosMovimientos'
import TablaMovimientos from '@/components/cuenta-corriente/TablaMovimientos'
import TarjetasSaldos from '@/components/cuenta-corriente/TarjetasSaldos'

// El servidor (Netlify) corre en UTC sin importar el huso del usuario: usar la fecha
// local del proceso daría el día siguiente durante la noche en Argentina. Se fija
// explícitamente el huso de Argentina para que "hoy" sea siempre el correcto.
function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

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

  // Saldos
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

  const { operacion } = searchParams

  // Fechas: si no se proveen, usar la más antigua y hoy
  let desde = searchParams.desde || ''
  let hasta = searchParams.hasta || ''

  // Siempre mostrar movimientos (con o sin fechas)
  let desdeQuery = desde || undefined
  let hastaQuery = hasta || hoyArgentina()

  // Si no hay fecha desde, buscar la más antigua
  if (!desdeQuery) {
    let minQuery = supabase.from('diario').select('fecha').eq('tipo', 'CTA CTE').eq('anulado', false).order('fecha', { ascending: true }).limit(1)
    if (cuentaFiltro) minQuery = minQuery.eq('cuenta_cte', cuentaFiltro)
    const { data: minData } = await minQuery
    desdeQuery = minData?.[0]?.fecha || '2000-01-01'
  }

  let query = supabase.from('diario').select('*', { count: 'exact' })
    .eq('tipo', 'CTA CTE').eq('anulado', false)
    .gte('fecha', desdeQuery)
    .lte('fecha', hastaQuery)
    .order('fecha', { ascending: false })
    // Orden secundario estable: dentro de un mismo día, del más nuevo al más viejo.
    // Necesario para que el saldo acumulado sea determinístico.
    .order('created_at', { ascending: false })

  if (cuentaFiltro) query = query.eq('cuenta_cte', cuentaFiltro)
  if (operacion) query = query.eq('operacion', operacion)

  const { data, count } = await query
  const movimientos = (data ?? []) as any[]
  const totalMovimientos = count ?? 0

  // ── Saldo acumulado por fila (como el extracto del mockup) ──
  // Solo con UNA cuenta elegida y sin filtro de tipo (si no, el acumulado mentiría).
  // Arranca del saldo previo al rango y acumula cronológicamente cada moneda.
  let acumulados: Record<string, { p: number; d: number; e: number; r: number }> | undefined
  let saldoCierra: boolean | null = null
  if (cuentaFiltro && !operacion) {
    const prior = { p: 0, d: 0, e: 0, r: 0 }
    if (desde) {
      // El usuario acotó el rango: sumar todo lo ANTERIOR para el saldo inicial.
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        const { data: pg } = await supabase.from('diario')
          .select('cc_pesos, cc_dolares, cc_euros, cc_reales')
          .eq('tipo', 'CTA CTE').eq('anulado', false)
          .eq('cuenta_cte', cuentaFiltro)
          .lt('fecha', desdeQuery)
          .range(from, from + PAGE - 1)
        const rows = (pg ?? []) as any[]
        for (const r of rows) {
          prior.p += r.cc_pesos ?? 0; prior.d += r.cc_dolares ?? 0
          prior.e += r.cc_euros ?? 0; prior.r += r.cc_reales ?? 0
        }
        if (rows.length < PAGE) break
      }
    }
    // La consulta viene DESC (fecha y created_at): invertida queda cronológica.
    const run = { ...prior }
    acumulados = {}
    for (const m of [...movimientos].reverse()) {
      run.p += m.cc_pesos ?? 0; run.d += m.cc_dolares ?? 0
      run.e += m.cc_euros ?? 0; run.r += m.cc_reales ?? 0
      acumulados[m.id] = { p: run.p, d: run.d, e: run.e, r: run.r }
    }
    // Verificación de exactitud: sin filtros de fecha, el acumulado final debe cerrar
    // EXACTO con el saldo de la cuenta (vista saldos_cuenta_corriente).
    if (!desde && !hasta) {
      const s: any = saldos.find((x: any) => x.cuenta_cte === cuentaFiltro)
      if (s) {
        const eq = (a: number, b: number | null) => Math.abs(a - (b ?? 0)) < 0.005
        saldoCierra = eq(run.p, s.saldo_pesos) && eq(run.d, s.saldo_dolares)
          && eq(run.e, s.saldo_euros) && eq(run.r, s.saldo_reales)
      }
    }
  }

  const { data: tiposData } = await supabase
    .from('tipos_operacion').select('codigo, descripcion').eq('activo', true)
  const tiposOp = (tiposData ?? []) as any[]

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="card p-4 md:p-5">
        <FiltrosMovimientos
          tiposOperacion={tiposOp}
          valoresIniciales={{
            desde: desde,
            hasta: hasta,
            operacion: operacion ?? '',
            cuenta: searchParams.cuenta ?? '',
          }}
          cuentas={cuentasList}
          esSuperusuarioOOperador={esStaff}
        />
      </div>

      <TarjetasSaldos saldos={saldos} cuentaCte={cuentaFiltro} />

      <div className="card">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {cuentaFiltro ? `${cuentaFiltro} — movimientos` : 'Movimientos · todas las cuentas'}
          </h2>
          <span className="text-sm text-gray-500">{totalMovimientos} registro{totalMovimientos !== 1 ? 's' : ''}</span>
        </div>
        <TablaMovimientos movimientos={movimientos} acumulados={acumulados} />
        {saldoCierra !== null && (
          <div style={{ padding: '8px 16px 12px', fontSize: 12, color: saldoCierra ? 'var(--pos-ink)' : 'var(--neg-ink)' }}>
            {saldoCierra
              ? '✓ El saldo acumulado cierra exacto con el saldo de la cuenta'
              : '⚠️ El saldo acumulado no cierra con el saldo de la cuenta — avisar al administrador'}
          </div>
        )}
      </div>
    </div>
  )
}
