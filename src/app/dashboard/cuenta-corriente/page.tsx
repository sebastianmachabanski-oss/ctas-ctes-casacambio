import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FiltrosMovimientos from '@/components/cuenta-corriente/FiltrosMovimientos'
import TablaMovimientos from '@/components/cuenta-corriente/TablaMovimientos'
import PaginacionCtaCte from '@/components/cuenta-corriente/PaginacionCtaCte'
import TarjetasSaldos from '@/components/cuenta-corriente/TarjetasSaldos'
import BotonExtracto from '@/components/cuenta-corriente/BotonExtracto'
import { esStaff, esCliente } from '@/lib/roles'

// Siempre se renderiza en el momento: es una pantalla de datos que cambian con cada
// carga. Sin esto, Next puede servir una versión guardada y mostrar información vieja.
export const dynamic = 'force-dynamic'


// El servidor (Netlify) corre en UTC sin importar el huso del usuario: usar la fecha
// local del proceso daría el día siguiente durante la noche en Argentina. Se fija

export default async function CuentaCorrientePage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; operacion?: string; cuenta?: string; pagina?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol, cuenta_cte, nombre').eq('id', user.id).single()
  const profile = profileData as { rol: string; cuenta_cte: string | null; nombre: string } | null
  if (!profile) redirect('/login')

  const staff = esStaff(profile.rol)
  const cliente = esCliente(profile.rol)

  const cuentaFiltro = cliente
    ? profile.cuenta_cte
    : searchParams.cuenta || null

  if (cliente && !profile.cuenta_cte) {
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
  if (staff) {
    const { data: cuentasData } = await supabase
      .from('cuentas_corrientes').select('nombre').eq('activo', true).order('nombre')
    cuentasList = (cuentasData ?? []).map((c: any) => c.nombre)
  }

  const { operacion } = searchParams

  // Fechas: si no se proveen, usar la más antigua y hoy
  let desde = searchParams.desde || ''
  let hasta = searchParams.hasta || ''

  // ── Movimientos ──────────────────────────────────────────────────────────
  // Con UNA cuenta elegida, la base devuelve la página pedida con el saldo acumulado ya
  // calculado (función `cta_cte_movimientos`). Antes se traían TODOS los movimientos de
  // la cuenta —7.661 en la más grande, en 8 viajes—, se acumulaba fila por fila acá y se
  // mandaban las 7.661 al navegador: de ahí la demora (25/8/2026).
  const POR_PAGINA = 200
  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1', 10) || 1)

  let movimientos: any[] = []
  let totalMovimientos = 0
  let acumulados: Record<string, { p: number; d: number; e: number; r: number; u: number }> | undefined
  let saldoCierra: boolean | null = null

  if (cuentaFiltro) {
    const { data } = await (supabase as any).rpc('cta_cte_movimientos', {
      p_cuenta: cuentaFiltro,
      p_desde: desde || null,
      p_hasta: hasta || null,
      p_operacion: operacion ?? null,
      p_limit: POR_PAGINA,
      p_offset: (pagina - 1) * POR_PAGINA,
    })
    const filas = (data ?? []) as any[]
    movimientos = filas
    totalMovimientos = Number(filas[0]?.total_filas ?? 0)

    // El acumulado por fila viene resuelto; acá solo se le da la forma que espera la tabla.
    // Con filtro de tipo no se muestra: la columna mentiría, porque el saldo real incluye
    // los movimientos de la otra dirección que el filtro deja fuera.
    if (!operacion) {
      acumulados = Object.fromEntries(filas.map(f => [f.id, {
        p: Number(f.acum_pesos) || 0, d: Number(f.acum_dolares) || 0,
        e: Number(f.acum_euros) || 0, r: Number(f.acum_reales) || 0,
        u: Number(f.acum_usdt) || 0,
      }]))

      // Verificación de exactitud: sin filtros y en la primera página, el acumulado del
      // movimiento MÁS NUEVO tiene que ser el saldo de la cuenta.
      if (!desde && !hasta && pagina === 1 && filas.length) {
        const s: any = saldos.find((x: any) => x.cuenta_cte === cuentaFiltro)
        if (s) {
          const eq = (a: number, b: number | null) => Math.abs(a - (b ?? 0)) < 0.005
          const u = filas[0]
          saldoCierra = eq(Number(u.acum_pesos) || 0, s.saldo_pesos)
            && eq(Number(u.acum_dolares) || 0, s.saldo_dolares)
            && eq(Number(u.acum_euros) || 0, s.saldo_euros)
            && eq(Number(u.acum_reales) || 0, s.saldo_reales)
            && eq(Number(u.acum_usdt) || 0, s.saldo_usdt)
        }
      }
    }
  } else {
    // Sin cuenta elegida no hay saldo acumulado posible (serían cuentas mezcladas), así
    // que alcanza con una página del listado.
    let q = supabase.from('diario').select('*', { count: 'exact' })
      .eq('tipo', 'CTA CTE').eq('anulado', false)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)
    if (operacion === 'INGRESO') q = q.or('operacion.ilike.*INGRES*,operacion.eq.DONACION')
    else if (operacion === 'EGRESO') q = q.or('operacion.ilike.*EGRES*,operacion.eq.COMPROMISO')
    const { data, count } = await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
    movimientos = (data ?? []) as any[]
    totalMovimientos = count ?? 0
  }

  const totalPaginas = Math.max(1, Math.ceil(totalMovimientos / POR_PAGINA))

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
          esSuperusuarioOOperador={staff}
        />
      </div>

      <TarjetasSaldos saldos={saldos} cuentaCte={cuentaFiltro} />

      <div className="card">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900">
            {cuentaFiltro ? `${cuentaFiltro} — movimientos` : 'Movimientos · todas las cuentas'}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{totalMovimientos} registro{totalMovimientos !== 1 ? 's' : ''}</span>
            {/* Solo con UNA cuenta elegida: un extracto de cuentas mezcladas no tiene
                sentido (no hay saldo acumulado posible). Y no para el rol cliente. */}
            {cuentaFiltro && !cliente && (
              <BotonExtracto params={{ cuenta: cuentaFiltro, desde, hasta, operacion }} />
            )}
          </div>
        </div>
        <TablaMovimientos movimientos={movimientos} acumulados={acumulados} />
        {totalPaginas > 1 && (
          <PaginacionCtaCte
            pagina={pagina}
            totalPaginas={totalPaginas}
            mostrados={movimientos.length}
            total={totalMovimientos}
            params={searchParams}
          />
        )}
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
