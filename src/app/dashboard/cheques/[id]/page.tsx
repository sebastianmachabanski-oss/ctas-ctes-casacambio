import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'
import { hoyArgentina } from '@/lib/periodos'
import FichaView from '@/components/cheques/FichaView'
import type { Cheque, Evento } from '@/lib/cheques'
import { BUCKET_CHEQUES } from '@/lib/cheques-archivo'

// Ficha de un cheque (23/11/2026).
//
// Cuando un cheque rebota, la pregunta no es cuánto era: es QUÉ SE HIZO Y CUÁNDO. Quién
// lo trajo, qué día se depositó, cuándo rechazó el banco y qué se hizo con la plata. Esa
// secuencia es la que reclama un cliente, y sin esta pantalla vive en la memoria de
// alguien.

export const dynamic = 'force-dynamic'

const COLUMNAS = 'id,numero,importe,fecha_pago,fecha_emision,estado,tipo,librador,'
  + 'cuit_librador,banco,sucursal,cuenta,cmc7,id_echeq,archivo_url,notas,movimiento_id'

export default async function ChequePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as { rol: string } | null)?.rol
  if (!esStaff(rol)) redirect('/dashboard')

  const { data, error } = await supabase
    .from('cheques').select(COLUMNAS).eq('id', params.id).maybeSingle()
  if (error || !data) notFound()
  const cheque = { ...(data as unknown as Cheque) }
  cheque.importe = Number(cheque.importe) || 0

  // El curso del cheque, del más viejo al más nuevo: así se lee como una historia.
  // `creado_en` desempata los eventos del mismo día, que es el caso normal cuando un
  // rechazo y su gestión se cargan juntos.
  const { data: ev } = await supabase
    .from('cheques_eventos')
    .select('id,cheque_id,fecha,estado,movimiento_id,notas')
    .eq('cheque_id', params.id)
    .order('fecha', { ascending: true })
    .order('creado_en', { ascending: true })
  const eventos = ((ev ?? []) as unknown) as Evento[]

  // La operación que lo trajo. Es lo que separa al LIBRADOR —quien firmó el cheque— del
  // CLIENTE que vino a descontarlo, que no son la misma persona y es justamente por eso
  // que el riesgo se mide por librador y la cuenta corriente por cliente.
  const { data: mov } = await supabase
    .from('movimientos_caja')
    .select('id,fecha,cliente,operacion,cheques,pesos')
    .eq('id', cheque.movimiento_id)
    .maybeSingle()

  // EL ENLACE A LA IMAGEN SE FIRMA ACÁ Y EN CADA VISITA.
  //
  // El bucket es privado porque un cheque muestra la firma de un tercero, así que no hay
  // URL fija que sirva. `cheques.archivo_url` guarda la RUTA, y la firma —de vida corta—
  // se pide al dibujar la pantalla. Guardar la URL firmada sería guardar algo que dentro
  // de una hora no funciona.
  let imagen: string | null = null
  if (cheque.archivo_url) {
    const { data: firma } = await supabase
      .storage.from(BUCKET_CHEQUES).createSignedUrl(cheque.archivo_url, 60 * 60)
    imagen = firma?.signedUrl ?? null
  }

  return (
    <FichaView
      cheque={cheque}
      eventos={eventos}
      origen={(mov as any) ?? null}
      hoy={hoyArgentina()}
      imagen={imagen}
    />
  )
}
