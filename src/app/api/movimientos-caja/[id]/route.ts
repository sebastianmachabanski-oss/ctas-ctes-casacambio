import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularMovimiento, validarOperacion, MotorCalculoError } from '@/lib/motor-calculo'
import { getGoogleToken } from '@/lib/google'

// Edita un movimiento de caja. NO escribe en el Google Sheet (decisión 5/7/2026):
// mientras dure la convivencia, el próximo sync pisa estos cambios — comportamiento
// asumido y avisado en la pantalla. Las 10 columnas calculadas se recalculan con el
// motor de la app (validado al 100% contra la planilla, ver docs/MOTOR-CALCULO.md).

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  const rol = (profile as any)?.rol
  // Editar es exclusivo del superusuario (el operador solo visualiza).
  if (rol !== 'superusuario')
    return NextResponse.json({ error: 'Solo el superusuario puede editar transacciones' }, { status: 403 })

  const body = await request.json()
  const { fecha, cliente, operacion, propio, externo, monto, cot, costo_pct, debe, notas } = body

  if (!fecha || !operacion || !propio || monto == null || isNaN(Number(monto)))
    return NextResponse.json({ error: 'Faltan campos requeridos (fecha, operación, moneda, monto)' }, { status: 400 })

  // La fila original define el tipo (CAJA / CTA CTE) — eso no se edita.
  const { data: original, error: getError } = await supabase
    .from('movimientos_caja').select('tipo').eq('id', params.id).single()
  if (getError || !original)
    return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })

  const datos = {
    tipo: (original as any).tipo as 'CAJA' | 'CTA CTE',
    operacion: String(operacion),
    propio: String(propio),
    externo: String(externo ?? ''),
    monto: Number(monto),
    cotizacion: cot != null && cot !== '' ? Number(cot) : null,
    costoPorcentaje: costo_pct != null && costo_pct !== '' ? Number(costo_pct) : null,
  }

  const errorNegocio = validarOperacion({ operacion: datos.operacion, propio: datos.propio })
  if (errorNegocio) return NextResponse.json({ error: errorNegocio }, { status: 400 })

  let resultado
  try {
    resultado = calcularMovimiento(datos)
  } catch (e: any) {
    const msg = e instanceof MotorCalculoError ? e.message : 'No se pudo calcular el movimiento'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const v = resultado.valores
  const { error: updError } = await supabase.from('movimientos_caja').update({
    fecha,
    cliente: cliente?.trim() || null,
    operacion: datos.operacion.trim().toUpperCase(),
    propio: datos.propio.trim().toUpperCase(),
    externo: datos.externo.trim().toUpperCase() || null,
    monto: datos.monto,
    cot: datos.cotizacion,
    cot_efectiva: datos.cotizacion ?? 1,
    costo_pct: datos.costoPorcentaje,
    debe: debe?.trim() || null,
    notas: notas?.trim() || null,
    cuenta: resultado.cuenta,
    pesos: v.PESOS, cheques: v.CHEQUES, dolares: v.DOLARES, euros: v.EUROS, reales: v.REALES,
    banco: v.BANCO, cc_pesos: v['CC PESOS'], cc_dolares: v['CC DOLARES'],
    cc_euros: v['CC EUROS'], cc_reales: v['CC REALES'],
    editado_por: (profile as any)?.nombre ?? user.email ?? 'app',
    editado_at: new Date().toISOString(),
  }).eq('id', params.id)

  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })
  return NextResponse.json({ ok: true, cuenta: resultado.cuenta, valores: v })
}

// ─────────────────────────────────────────────────────────────────────────
// Borrado ESPEJADO (decisión 11/7/2026): al eliminar un movimiento desde la app,
// también se limpia su fila en la planilla — se devuelve al estado pre-armado
// ("OPERACION?" con sus fórmulas intactas), el inverso exacto de excel-write.
//
// Seguridad ante todo: la fila se identifica por CONTENIDO (fecha + cliente +
// operación + monto + cot) y solo se limpia si hay EXACTAMENTE UNA coincidencia.
// Con cero o varias, el movimiento se borra igual de la base pero la planilla no
// se toca y se avisa para borrarla a mano — nunca se arriesga la fuente de verdad.
//
// Cuando la planilla se retire, este bloque se elimina junto con excel-write y el sync.
// ─────────────────────────────────────────────────────────────────────────

const SHEET_ID     = '1BxW5TGUbi12LHATOIjnkBc71GY9JZARsy5_LP5Sl1CE'
const SHEET_NAME   = 'CAJA'
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
// Mismo conmutador que excel-write: la limpieza espejada existe solo en el camino 'sheets'.
const WRITE_SOURCE: 'excel' | 'sheets' = process.env.WRITE_SOURCE === 'sheets' ? 'sheets' : 'excel'

function colLetter(index0: number): string {
  let n = index0 + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Número en formato de la planilla ("3.209", "1.235,50", "  749  ") → number.
function numCelda(val: any): number | null {
  const s = String(val ?? '').trim().replace(/\s/g, '')
  if (!s) return null
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\./g, '')
  const n = Number(norm)
  return isFinite(n) ? n : null
}

// Fecha de la planilla ("19/2/2025" o "19/02/2025") → ISO.
function fechaCelda(val: any): string | null {
  const m = String(val ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

async function sheetsFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`)
  return res.json()
}

type Estado = 'ok' | 'no_encontrada' | 'multiple'

async function limpiarFilaPlanilla(mov: {
  fecha: string; tipo: string; cliente: string | null; operacion: string
  monto: number; cot: number | null
}): Promise<{ estado: Estado; fila?: number; candidatas?: number }> {
  const token = await getGoogleToken(SHEETS_SCOPE)

  // Encabezados (misma detección que excel-write).
  const headData = await sheetsFetch(token, `/values/${encodeURIComponent(`${SHEET_NAME}!A1:Z15`)}`)
  const headRows: any[][] = headData.values ?? []
  let headerRow = -1
  let headers: string[] = []
  for (let i = 0; i < headRows.length; i++) {
    const cells = (headRows[i] ?? []).map((c: any) => String(c || '').trim().toUpperCase())
    if (cells.includes('FECHA')) { headerRow = i + 1; headers = cells; break }
  }
  if (headerRow < 0) throw new Error('No se encontró la fila de encabezados (FECHA) en la planilla')

  const find = (name: string) => headers.findIndex(h => h === name)
  const findContains = (name: string) => headers.findIndex(h => h.includes(name))
  const iFecha = find('FECHA'), iCliente = find('CLIENTE'), iOp = find('OP'), iCaja = find('CAJA')
  const iOperacion = findContains('OPERACI'), iPropio = find('PROPIO'), iExterno = find('EXTERNO')
  const iMonto = find('MONTO'), iCot = find('COT'), iCostoPct = findContains('COSTO')
  const iDebe = find('DEBE'), iNotas = find('NOTAS')
  for (const [n, idx] of Object.entries({ FECHA: iFecha, CLIENTE: iCliente, CAJA: iCaja, OPERACIÓN: iOperacion, MONTO: iMonto })) {
    if (idx < 0) throw new Error(`No se encontró la columna "${n}" en la planilla`)
  }

  // Columnas de búsqueda en una sola llamada (batchGet, liviano).
  const colsBusqueda = [iFecha, iCliente, iCaja, iOperacion, iMonto, iCot]
  const ranges = colsBusqueda
    .map(i => `ranges=${encodeURIComponent(`${SHEET_NAME}!${colLetter(i)}:${colLetter(i)}`)}`)
    .join('&')
  const batch = await sheetsFetch(token, `/values:batchGet?${ranges}`)
  const [vFecha, vCliente, vCaja, vOperacion, vMonto, vCot] =
    (batch.valueRanges ?? []).map((r: any) => (r.values ?? []).map((row: any[]) => row?.[0]))

  // La fila del sheet es tipo CAJA (CLIENTE = nombre) o CTA CTE (CLIENTE = 'CTA CTE',
  // CAJA = nombre) según el tipo del movimiento — el mismo criterio del parser del sync.
  const esCtaCte = mov.tipo === 'CTA CTE'
  const nombre = (mov.cliente ?? '').trim().toUpperCase()
  const maxLen = Math.max(vFecha?.length ?? 0, vOperacion?.length ?? 0)
  const candidatas: number[] = []
  for (let i = headerRow; i < maxLen; i++) { // arranca después del encabezado
    if (String(vOperacion?.[i] ?? '').trim().toUpperCase() !== mov.operacion.trim().toUpperCase()) continue
    if (fechaCelda(vFecha?.[i]) !== mov.fecha) continue
    const cli = String(vCliente?.[i] ?? '').trim().toUpperCase()
    const caja = String(vCaja?.[i] ?? '').trim().toUpperCase()
    if (esCtaCte ? (cli !== 'CTA CTE' || caja !== nombre) : (cli !== nombre)) continue
    const m = numCelda(vMonto?.[i])
    if (m === null || Math.abs(m - mov.monto) > 0.005) continue
    if (mov.cot != null) {
      const c = numCelda(vCot?.[i])
      if (c === null || Math.abs(c - Number(mov.cot)) > 0.0001) continue
    }
    candidatas.push(i + 1) // número de fila 1-indexado
  }

  if (candidatas.length === 0) return { estado: 'no_encontrada' }
  if (candidatas.length > 1) return { estado: 'multiple', candidatas: candidatas.length }

  const fila = candidatas[0]

  // Restauración por COPIA (pedido 11/7/2026): se copia ENTERA la primera fila pre-armada
  // ("OPERACION?") sobre la fila borrada — fórmulas y validaciones incluidas, con las
  // referencias ajustadas a la fila destino (igual que copiar y pegar a mano). Así la
  // fila vuelve a tener la lógica EXACTA de la planilla, no solo celdas vacías.
  let filaModelo = -1
  for (let i = headerRow; i < (vOperacion?.length ?? 0); i++) {
    if (String(vOperacion?.[i] ?? '').trim().toUpperCase() === 'OPERACION?') { filaModelo = i + 1; break }
  }
  if (filaModelo > 0 && filaModelo !== fila) {
    const meta = await sheetsFetch(token, '?fields=sheets.properties')
    const prop = ((meta.sheets ?? []) as any[]).map(s => s.properties).find(p => p?.title === SHEET_NAME)
    if (!prop) throw new Error(`No se encontró la pestaña "${SHEET_NAME}"`)
    await sheetsFetch(token, ':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          copyPaste: {
            // Sin límites de columna = la fila completa, de punta a punta.
            source: { sheetId: prop.sheetId, startRowIndex: filaModelo - 1, endRowIndex: filaModelo },
            destination: { sheetId: prop.sheetId, startRowIndex: fila - 1, endRowIndex: fila },
            pasteType: 'PASTE_NORMAL',
            pasteOrientation: 'NORMAL',
          },
        }],
      }),
    })
    return { estado: 'ok', fila }
  }

  // Plan B (no hay ninguna fila pre-armada para copiar): limpiar solo las columnas de
  // ENTRADA y volver a marcar OPERACION?, dejando las fórmulas de la fila como están.
  const inputIdx = [iFecha, iCliente, iOp, iCaja, iOperacion, iPropio, iExterno, iMonto, iCot, iCostoPct, iDebe, iNotas]
    .filter(i => i >= 0)
  const startCol = Math.min(...inputIdx)
  const endCol = Math.max(...inputIdx)
  const row = new Array(endCol - startCol + 1).fill('')
  row[iOperacion - startCol] = 'OPERACION?'
  const range = `${SHEET_NAME}!${colLetter(startCol)}${fila}:${colLetter(endCol)}${fila}`
  await sheetsFetch(token, `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ range, values: [row] }),
  })
  return { estado: 'ok', fila }
}

// Elimina un movimiento de caja del sistema y limpia su fila en la planilla (si se la
// puede identificar sin ambigüedad — ver arriba).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if ((profile as any)?.rol !== 'superusuario')
    return NextResponse.json({ error: 'Solo el superusuario puede eliminar transacciones' }, { status: 403 })

  // Los datos del movimiento se leen ANTES de borrarlo (sirven para ubicar la fila allá).
  const { data: movData, error: getError } = await supabase.from('movimientos_caja')
    .select('fecha, tipo, cliente, operacion, monto, cot')
    .eq('id', params.id).single()
  if (getError || !movData)
    return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })
  const mov = movData as any

  const { error, count } = await supabase.from('movimientos_caja')
    .delete({ count: 'exact' })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // count 0 = la RLS lo impidió (falta la policy de DELETE).
  if (!count) return NextResponse.json({ error: 'No se pudo eliminar (¿falta la policy de DELETE?)' }, { status: 404 })

  // Limpieza espejada en la planilla (best effort: si falla, el movimiento ya salió del
  // sistema y se informa para borrarlo a mano allá).
  if (WRITE_SOURCE !== 'sheets') {
    return NextResponse.json({ ok: true, planilla: 'deshabilitado' })
  }
  try {
    const r = await limpiarFilaPlanilla({
      fecha: mov.fecha, tipo: mov.tipo, cliente: mov.cliente,
      operacion: mov.operacion, monto: Number(mov.monto),
      cot: mov.cot != null ? Number(mov.cot) : null,
    })
    return NextResponse.json({ ok: true, planilla: r.estado, fila: r.fila, candidatas: r.candidatas })
  } catch (e: any) {
    return NextResponse.json({ ok: true, planilla: 'error', warning: e.message })
  }
}
