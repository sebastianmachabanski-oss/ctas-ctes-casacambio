import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { esCliente } from '@/lib/roles'
import { traerExtracto, nombreArchivo } from '@/lib/consultas/extracto'
import { generarExtractoPdf } from '@/lib/pdf/extracto'

/**
 * Extracto de cuenta corriente en PDF, listo para descargar o compartir.
 *
 * Reemplaza al camino viejo —abrir una pestaña y disparar el diálogo de impresión para
 * que el usuario eligiera "Guardar como PDF"—, que eran cinco pasos antes de tener el
 * archivo.
 *
 * Se genera EN EL SERVIDOR: la cuenta más grande tiene unos 7.700 movimientos y armar eso
 * en el navegador bloquea la pestaña varios segundos. Acá tarda ~3 s y pesa ~1,5 MB.
 *
 * Mismos permisos que la vista imprimible: es para el personal de la casa de cambio. Un
 * cliente que llegue por la URL recibe 403, no el extracto de otro.
 */

export const dynamic = 'force-dynamic'
// El caso extremo tarda unos segundos; el default de Netlify (10 s) queda justo.
export const maxDuration = 30

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const profile = profileData as { rol: string } | null
  if (!profile || esCliente(profile.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const url = new URL(req.url)
  const cuenta = (url.searchParams.get('cuenta') ?? '').trim()
  if (!cuenta) return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400 })

  const datos = await traerExtracto(supabase, {
    cuenta,
    desde: url.searchParams.get('desde') ?? '',
    hasta: url.searchParams.get('hasta') ?? '',
    operacion: url.searchParams.get('operacion') ?? '',
  })

  const pdf = generarExtractoPdf(datos)
  const nombre = nombreArchivo(datos)

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      // `attachment` para que baje en vez de abrirse en el visor: el usuario lo quiere
      // como archivo, para adjuntarlo. El nombre va en las dos formas porque el formato
      // simple no admite acentos y algunos navegadores viejos ignoran el `filename*`.
      'Content-Disposition':
        `attachment; filename="${nombre.replace(/[^\x20-\x7E]/g, '_')}"; ` +
        `filename*=UTF-8''${encodeURIComponent(nombre)}`,
      // Un extracto no se cachea: los saldos cambian con cada movimiento.
      'Cache-Control': 'no-store',
    },
  })
}
