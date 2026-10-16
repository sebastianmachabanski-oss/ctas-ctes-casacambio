import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { esAdmin } from '@/lib/roles'

/**
 * Cuántos DÓLARES vale una LIBRA. Solo administradores.
 *
 * Es el número con el que la alerta de monto grande mide las operaciones en libras.
 * Hace falta porque la fuente de cotizaciones que usa la pantalla (dolarapi) no publica
 * la libra: trae dólar, euro, real, peso chileno y uruguayo.
 *
 * No busca precisión de mercado: solo decide si una operación supera un umbral, no
 * calcula ningún saldo. Por eso alcanza con una paridad que un administrador ajusta de
 * vez en cuando, en lugar de sumar una segunda API al camino de carga.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!esAdmin((profile as any)?.rol))
    return NextResponse.json({ error: 'Solo un administrador puede cambiar la paridad' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const dolares = Number(body.dolares)
  // El tope alto no es una validación de mercado: es una red contra un error de tipeo
  // que dejaría la alerta disparando en todas las operaciones o en ninguna.
  if (!isFinite(dolares) || dolares <= 0 || dolares > 100)
    return NextResponse.json(
      { error: 'La paridad debe ser un número mayor a 0 (cuántos dólares vale una libra)' },
      { status: 400 },
    )

  const { error } = await (supabase as any).from('app_config').upsert(
    { key: 'dolares_por_libra', value: { dolares }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, dolares })
}
