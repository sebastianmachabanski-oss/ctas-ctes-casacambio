import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularMovimiento } from '@/lib/motor-calculo'
import { registrarAuditoria, calcularHuella, describirMovimiento } from '@/lib/auditoria'
import { esStaff } from '@/lib/roles'
import {
  armarTransferencia, validarTransferencia, gananciaNegativa, gananciaDe,
  type EntradaTransferencia,
} from '@/lib/transferencia'

export const maxDuration = 30

/**
 * Alta de una transferencia COMPLETA: las dos patas en una sola operación.
 *
 * POR QUÉ UN ENDPOINT PROPIO Y NO EL DE TRANSACCIONES
 * Una transferencia no es un movimiento con un campo distinto: son dos movimientos que
 * solo tienen sentido juntos. Cargar uno sin el otro es exactamente el problema que esto
 * viene a eliminar, así que la API no ofrece la forma de hacerlo.
 *
 * LA ATOMICIDAD ES EL PUNTO
 * Las dos filas se insertan con UNA sola sentencia (`insert([a, b])`). Postgres ejecuta un
 * insert de varias filas como una unidad: si una falla, no entra ninguna. No hace falta
 * una función en la base ni una transacción explícita — y, sobre todo, no existe el estado
 * intermedio de "una pata guardada y la otra no".
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rol = (profile as any).rol
  if (!esStaff(rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  const entrada: EntradaTransferencia = {
    fecha: body.fecha,
    referencia: body.referencia,
    moneda: body.moneda,
    entra: { participante: body.entra?.participante, monto: Number(body.entra?.monto) },
    sale:  { participante: body.sale?.participante,  monto: Number(body.sale?.monto) },
  }

  // Las mismas reglas que aplica el formulario, de nuevo acá: el navegador no defiende nada.
  const problema = validarTransferencia(entrada)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  // El egreso no debería superar al ingreso ("si no, no hay negocio"). No se bloquea
  // —puede haber una excepción— pero se exige decirlo explícitamente.
  if (gananciaNegativa(entrada) && !body.confirmo_perdida) {
    return NextResponse.json({
      error: 'En esta transferencia sale más de lo que entra. Revisá los importes; si es correcto, confirmalo.',
      requiere: 'confirmo_perdida',
    }, { status: 409 })
  }

  const { patas } = armarTransferencia(entrada)
  const referencia = String(entrada.referencia).trim()
  const autor = (profile as any).nombre ?? user.email
  const ahora = new Date().toISOString()

  // El impacto en caja lo calcula SIEMPRE el motor, nunca se escribe a mano: hacerlo a
  // mano ya produjo un signo invertido (1/9/2026).
  const filas = patas.map(p => {
    const impacto = calcularMovimiento({
      tipo: p.tipo, operacion: p.operacion, propio: p.propio, externo: p.externo,
      monto: p.monto, cotizacion: null, costoPorcentaje: null,
    })
    return {
      fila_sheet: null,
      origen: 'app',
      // Marcador de transferencia. Es lo que hace que Ganancias la mida con su propia
      // regla (lo que entra menos lo que sale) en vez de con el calce de compras y ventas.
      op: 'T',
      fecha: entrada.fecha,
      tipo: p.tipo,
      cliente: p.cliente,
      operacion: p.operacion,
      propio: p.propio,
      externo: p.externo,
      monto: p.monto,
      cot: null,
      cot_efectiva: 1,
      costo_pct: null,
      debe: null,
      // LA MISMA referencia en las dos patas, escrita una sola vez. Es lo que las vincula,
      // y copiarla acá en vez de tipearla dos veces elimina de raíz la posibilidad de que
      // salgan distintas y la transferencia nunca se parée.
      notas: referencia,
      cuenta: impacto.cuenta,
      creado_por: autor,
      creado_at: ahora,
      ...Object.fromEntries(
        Object.entries(impacto.valores).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), v])
      ),
    }
  })

  // UNA sola sentencia con las dos filas: entran las dos o no entra ninguna.
  const { error } = await supabase.from('movimientos_caja').insert(filas)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auditoría: un evento por pata, anclado por huella igual que el alta común.
  for (const f of filas) {
    const foto = {
      fecha: f.fecha, tipo: f.tipo, cliente: f.cliente, operacion: f.operacion,
      propio: f.propio, externo: f.externo, monto: f.monto, cot: null,
      costo_pct: null, debe: null, notas: f.notas, cuenta: f.cuenta,
    }
    await registrarAuditoria(supabase, {
      accion: 'alta',
      usuarioId: user.id,
      usuarioNombre: autor ?? 'app',
      usuarioRol: rol,
      huella: calcularHuella(foto),
      resumen: `Transferencia ${referencia} · ${describirMovimiento(foto)}`,
      datosDespues: foto,
    })
  }

  return NextResponse.json({ success: true, ganancia: gananciaDe(entrada), referencia })
}
