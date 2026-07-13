import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularMovimiento, validarOperacion } from '@/lib/motor-calculo'

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
  const { fecha, tipo, col_f, cuenta_cte, operacion, propio, externo, monto, cotizacion, costo_porcentaje, debe, notas } = body

  if (!fecha || !tipo || !col_f || !cuenta_cte || !operacion || !propio || !externo || monto == null)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  if (!['CTA CTE', 'CAJA'].includes(tipo))
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

  if (!['C', 'T'].includes(col_f))
    return NextResponse.json({ error: 'Op debe ser C o T' }, { status: 400 })

  // La Operación disponible depende del Tipo: CTA CTE solo mueve cuenta corriente
  // (INGRESAN/EGRESAN); CAJA admite además las operaciones de caja (compra/venta/gastos).
  const OPERACIONES_VALIDAS: Record<string, string[]> = {
    'CTA CTE': ['INGRESAN', 'EGRESAN'],
    'CAJA': ['COMPRA', 'VENTA', 'INGRESAN', 'EGRESAN', 'GASTOS'],
  }
  if (!OPERACIONES_VALIDAS[tipo]?.includes(operacion))
    return NextResponse.json({ error: 'Operación inválida para el tipo seleccionado' }, { status: 400 })

  // Impacto en caja con el MISMO motor validado contra la planilla. Si la combinación
  // es inválida (ej. GASTOS en otra moneda que PESOS), se rechaza ANTES de guardar nada.
  const errorNegocio = validarOperacion({ operacion, propio })
  if (errorNegocio) return NextResponse.json({ error: errorNegocio }, { status: 400 })
  let impacto: { cuenta: string | null; valores: Record<string, number> }
  try {
    impacto = calcularMovimiento({
      tipo: tipo as 'CAJA' | 'CTA CTE',
      operacion, propio, externo,
      monto: Number(monto),
      cotizacion: cotizacion ? Number(cotizacion) : null,
      costoPorcentaje: costo_porcentaje ? Number(costo_porcentaje) : null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Operación inválida' }, { status: 400 })
  }

  // Calculate currency deltas for Supabase (view uses SUM). Solo aplica a movimientos de
  // cuenta corriente (INGRESAN/EGRESAN) — `diario` solo lo consultan las vistas de CTA CTE.
  // Las operaciones de CAJA (COMPRA/VENTA/GASTOS) no mueven saldo de cta cte: quedan en 0.
  const monedaNorm = mapMoneda(propio)
  let cc_pesos = 0, cc_dolares = 0, cc_euros = 0, cc_reales = 0
  if (operacion === 'INGRESAN' || operacion === 'EGRESAN') {
    const sign = operacion === 'INGRESAN' ? 1 : -1
    cc_pesos    = monedaNorm === 'PESOS'   ? sign * monto : 0
    cc_dolares  = monedaNorm === 'DOLARES' ? sign * monto : 0
    cc_euros    = monedaNorm === 'EUROS'   ? sign * monto : 0
    cc_reales   = monedaNorm === 'REALES'  ? sign * monto : 0
  }

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

  // Escritura DIRECTA en movimientos_caja (el espejo que leen Transacciones, Inicio y
  // Ganancias): el movimiento se ve al instante, sin esperar al sync. Las columnas de
  // impacto las calcula el motor (validado 100% contra la planilla). Mientras dure la
  // convivencia, el próximo sync full reemplaza esta fila por la copia que venga de la
  // planilla (idéntica si la escritura al Sheet salió bien) — sin duplicados.
  const { error: cajaError } = await supabase.from('movimientos_caja').insert({
    fila_sheet: null,
    fecha,
    tipo,
    cliente: cuenta_cte,
    operacion,
    propio: propio ? String(propio).trim().toUpperCase() : null,
    externo: externo ? String(externo).trim().toUpperCase() : null,
    monto: Number(monto),
    cot: cotizacion ? Number(cotizacion) : null,
    // Réplica de COTEXT de la planilla: IF(COT=0;1;COT).
    cot_efectiva: cotizacion ? Number(cotizacion) : 1,
    costo_pct: costo_porcentaje ? Number(costo_porcentaje) : null,
    debe: debe && String(debe).trim() ? String(debe).trim() : null,
    notas: notas || null,
    cuenta: impacto.cuenta,
    ...impacto.valores,
  })
  // Tolerante: diario ya quedó guardado y la planilla se escribe aparte; si esta pata
  // falla (p. ej. falta la policy de INSERT), el movimiento aparece con el próximo sync.
  if (cajaError) console.error('No se pudo escribir movimientos_caja directo:', cajaError.message)

  return NextResponse.json({ success: true, caja_directa: !cajaError })
}
