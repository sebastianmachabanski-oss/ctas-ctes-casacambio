import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { esCliente } from '@/lib/roles'
import BotonImprimir from './BotonImprimir'

// Extracto imprimible de una cuenta corriente (26/8/2026).
//
// Vive fuera de /dashboard a propósito: no lleva menú, barra superior ni ningún otro
// elemento de la aplicación. Lo que se ve en pantalla es exactamente lo que sale en el
// papel, y de ahí a PDF con "Guardar como PDF" del diálogo de impresión.
//
// Sin marcas ni nombre de la empresa (pedido del 26/8/2026): solo la cuenta, el período,
// los movimientos y el saldo.

export const dynamic = 'force-dynamic'

// La pantalla pagina de a 200; el extracto NO: sale el período entero. Un tope alto por
// las dudas —la cuenta más grande tiene ~7.700 movimientos— y si se pasa, se avisa en el
// documento en vez de recortar en silencio.
const TOPE = 20000

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 })
const money = (v: number) => (v < 0 ? `(${nf.format(-v)})` : nf.format(v))
const fecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR')

const MONEDAS = [
  { acum: 'acum_dolares', cc: 'cc_dolares', saldo: 'saldo_dolares', label: 'Dólares', sym: 'U$S' },
  { acum: 'acum_pesos',   cc: 'cc_pesos',   saldo: 'saldo_pesos',   label: 'Pesos',   sym: '$'   },
  { acum: 'acum_euros',   cc: 'cc_euros',   saldo: 'saldo_euros',   label: 'Euros',   sym: '€'   },
  { acum: 'acum_reales',  cc: 'cc_reales',  saldo: 'saldo_reales',  label: 'Reales',  sym: 'R$'  },
  { acum: 'acum_usdt',    cc: 'cc_usdt',    saldo: 'saldo_usdt',    label: 'USDT',    sym: 'USDT' },
] as const

function esIngreso(op: string): boolean {
  const o = (op || '').toUpperCase()
  return o.includes('INGRES') || o === 'DONACION'
}

export default async function ExtractoCuentaCorriente({ searchParams }: {
  searchParams: { desde?: string; hasta?: string; operacion?: string; cuenta?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const profile = profileData as { rol: string } | null
  if (!profile) redirect('/login')

  // El extracto es para el personal de la casa de cambio. Un cliente que llegue por la
  // URL vuelve a su cuenta corriente, igual que si no existiera la pantalla.
  if (esCliente(profile.rol)) redirect('/dashboard/cuenta-corriente')

  const cuenta = searchParams.cuenta?.trim()
  if (!cuenta) redirect('/dashboard/cuenta-corriente')

  const desde = searchParams.desde || ''
  const hasta = searchParams.hasta || ''
  const operacion = searchParams.operacion || ''

  const { data } = await (supabase as any).rpc('cta_cte_movimientos', {
    p_cuenta: cuenta,
    p_desde: desde || null,
    p_hasta: hasta || null,
    p_operacion: operacion || null,
    p_limit: TOPE,
    p_offset: 0,
  })
  const movimientos = (data ?? []) as any[]
  const total = Number(movimientos[0]?.total_filas ?? 0)

  const { data: saldosData } = await supabase
    .from('saldos_cuenta_corriente').select('*').eq('cuenta_cte', cuenta).maybeSingle()
  const saldos = (saldosData ?? {}) as any

  // Solo se imprimen las monedas que la cuenta realmente mueve: sin esto el extracto de
  // una cuenta que opera en dólares arrastra cuatro columnas de ceros.
  const activas = MONEDAS.filter(m =>
    Number(saldos[m.saldo] ?? 0) !== 0 || movimientos.some(x => Number(x[m.cc] ?? 0) !== 0)
  )
  const monedas = activas.length ? activas : [MONEDAS[0], MONEDAS[1]]

  // Totales del período (lo listado), distinto del saldo de la cuenta, que es histórico.
  const totales = Object.fromEntries(
    monedas.map(m => [m.cc, movimientos.reduce((a, x) => a + (Number(x[m.cc]) || 0), 0)])
  )

  const periodo = desde && hasta ? `${fecha(desde)} al ${fecha(hasta)}`
    : desde ? `desde el ${fecha(desde)}`
    : hasta ? `hasta el ${fecha(hasta)}`
    : 'todos los movimientos'

  const filtroOp = operacion === 'INGRESO' ? 'solo ingresos'
    : operacion === 'EGRESO' ? 'solo egresos' : ''

  // El saldo acumulado se calcula sobre la cuenta completa; con un filtro de dirección la
  // columna mentiría (le faltarían los movimientos del otro signo), así que no se imprime.
  const conAcumulado = !operacion

  return (
    <>
      <style>{CSS}</style>

      <BotonImprimir />

      <main className="hoja">
        <header className="cab">
          <h1>Cuenta corriente</h1>
          <p className="cuenta">{cuenta}</p>
          <dl className="meta">
            <div><dt>Período</dt><dd>{periodo}</dd></div>
            {filtroOp && <div><dt>Filtro</dt><dd>{filtroOp}</dd></div>}
            <div><dt>Movimientos</dt><dd>{total.toLocaleString('es-AR')}</dd></div>
            <div><dt>Emitido</dt><dd>{new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</dd></div>
          </dl>
        </header>

        <section className="saldos">
          <h2>Saldo de la cuenta</h2>
          <table className="t-saldos">
            <tbody>
              {monedas.map(m => {
                const v = Number(saldos[m.saldo] ?? 0)
                return (
                  <tr key={m.saldo}>
                    <th>{m.label}</th>
                    <td className={`num ${v < 0 ? 'neg' : ''}`}>{m.sym} {money(v)}</td>
                    <td className="nota">
                      {v > 0 ? 'saldo pendiente' : v < 0 ? 'a favor del cliente' : 'sin saldo'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="pie-nota">
            El saldo corresponde a la totalidad de los movimientos de la cuenta, no al período listado.
          </p>
        </section>

        <section>
          <h2>Movimientos</h2>
          {movimientos.length === 0 ? (
            <p className="vacio">No hay movimientos para el período seleccionado.</p>
          ) : (
            <table className="t-mov">
              <thead>
                <tr>
                  <th className="c-fecha">Fecha</th>
                  <th className="c-op">Operación</th>
                  <th className="c-det">Detalle</th>
                  <th className="c-ref">Ref.</th>
                  {monedas.map(m => <th key={m.cc} className="num">{m.label}</th>)}
                  {conAcumulado && <th className="num c-acum">Saldo acumulado</th>}
                </tr>
              </thead>
              <tbody>
                {/* La consulta devuelve lo más nuevo primero, igual que la pantalla. */}
                {movimientos.map(m => {
                  const ing = esIngreso(m.operacion)
                  return (
                    <tr key={m.id}>
                      <td className="c-fecha">{fecha(m.fecha)}</td>
                      <td className="c-op">{m.operacion}</td>
                      <td className="c-det">{m.concepto ?? '—'}</td>
                      <td className="c-ref">{m.evento ?? '—'}</td>
                      {monedas.map(m2 => {
                        const v = Number(m[m2.cc] ?? 0)
                        if (!v) return <td key={m2.cc} className="num cero">—</td>
                        return (
                          <td key={m2.cc} className={`num ${ing ? '' : 'neg'}`}>
                            {m2.sym} {ing ? nf.format(Math.abs(v)) : `(${nf.format(Math.abs(v))})`}
                          </td>
                        )
                      })}
                      {conAcumulado && (
                        <td className="num c-acum">
                          {monedas.map(m2 => `${m2.sym} ${money(Number(m[m2.acum]) || 0)}`).join(' · ')}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total del período</td>
                  {monedas.map(m => {
                    const v = Number(totales[m.cc]) || 0
                    return <td key={m.cc} className={`num ${v < 0 ? 'neg' : ''}`}>{m.sym} {money(v)}</td>
                  })}
                  {conAcumulado && <td />}
                </tr>
              </tfoot>
            </table>
          )}

          {total > TOPE && (
            <p className="aviso">
              El período contiene {total.toLocaleString('es-AR')} movimientos y se imprimen los
              primeros {TOPE.toLocaleString('es-AR')}. Acotá las fechas para incluirlos todos.
            </p>
          )}
        </section>
      </main>
    </>
  )
}

// Estilos propios y completos: la hoja no hereda nada de la aplicación, así se imprime
// igual desde cualquier navegador. Medidas en milímetros, que es como piensa una impresora.
const CSS = `
  @page { size: A4 landscape; margin: 12mm 10mm 14mm; }

  .hoja { font: 10pt/1.35 -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 277mm; margin: 0 auto; padding: 16px; background: #fff; }
  .hoja * { box-sizing: border-box; }

  .cab { border-bottom: 1.5px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
  .cab h1 { font-size: 11pt; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #555; margin: 0; }
  .cab .cuenta { font-size: 17pt; font-weight: 700; margin: 2px 0 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 28px; margin: 0; }
  .meta div { display: flex; gap: 6px; align-items: baseline; }
  .meta dt { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #666; margin: 0; }
  .meta dd { margin: 0; font-weight: 600; }

  h2 { font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: #555; margin: 0 0 6px; }
  section { margin-bottom: 16px; }

  table { width: 100%; border-collapse: collapse; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .neg { color: #b00020; }
  .cero { color: #bbb; }

  .t-saldos { width: auto; min-width: 90mm; }
  .t-saldos th { text-align: left; font-weight: 500; padding: 3px 18px 3px 0; }
  .t-saldos td.num { font-size: 12pt; font-weight: 700; padding: 3px 14px 3px 0; }
  .t-saldos .nota { color: #666; font-size: 8.5pt; }
  .pie-nota { color: #666; font-size: 8.5pt; margin: 6px 0 0; }

  .t-mov { font-size: 8.5pt; }
  .t-mov th { text-align: left; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #111; padding: 5px 6px; }
  .t-mov th.num { text-align: right; }
  .t-mov td { padding: 4px 6px; border-bottom: .5px solid #ddd; vertical-align: top; }
  .t-mov tbody tr:nth-child(even) { background: #f7f7f7; }
  .t-mov tfoot td { border-top: 1.5px solid #111; border-bottom: 0; padding: 6px; font-weight: 700; }

  /* Las columnas de importes se encogen a su contenido (el 1% es el truco de siempre:
     una tabla al 100% le da a las columnas "angostas" lo mínimo y el sobrante se lo
     lleva la única que queda en auto). Sin esto los números se despatarran y el detalle
     queda apretado contra el borde. */
  .t-mov th.num, .t-mov td.num { width: 1%; }
  .c-fecha { white-space: nowrap; width: 1%; }
  .c-op { width: 1%; white-space: nowrap; }
  .c-ref { width: 1%; white-space: nowrap; color: #666; }
  .c-det { width: auto; word-break: break-word; }
  .c-acum { color: #444; }

  .vacio { color: #666; padding: 14px 0; }
  .aviso { margin-top: 10px; padding: 7px 10px; border: 1px solid #999; font-size: 8.5pt; }

  /* La fila de una operación no se parte entre dos hojas, y el encabezado de la tabla se
     repite arriba de cada una: sin esto, a partir de la página 2 no se sabe qué es cada
     columna. */
  .t-mov tr { break-inside: avoid; }
  .t-mov thead { display: table-header-group; }
  .t-mov tfoot { display: table-footer-group; }
  .cab, .saldos { break-inside: avoid; }

  @media print {
    .no-print { display: none !important; }
    .hoja { padding: 0; max-width: none; }
    .t-mov tbody tr:nth-child(even) { background: #f2f2f2; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  @media screen {
    body { background: #e9e9ee; }
    .hoja { background: #fff; margin: 76px auto 40px; box-shadow: 0 2px 18px rgba(0,0,0,.14); padding: 22px 26px 30px; }
  }
`
