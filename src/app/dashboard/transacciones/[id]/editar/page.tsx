import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FormEditarTransaccion from '@/components/transacciones/FormEditarTransaccion'

export default async function EditarTransaccionPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as { rol: string } | null)?.rol
  // Editar es exclusivo del superusuario; el operador vuelve al listado.
  if (rol !== 'superusuario') redirect('/dashboard/transacciones')

  const { data: mov } = await supabase
    .from('movimientos_caja').select('*').eq('id', params.id).single()
  if (!mov) notFound()

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Editar transacción</h1>
        <p className="text-gray-500 text-sm mt-1">
          {(mov as any).tipo === 'CTA CTE' ? 'Movimiento de cuenta corriente' : 'Movimiento de caja'}
          {(mov as any).fila_sheet ? ` · fila ${(mov as any).fila_sheet} de la planilla` : ''}
        </p>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">⚠️ Este cambio no se escribe en la planilla</p>
        <p>
          Mientras el Google Sheet siga siendo la fuente de verdad, la próxima sincronización
          va a <b>pisar esta edición</b> con lo que diga la planilla. La pantalla queda lista
          para cuando la app pase a ser la única fuente de datos.
        </p>
      </div>

      <FormEditarTransaccion movimiento={mov as any} />
    </div>
  )
}
