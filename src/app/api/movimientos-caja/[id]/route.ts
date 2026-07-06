import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularMovimiento, validarOperacion, MotorCalculoError } from '@/lib/motor-calculo'

// Edita un movimiento de caja. NO escribe en el Google Sheet (decisión 5/7/2026):
// mientras dure la convivencia, el próximo sync pisa estos cambios — comportamiento
// asumido y avisado en la pantalla. Las 10 columnas calculadas se recalculan con el
// motor de la app (validado al 100% contra la planilla, ver docs/MOTOR-CALCULO.md).

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  const rol = (profile as any)?.rol
  // Editar es exclusivo del superusuario (el operador solo visualiza).
  if (rol !== 'superusuario')
    return NextResponse.json({ error: 'Solo el superusuario puede editar transacciones' }, { status: 403 })

  const body = await request.json()
  const { fecha, cliente, operacion, propio, externo, monto, cot, costo_pct, debe, notas } = body

  if (!fecha || !operacion || !propio || monto == null || isNaN(Number(monto)))
    return NextResponse.json({ error: 'Faltan campos requeridos (fecha, operación, moneda, monto)' }, { status: 400 })

  // La fila original define el tipo (CAJA / CTA CTE) — eso no se edita.
  const { data: original, error: getError } = await supabase
    .from('movimientos_caja').select('tipo').eq('id', params.id).single()
  if (getError || !original)
    return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })

  const datos = {
    tipo: (original as any).tipo as 'CAJA' | 'CTA CTE',
    operacion: String(operacion),
    propio: String(propio),
    externo: String(externo ?? ''),
    monto: Number(monto),
    cotizacion: cot != null && cot !== '' ? Number(cot) : null,
    costoPorcentaje: costo_pct != null && costo_pct !== '' ? Number(costo_pct) : null,
  }

  const errorNegocio = validarOperacion({ operacion: datos.operacion, propio: datos.propio })
  if (errorNegocio) return NextResponse.json({ error: errorNegocio }, { status: 400 })

  let resultado
  try {
    resultado = calcularMovimiento(datos)
  } catch (e: any) {
    const msg = e instanceof MotorCalculoError ? e.message : 'No se pudo calcular el movimiento'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const v = resultado.valores
  const { error: updError } = await supabase.from('movimientos_caja').update({
    fecha,
    cliente: cliente?.trim() || null,
    operacion: datos.operacion.trim().toUpperCase(),
    propio: datos.propio.trim().toUpperCase(),
    externo: datos.externo.trim().toUpperCase() || null,
    monto: datos.monto,
    cot: datos.cotizacion,
    cot_efectiva: datos.cotizacion ?? 1,
    costo_pct: datos.costoPorcentaje,
    debe: debe?.trim() || null,
    notas: notas?.trim() || null,
    cuenta: resultado.cuenta,
    pesos: v.PESOS, cheques: v.CHEQUES, dolares: v.DOLARES, euros: v.EUROS, reales: v.REALES,
    banco: v.BANCO, cc_pesos: v['CC PESOS'], cc_dolares: v['CC DOLARES'],
    cc_euros: v['CC EUROS'], cc_reales: v['CC REALES'],
    editado_por: (profile as any)?.nombre ?? user.email ?? 'app',
    editado_at: new Date().toISOString(),
  }).eq('id', params.id)

  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })
  return NextResponse.json({ ok: true, cuenta: resultado.cuenta, valores: v })
}
