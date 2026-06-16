import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

function mapMoneda(val: string): string {
  const m = val.trim().toUpperCase()
  if (m.includes('DOLAR') || m === 'USD') return 'DOLARES'
  if (m.includes('PESO') || m === 'ARS') return 'PESOS'
  if (m.includes('EURO') || m === 'EUR') return 'EUROS'
  if (m.includes('REAL') || m === 'BRL') return 'REALES'
  return m
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (profile as any).rol
  if (rol !== 'superusuario' && rol !== 'operador')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  const { fecha, tipo, col_f, cuenta_cte, operacion, propio, externo, monto, cotizacion, notas } = body

  if (!fecha || !tipo || !col_f || !cuenta_cte || !operacion || !propio || !externo || monto == null)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  if (!['CTA CTE', 'CAJA'].includes(tipo))
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

  if (!['C', 'T'].includes(col_f))
    return NextResponse.json({ error: 'Op debe ser C o T' }, { status: 400 })

  if (!['INGRESAN', 'EGRESAN'].includes(operacion))
    return NextResponse.json({ error: 'Operación inválida' }, { status: 400 })

  // Calculate currency deltas for Supabase (view uses SUM)
  const sign = operacion === 'INGRESAN' ? 1 : -1
  const monedaNorm = mapMoneda(propio)
  const cc_pesos    = monedaNorm === 'PESOS'   ? sign * monto : 0
  const cc_dolares  = monedaNorm === 'DOLARES' ? sign * monto : 0
  const cc_euros    = monedaNorm === 'EUROS'   ? sign * monto : 0
  const cc_reales   = monedaNorm === 'REALES'  ? sign * monto : 0

  // Insert into Supabase
  const { error: insertError } = await supabase.from('diario').insert({
    fecha,
    tipo,
    cuenta_cte,
    operacion,
    concepto: `${propio.trim()} → ${externo.trim()}`,
    detalle: col_f,
    moneda: monedaNorm,
    monto,
    cotizacion: cotizacion || null,
    cc_pesos,
    cc_dolares,
    cc_euros,
    cc_reales,
    notas: notas || null,
    creado_por: (profile as any).nombre ?? user.email,
    anulado: false,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
