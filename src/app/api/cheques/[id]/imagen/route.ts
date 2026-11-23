import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'

// Asocia (o quita) la imagen de un cheque ya cargado (23/11/2026).
//
// El ARCHIVO no pasa por acá: el navegador lo sube directo al bucket con la sesión del
// operador, porque una foto de teléfono son varios megas y esta función tiene 30
// segundos. Lo único que viaja es la RUTA, y lo único que hace esta ruta es guardarla.
//
// Por eso la validación que importa es que la ruta sea una ruta y no cualquier cosa: sin
// esto se podría guardar "http://otro-sitio/loquesea" y la ficha mostraría una imagen
// traída de afuera. Además, la policy del bucket ya decidió si esta persona podía subir.

/** `AAAA/MM/<id>.<ext>` y nada más: sin `..`, sin barra inicial, sin esquema. */
const ES_RUTA = /^\d{4}\/\d{2}\/[A-Za-z0-9._-]+$/

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!esStaff((profile as any)?.rol))
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const ruta = body.archivo_url === null ? null : String(body.archivo_url ?? '').trim()

  if (ruta !== null && (!ruta || !ES_RUTA.test(ruta) || ruta.includes('..')))
    return NextResponse.json(
      { error: 'La referencia de la imagen no es válida.' }, { status: 400 })

  const { error } = await (supabase as any)
    .from('cheques').update({ archivo_url: ruta }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, archivo_url: ruta })
}
