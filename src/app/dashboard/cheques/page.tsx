import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { esStaff } from '@/lib/roles'
import { hoyArgentina } from '@/lib/periodos'
import {
  resumenCartera, concentracionPorLibrador, esActivo, ESTADOS,
  type Cheque, type Estado,
} from '@/lib/cheques'
import { tasaDeCartera, type Origen } from '@/lib/cheques-tasa'
import CarteraView from '@/components/cheques/CarteraView'

// Cartera de cheques (23/11/2026).
//
// Un cheque no es una moneda: es un objeto con librador, banco, fecha de pago y un estado
// que cambia. El modelo está en `migrations/2026-11-22_cheques.sql` y los flujos en
// `docs/CHEQUES.md`; las cuentas, en `src/lib/cheques.ts`.
//
// POR QUÉ SE TRAE TODA LA CARTERA Y NO UNA PÁGINA
// Las cuatro cifras de arriba y la concentración por librador son de la cartera ENTERA.
// Calcularlas sobre la página que se está viendo daría un número que cambia al pasar de
// página, que es peor que no tenerlo. La cartera activa de una casa de cambio son cientos
// de cheques, no cientos de miles: traerla entera es barato y es la única forma de que
// esos números signifiquen algo.
//
// El LISTADO, en cambio, se corta: nadie mira más de los próximos cincuenta vencimientos.

export const dynamic = 'force-dynamic'

const COLUMNAS = 'id,numero,importe,fecha_pago,fecha_emision,estado,tipo,librador,'
  + 'cuit_librador,banco,sucursal,cuenta,cmc7,id_echeq,archivo_url,notas,movimiento_id'

/** Cuántos vencimientos se listan. El resto se ve filtrando. */
const DEL_LISTADO = 50

/** Las solapas de arriba. La clave viaja en la URL. */
const FILTROS: Record<string, readonly Estado[]> = {
  cartera: ['en_cartera', 'depositado'],
  depositados: ['depositado'],
  rechazados: ['rechazado'],
  // "Todos" sale de ESTADOS y no de una lista escrita a mano: al agregar `incobrable` el
  // 27/11/2026 una lista aparte lo habría dejado invisible en la única solapa que promete
  // mostrarlo todo, sin que nada fallara.
  todos: ESTADOS,
}

export default async function ChequesPage({ searchParams }: {
  searchParams: { filtro?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profileData as { rol: string } | null)?.rol
  if (!esStaff(rol)) redirect('/dashboard')

  const filtro = searchParams.filtro && FILTROS[searchParams.filtro] ? searchParams.filtro : 'cartera'
  const hoy = hoyArgentina()

  // Se traen los que siguen vivos —cartera y rechazados—, que es de lo que se calculan
  // las cifras de arriba. Lo acreditado, endosado y devuelto no entra salvo que se pida
  // la solapa "todos": son historia y no cambian ninguna de las preguntas de hoy.
  const paraCifras: readonly Estado[] = ['en_cartera', 'depositado', 'rechazado']
  const estados = filtro === 'todos'
    ? FILTROS.todos
    : Array.from(new Set([...paraCifras, ...FILTROS[filtro]]))

  const PAGE = 1000
  const todos: Cheque[] = []
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await supabase.from('cheques')
      .select(COLUMNAS)
      .in('estado', estados as string[])
      .order('fecha_pago', { ascending: true })
      .range(desde, desde + PAGE - 1)
    // Sin la migración corrida la tabla no existe. Se avisa en pantalla en vez de
    // reventar: es exactamente lo que pasa en una instalación que todavía no la corrió.
    if (error) return <CarteraView sinTabla error={error.message} hoy={hoy} filtro={filtro}
      cheques={[]} resumen={null} concentracion={[]} tasa={null} total={0} />
    const filas = ((data ?? []) as unknown) as Cheque[]
    for (const c of filas) todos.push({ ...c, importe: Number(c.importe) || 0 })
    if (filas.length < PAGE) break
  }

  // Las cifras y la concentración salen SIEMPRE de la cartera activa, no de lo que
  // muestre la solapa elegida: cambiar de solapa no puede cambiar cuánto hay en cartera.
  const activosYRechazados = todos.filter(c => esActivo(c.estado) || c.estado === 'rechazado')
  const resumen = resumenCartera(activosYRechazados, hoy)
  const concentracion = concentracionPorLibrador(activosYRechazados)

  // A QUÉ TASA ESTÁ COLOCADA LA CARTERA.
  //
  // Lo que se pagó por un cheque no está en el cheque: está en la operación que lo trajo
  // (la columna PESOS de su movimiento), así que hay que ir a buscar esas operaciones. Se
  // piden solo las de los cheques que importan y de a 500 ids, que es lo que admite un
  // `in` sin que la URL se vuelva inmanejable.
  //
  // La tasa se calcula sobre la cartera ACTIVA, igual que la tarjeta "Total en cartera":
  // un rechazado ya no es plata colocada esperando cobro, es un problema, y mezclarlo
  // movería la tasa sin que nadie entienda por qué.
  const enCartera = activosYRechazados.filter(c => esActivo(c.estado))
  const idsOrigen = Array.from(new Set(enCartera.map(c => c.movimiento_id).filter(Boolean)))
  const origenes = new Map<string, Origen>()
  for (let i = 0; i < idsOrigen.length; i += 500) {
    const { data: movs } = await supabase
      .from('movimientos_caja').select('id,fecha,cheques,pesos')
      .in('id', idsOrigen.slice(i, i + 500))
    for (const m of ((movs ?? []) as unknown) as Origen[]) origenes.set(m.id, m)
  }
  const tasa = tasaDeCartera(enCartera, origenes, hoy)

  // El listado sí responde a la solapa.
  const permitidos = new Set(FILTROS[filtro])
  const lista = todos.filter(c => permitidos.has(c.estado))

  return (
    <CarteraView
      cheques={lista.slice(0, DEL_LISTADO)}
      total={lista.length}
      resumen={resumen}
      concentracion={concentracion}
      tasa={tasa}
      hoy={hoy}
      filtro={filtro}
    />
  )
}
