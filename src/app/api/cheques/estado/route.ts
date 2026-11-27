import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'
import { ESTADOS, ESTADO_LABEL, puedeIr, CLIENTE_SIN_BANCO, type Estado } from '@/lib/cheques'
import { registrarSalidaDeCheques, borrarSalidaDeCheques } from '@/lib/cheques-movimiento'

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

  const { data: profile } = await supabase
    .from('profiles').select('rol,nombre').eq('id', user.id).single()
  if (!esStaff((profile as any)?.rol))
    return NextResponse.json({ error: 'Solo el personal puede operar la cartera de cheques' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
  const destino = body.estado as Estado
  const notas = typeof body.notas === 'string' && body.notas.trim() ? body.notas.trim() : null

  // LA FECHA DEL HECHO, NO LA DE LA CARGA. Un cobro que se marca tres días después tiene
  // que entrar a la caja con la fecha en que el banco pagó, o el arqueo de ese día no
  // cierra. Si la pantalla no manda nada se usa hoy, que es el caso normal.
  const hoy = new Date().toISOString().slice(0, 10)
  const fecha = typeof body.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)
    ? body.fecha
    : hoy
  if (fecha > hoy)
    return NextResponse.json({ error: 'La fecha no puede ser futura' }, { status: 400 })

  if (!ids.length)
    return NextResponse.json({ error: 'No se eligió ningún cheque' }, { status: 400 })
  if (!ESTADOS.includes(destino))
    return NextResponse.json({ error: `"${destino}" no es un estado de cheque` }, { status: 400 })

  // Qué estado tienen HOY. Se lee de la base y no se confía en lo que mandó la pantalla:
  // entre que se dibujó la lista y se apretó el botón, otro operador pudo moverlos.
  const { data: actuales, error: errorLectura } = await supabase
    .from('cheques').select('id,numero,estado,importe,banco').in('id', ids)
  if (errorLectura) return NextResponse.json({ error: errorLectura.message }, { status: 500 })

  const filas = ((actuales ?? []) as unknown) as {
    id: string; numero: string; estado: Estado; importe: number; banco: string | null
  }[]
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

  // ── LA PLATA, ANTES QUE EL ESTADO ───────────────────────────────────────
  //
  // Acreditar genera el movimiento de cobro (27/11/2026). Se hace PRIMERO y se marca
  // después: si fallara al revés, el cheque quedaría acreditado sin su plata y nadie lo
  // notaría hasta el arqueo. Al revés, si falla el marcado, se borra el movimiento y no
  // queda nada a medias.
  //
  // UN MOVIMIENTO POR BANCO. El cobro se liquida contra el banco que pagó, y acreditar de
  // una vez cheques de bancos distintos son cobros distintos. Mezclarlos en una sola fila
  // obligaría a inventar un cliente que no es ninguno de los dos.
  const movimientosCreados: { id: string; chequeIds: string[] }[] = []
  if (destino === 'acreditado') {
    const porBanco = new Map<string, typeof filas>()
    for (const f of filas) {
      const banco = (f.banco ?? '').trim() || CLIENTE_SIN_BANCO
      const g = porBanco.get(banco)
      if (g) g.push(f); else porBanco.set(banco, [f])
    }

    for (const [banco, delBanco] of Array.from(porBanco.entries())) {
      const nominal = delBanco.reduce((a, f) => a + (Number(f.importe) || 0), 0)
      const numeros = delBanco.map(f => f.numero).join(', ')
      const res = await registrarSalidaDeCheques(supabase, {
        fecha,
        cliente: banco,
        nominal,
        // El banco paga el valor escrito: no hay quita.
        cotizacion: 1,
        referencia: `Acreditación de cheques ${numeros}`.slice(0, 500),
        autor: (profile as any)?.nombre ?? user.email ?? 'app',
      })
      if ('error' in res) {
        // Deshacer lo que ya se creó en esta misma tanda: media acreditación aplicada es
        // peor que ninguna, porque nadie sabe cuál quedó de cada lado.
        for (const m of movimientosCreados) await borrarSalidaDeCheques(supabase, m.id)
        return NextResponse.json({
          error: `No se pudo registrar el cobro de ${banco}: ${res.error}. `
            + 'No se marcó ningún cheque.',
        }, { status: 500 })
      }
      movimientosCreados.push({ id: res.id, chequeIds: delBanco.map(f => f.id) })
    }
  }

  // ── DESHACER UNA ACREDITACIÓN ───────────────────────────────────────────
  // Volver a `depositado` desde `acreditado` borra el movimiento de cobro. Se busca por
  // el evento que lo dejó anotado, que es exactamente para lo que existe esa columna.
  //
  // Se mira cheque por cheque y no con un `every`: a `depositado` se puede llegar desde
  // `en_cartera`, desde `rechazado` y desde `acreditado`, así que una tanda mixta es
  // válida, y con un `every` los acreditados de esa tanda habrían perdido su cobro sin
  // que nadie lo borrara. La pantalla no deja armar esa selección, pero la API no se
  // apoya en el navegador para nada.
  //
  // Los dos destinos que deshacen: a `depositado` si el cobro fue por banco y a
  // `en_cartera` si fue por ventanilla. Lo que importa no es a dónde va sino DE DÓNDE
  // viene — si el cheque estaba acreditado, su cobro hay que borrarlo.
  const avisos: string[] = []
  const vuelvenDeAcreditado = filas.filter(f => f.estado === 'acreditado').map(f => f.id)
  if ((destino === 'depositado' || destino === 'en_cartera') && vuelvenDeAcreditado.length) {
    const { data: evs } = await (supabase as any)
      .from('cheques_eventos').select('cheque_id,movimiento_id')
      .in('cheque_id', vuelvenDeAcreditado).eq('estado', 'acreditado')
      .not('movimiento_id', 'is', null)
    const aBorrar = Array.from(new Set(
      (((evs ?? []) as { movimiento_id: string }[]).map(e => e.movimiento_id))))

    for (const movId of aBorrar) {
      const res = await borrarSalidaDeCheques(supabase, movId)
      if ('error' in res) return NextResponse.json({
        error: `No se pudo deshacer el cobro: ${res.error}. No se movió ningún cheque.`,
      }, { status: 500 })
      if (res.avisoDiario) avisos.push(res.avisoDiario)
    }
    if (!aBorrar.length) avisos.push(
      'No se encontró el movimiento de cobro: puede que se haya acreditado antes del '
      + '27/11/2026, cuando todavía no se registraba. Revisá la caja a mano.')
  }

  const { error: errorUpdate } = await (supabase as any)
    .from('cheques').update({ estado: destino }).in('id', ids)
  if (errorUpdate) {
    for (const m of movimientosCreados) await borrarSalidaDeCheques(supabase, m.id)
    return NextResponse.json({
      error: errorUpdate.message
        + (movimientosCreados.length ? ' — el movimiento de cobro se deshizo.' : ''),
    }, { status: 500 })
  }

  // El historial. Si esto fallara, el estado habría cambiado sin dejar rastro: se avisa
  // en vez de devolver ok, para que quien lo vea sepa que la ficha quedó incompleta.
  //
  // `movimiento_id` ata el evento con la plata que movió. Es lo que después permite
  // deshacer sin adivinar, y es la columna que la tabla tenía declarada y vacía desde el
  // 22/11/2026: hasta ahora solo la escribía el alta.
  const movDe = new Map<string, string>()
  for (const m of movimientosCreados) for (const c of m.chequeIds) movDe.set(c, m.id)

  const { error: errorEvento } = await (supabase as any).from('cheques_eventos').insert(
    ids.map(id => ({
      cheque_id: id, estado: destino, fecha, notas,
      movimiento_id: movDe.get(id) ?? null, creado_por: user.id,
    })))
  if (errorEvento)
    return NextResponse.json({
      error: 'Los cheques cambiaron de estado pero no se pudo guardar el historial: '
        + errorEvento.message,
    }, { status: 500 })

  return NextResponse.json({
    ok: true,
    cambiados: ids.length,
    estado: destino,
    movimientos: movimientosCreados.length,
    avisos,
  })
}
