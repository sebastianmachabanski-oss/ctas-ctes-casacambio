import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'
import { ESTADOS, ESTADO_LABEL, puedeIr, type Estado } from '@/lib/cheques'

// Cambia el estado de uno o varios cheques (23/11/2026).
//
// LA TRANSICIÓN SE VALIDA ACÁ, NO EN EL NAVEGADOR
// La pantalla ya ofrece solo los botones válidos, pero esa es una comodidad, no una
// garantía: con la URL en la mano se manda cualquier cosa. La máquina de estados vive en
// `src/lib/cheques.ts` y la usan los dos lados, así que no hay dos definiciones que se
// puedan separar — mismo criterio que los predicados de rol.
//
// LAS DOS TABLAS VAN A LA PAR
// `cheques.estado` es el estado de hoy y `cheques_eventos` es cómo llegó. Escribir uno
// sin el otro deja la ficha mintiendo sin ninguna señal en pantalla, que es el accidente
// que ya costó caro con `diario` (1/9/2026). Acá se escriben siempre los dos.

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!esStaff((profile as any)?.rol))
    return NextResponse.json({ error: 'Solo el personal puede operar la cartera de cheques' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
  const destino = body.estado as Estado
  const notas = typeof body.notas === 'string' && body.notas.trim() ? body.notas.trim() : null

  if (!ids.length)
    return NextResponse.json({ error: 'No se eligió ningún cheque' }, { status: 400 })
  if (!ESTADOS.includes(destino))
    return NextResponse.json({ error: `"${destino}" no es un estado de cheque` }, { status: 400 })

  // Qué estado tienen HOY. Se lee de la base y no se confía en lo que mandó la pantalla:
  // entre que se dibujó la lista y se apretó el botón, otro operador pudo moverlos.
  const { data: actuales, error: errorLectura } = await supabase
    .from('cheques').select('id,numero,estado').in('id', ids)
  if (errorLectura) return NextResponse.json({ error: errorLectura.message }, { status: 500 })

  const filas = ((actuales ?? []) as unknown) as { id: string; numero: string; estado: Estado }[]
  if (filas.length !== ids.length)
    return NextResponse.json(
      { error: 'Alguno de los cheques ya no existe. Actualizá la pantalla y probá de nuevo.' },
      { status: 409 })

  // Con uno solo que no pueda, no se mueve ninguno: media operación aplicada es peor que
  // ninguna, porque nadie sabe cuál quedó de cada lado.
  const invalidos = filas.filter(f => !puedeIr(f.estado, destino))
  if (invalidos.length) {
    const detalle = invalidos
      .map(f => `${f.numero} (${ESTADO_LABEL[f.estado]})`)
      .join(', ')
    return NextResponse.json({
      error: `No se puede pasar a ${ESTADO_LABEL[destino]}: ${detalle}. `
        + 'Puede que otro operador los haya movido; actualizá la pantalla.',
    }, { status: 409 })
  }

  const { error: errorUpdate } = await (supabase as any)
    .from('cheques').update({ estado: destino }).in('id', ids)
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 })

  // El historial. Si esto fallara, el estado habría cambiado sin dejar rastro: se avisa
  // en vez de devolver ok, para que quien lo vea sepa que la ficha quedó incompleta.
  const { error: errorEvento } = await (supabase as any).from('cheques_eventos').insert(
    ids.map(id => ({ cheque_id: id, estado: destino, notas, creado_por: user.id })))
  if (errorEvento)
    return NextResponse.json({
      error: 'Los cheques cambiaron de estado pero no se pudo guardar el historial: '
        + errorEvento.message,
    }, { status: 500 })

  return NextResponse.json({ ok: true, cambiados: ids.length, estado: destino })
}
