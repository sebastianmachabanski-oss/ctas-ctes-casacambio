import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarAuditoria, calcularHuella, describirMovimiento } from '@/lib/auditoria'

// Marca que el dinero "en la calle" ingresó a la caja: borra el campo DEBE (repartidor),
// igual que hacen hoy en la planilla. NO escribe en el Google Sheet: si la planilla
// conserva el DEBE, el próximo sync lo vuelve a traer (comportamiento asumido durante
// la convivencia, avisado en la pantalla).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  if ((profile as any)?.rol !== 'superusuario')
    return NextResponse.json({ error: 'Solo el superusuario puede registrar el ingreso' }, { status: 403 })

  // Se lee antes de actualizar: es dinero que vuelve del reparto y hay que dejar
  // registrado quién lo dio por ingresado y a qué repartidor se le estaba contando.
  const { data: previo } = await supabase.from('movimientos_caja')
    .select('*').eq('id', params.id).single()

  const { error } = await supabase.from('movimientos_caja').update({
    debe: null,
    editado_por: (profile as any)?.nombre ?? user.email ?? 'app',
    editado_at: new Date().toISOString(),
  }).eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await registrarAuditoria(supabase, {
    accion: 'ingreso_calle',
    usuarioId: user.id,
    usuarioNombre: (profile as any)?.nombre ?? user.email ?? 'app',
    usuarioRol: (profile as any)?.rol,
    movimientoId: params.id,
    huella: previo ? calcularHuella(previo as any) : null,
    resumen: previo
      ? `Ingresó a caja (repartidor: ${(previo as any).debe ?? '—'}) — ${describirMovimiento(previo)}`
      : 'Ingresó a caja',
    campos: ['debe'],
    datosAntes: previo ? { debe: (previo as any).debe } : null,
    datosDespues: { debe: null },
  })

  return NextResponse.json({ ok: true })
}
