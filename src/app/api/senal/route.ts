import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Señal de cambios: dice si hay algo nuevo, sin traer nada.
 *
 * El refresco automático de Inicio pregunta acá cada minuto. Si la señal es la misma que
 * la última vez, no hace nada; recién cuando cambia vuelve a armar la pantalla. Así el
 * trabajo pesado —los totales del listado, que recorren todas las filas que coinciden con
 * el filtro— ocurre solo cuando de verdad se cargó un movimiento, y no 600 veces por
 * jornada por pestaña abierta.
 *
 * La cuenta la hace `senal_cambios()` en la base (ver migrations/2026-09-11): dos max()
 * resueltos por índice.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await (supabase as any).rpc('senal_cambios')
  if (error) {
    // Si la migración todavía no corrió, se avisa con 501 y el cliente deja de preguntar.
    // Es preferible a devolver una señal falsa: con una señal que nunca cambia, la
    // pantalla se quedaría vieja para siempre y en silencio.
    return NextResponse.json({ error: error.message }, { status: 501 })
  }

  return NextResponse.json(
    { senal: String(data ?? '') },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
