import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'
import { validarChequesDelAlta, sumaDeCheques, type ChequeNuevo } from '@/lib/cheques'
import {
  registrarSalidaDeCheques, registrarCompraDeCheques, borrarSalidaDeCheques,
  registrarEgresoCuenta, insertarCheques,
} from '@/lib/cheques-movimiento'

// Resuelve un cheque rechazado (27/11/2026).
//
// EL RECHAZO Y SU RESOLUCIÓN SON DOS MOMENTOS DISTINTOS
// Marcar `rechazado` no mueve plata: el cheque todavía puede reintentarse, no pasó nada
// definitivo. La plata se mueve acá, cuando se decide qué se hace con ella. Por eso esto
// es un endpoint aparte de `/api/cheques/estado`, que solo cambia estados.
//
// LAS TRES SALIDAS CON PLATA, Y QUÉ TIENEN EN COMÚN
// En las tres el cheque sale de la cartera con una VENTA de CHEQUES a la cotización que
// resulte de lo que se recupera. Lo único que cambia es DE DÓNDE viene el dinero:
//
//   · efectivo → nada más: el cliente paga y la caja de pesos sube.
//   · cuenta   → además un EGRESAN en su cuenta corriente, que lo deja debiendo.
//   · canje    → además la COMPRA del cheque nuevo, que cancela los pesos.
//
// La quinta salida —el incobrable— vive en `/api/cheques/estado` porque sí es un cambio
// de estado con su movimiento, como la acreditación. Y la primera —reintentar el
// depósito— no mueve plata y tampoco pasa por acá.
//
// CUÁNTO SE COBRA
// El NOMINAL, no lo que se adelantó: el cliente endosó un documento de 100.000 y garantizó
// que se pagaba. La pantalla lo propone y deja editarlo para negociar.

export const dynamic = 'force-dynamic'

type Salida = 'efectivo' | 'cuenta' | 'canje'
const SALIDAS: Salida[] = ['efectivo', 'cuenta', 'canje']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('rol,nombre').eq('id', user.id).single()
  if (!esStaff((profile as any)?.rol))
    return NextResponse.json({ error: 'Solo el personal puede operar la cartera de cheques' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const salida = body.salida as Salida
  const importe = Number(body.importe)
  const cuenta = typeof body.cuenta === 'string' ? body.cuenta.trim() : ''
  const nuevos: ChequeNuevo[] = Array.isArray(body.cheques) ? body.cheques : []

  const hoy = new Date().toISOString().slice(0, 10)
  const fecha = typeof body.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)
    ? body.fecha
    : hoy

  if (!id) return NextResponse.json({ error: 'Falta el cheque' }, { status: 400 })
  if (!SALIDAS.includes(salida))
    return NextResponse.json({ error: 'Salida desconocida' }, { status: 400 })
  if (fecha > hoy)
    return NextResponse.json({ error: 'La fecha no puede ser futura' }, { status: 400 })
  if (!(importe > 0))
    return NextResponse.json({ error: 'El importe recuperado tiene que ser mayor a cero' }, { status: 400 })

  // El estado se lee de la base y no se confía en lo que mandó la pantalla: entre que se
  // dibujó la ficha y se apretó el botón, otro operador pudo moverlo.
  const { data: fila, error: errorLectura } = await supabase
    .from('cheques').select('id,numero,importe,estado').eq('id', id).maybeSingle()
  if (errorLectura) return NextResponse.json({ error: errorLectura.message }, { status: 500 })
  if (!fila) return NextResponse.json({ error: 'El cheque ya no existe' }, { status: 409 })

  const cheque = fila as unknown as { id: string; numero: string; importe: number; estado: string }
  if (cheque.estado !== 'rechazado')
    return NextResponse.json({
      error: `Solo se resuelve un cheque rechazado, y este está ${cheque.estado}. `
        + 'Actualizá la pantalla.',
    }, { status: 409 })

  const nominal = Number(cheque.importe) || 0
  if (!(nominal > 0))
    return NextResponse.json({ error: 'El cheque no tiene importe' }, { status: 400 })

  // Recuperar MÁS que el nominal no es una resolución: es un error de tipeo, o intereses
  // que corresponden cargar aparte. Se corta antes de mover plata.
  if (importe > nominal * 1.0000001)
    return NextResponse.json({
      error: `No se puede recuperar más que el nominal del cheque. `
        + 'Si hay intereses, cargalos como una operación aparte.',
    }, { status: 400 })

  const autor = (profile as any)?.nombre ?? user.email ?? 'app'
  const referencia = `Rechazo resuelto · cheque ${cheque.numero} · ${cheque.id}`

  // Validación del canje ANTES de mover nada: los cheques nuevos tienen que sumar lo que
  // se dice recuperar, misma regla que el alta.
  if (salida === 'canje') {
    const problema = validarChequesDelAlta(nuevos, sumaDeCheques(nuevos))
    if (problema) return NextResponse.json({ error: problema }, { status: 400 })
    if (!(sumaDeCheques(nuevos) > 0))
      return NextResponse.json({ error: 'Cargá el cheque que recibís en canje' }, { status: 400 })
    // Reconocerle MÁS de lo que vale el cheque nuevo sería comprarlo sobre la par: no
    // existe en el negocio y deja la cotización arriba de 1. Casi siempre es un tipeo.
    if (importe > sumaDeCheques(nuevos) * 1.0000001)
      return NextResponse.json({
        error: `El cheque que recibís suma menos de lo que le estás reconociendo. `
          + 'Bajá el valor reconocido o revisá los importes.',
      }, { status: 400 })
  }
  if (salida === 'cuenta' && !cuenta)
    return NextResponse.json({ error: 'Elegí la cuenta corriente a debitar' }, { status: 400 })

  // ── 1. El cheque sale de la cartera ─────────────────────────────────────
  // La cotización es cuánto se recupera por peso de nominal, igual que en todas las
  // salidas del circuito.
  const salidaMov = await registrarSalidaDeCheques(supabase, {
    fecha,
    cliente: salida === 'cuenta' ? cuenta : (body.cliente || 'RECHAZO RESUELTO'),
    nominal,
    cotizacion: importe / nominal,
    referencia,
    autor,
  })
  if ('error' in salidaMov)
    return NextResponse.json({ error: salidaMov.error }, { status: 500 })

  // ── 2. La contrapartida, según la salida ────────────────────────────────
  const deshacer = async () => { await borrarSalidaDeCheques(supabase, salidaMov.id) }

  if (salida === 'cuenta') {
    const res = await registrarEgresoCuenta(supabase, {
      fecha, cuenta, monto: importe, referencia, autor,
    })
    if ('error' in res) {
      await deshacer()
      return NextResponse.json({
        error: `${res.error}. La salida del cheque se deshizo; no quedó nada a medias.`,
      }, { status: 500 })
    }
  }

  if (salida === 'canje') {
    const nominalNuevo = sumaDeCheques(nuevos)
    // Los pesos se cancelan: la casa no pone plata. Lo que el cheque nuevo valga de más
    // es la ganancia del canje, y sale sola del spread entre las dos cotizaciones.
    const compra = await registrarCompraDeCheques(supabase, {
      fecha,
      cliente: 'CANJE DE CHEQUE RECHAZADO',
      nominal: nominalNuevo,
      cotizacion: importe / nominalNuevo,
      referencia,
      autor,
    })
    if ('error' in compra) {
      await deshacer()
      return NextResponse.json({
        error: `${compra.error}. La salida del cheque se deshizo; no quedó nada a medias.`,
      }, { status: 500 })
    }
    const ins = await insertarCheques(supabase, {
      movimientoId: compra.id,
      cheques: nuevos,
      fecha,
      creadoPor: user.id,
      nota: `Recibido en canje del cheque ${cheque.numero}`,
      vinculoCanje: cheque.id,
    })
    if ('error' in ins) {
      await borrarSalidaDeCheques(supabase, compra.id)
      await deshacer()
      return NextResponse.json({
        error: `${ins.error}. Se deshizo todo; no quedó nada a medias.`,
      }, { status: 500 })
    }
  }

  // ── 3. Recién ahora el estado ───────────────────────────────────────────
  // La plata primero y el estado después, igual que en la acreditación: si fallara al
  // revés, el cheque quedaría resuelto sin su plata y nadie lo notaría hasta el arqueo.
  const { error: errorEstado } = await (supabase as any)
    .from('cheques').update({ estado: 'devuelto' }).eq('id', cheque.id)
  if (errorEstado) {
    await deshacer()
    return NextResponse.json({
      error: `${errorEstado.message} — los movimientos se deshicieron.`,
    }, { status: 500 })
  }

  const { error: errorEvento } = await (supabase as any).from('cheques_eventos').insert({
    cheque_id: cheque.id,
    fecha,
    estado: 'devuelto',
    movimiento_id: salidaMov.id,
    notas: notaDeSalida(salida, importe, cuenta),
    creado_por: user.id,
  })
  if (errorEvento)
    return NextResponse.json({
      error: 'El rechazo se resolvió pero no se pudo guardar el historial: ' + errorEvento.message,
    }, { status: 500 })

  return NextResponse.json({ ok: true, salida, importe })
}

/** Qué se hizo, en el idioma del operador y no en el de la base. */
function notaDeSalida(salida: Salida, importe: number, cuenta: string): string {
  const monto = importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })
  if (salida === 'efectivo') return `El cliente repuso $ ${monto} en efectivo`
  if (salida === 'cuenta') return `Debitado $ ${monto} en la cuenta de ${cuenta}`
  return `Canjeado por otro cheque, por $ ${monto}`
}

