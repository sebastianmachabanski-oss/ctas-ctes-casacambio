// Registro de auditoría: quién hizo qué y cuándo.
//
// Diseño (ver migrations/2026-07-29_auditoria.sql): el log vive en su propia tabla
// porque el sync full borra y reinserta movimientos_caja a diario, regenerando los
// uuid. Cada evento es autocontenido y se ancla al movimiento por `huella` de
// contenido, que sí sobrevive a las corridas del sync.
//
// Regla de oro: NUNCA atribuirle a una persona algo que no hizo. Las filas que vienen
// de la planilla se registran con actor 'sistema' y la leyenda de carga inicial.

/**
 * Leyenda de las filas que no cargó ningún usuario en la app: llegaron por la
 * importación inicial de datos. Se muestra tal cual en la pantalla de Transacciones.
 */
export const AUTOR_PLANILLA = 'Carga inicial'

export type AccionAuditoria =
  | 'alta' | 'edicion' | 'borrado' | 'ingreso_calle'
  | 'login' | 'login_fallido' | 'usuario' | 'config'

/** Campos que identifican un movimiento por contenido. */
type CamposHuella = {
  fecha?: string | null
  cliente?: string | null
  operacion?: string | null
  propio?: string | null
  externo?: string | null
  monto?: number | string | null
  cot?: number | string | null
}

/**
 * Huella de contenido de un movimiento. Es la identificación DURADERA: el uuid de
 * movimientos_caja se regenera en cada sync full, la huella no.
 *
 * Mismo criterio que usa el borrado espejado para ubicar la fila en la planilla.
 * Se guarda en texto plano (no hash) a propósito: si algún día una huella no matchea,
 * se puede ver a simple vista por qué.
 */
export function calcularHuella(m: CamposHuella): string {
  const num = (v: number | string | null | undefined, dec: number) =>
    v === null || v === undefined || v === '' ? '' : Number(v).toFixed(dec)
  const txt = (v: string | null | undefined) => (v ?? '').trim().toUpperCase()
  return [
    (m.fecha ?? '').slice(0, 10),
    txt(m.cliente),
    txt(m.operacion),
    txt(m.propio),
    txt(m.externo),
    num(m.monto, 2),
    num(m.cot, 6),
  ].join('|')
}

/** Campos del movimiento que tiene sentido auditar (se ignoran los calculados y los internos). */
const CAMPOS_AUDITABLES = [
  'fecha', 'cliente', 'operacion', 'propio', 'externo',
  'monto', 'cot', 'costo_pct', 'debe', 'notas', 'tipo', 'cuenta',
] as const

/** Se queda solo con los campos auditables, para que el jsonb no guarde ruido. */
export function fotoMovimiento(m: any): Record<string, any> | null {
  if (!m) return null
  const foto: Record<string, any> = {}
  for (const c of CAMPOS_AUDITABLES) if (m[c] !== undefined) foto[c] = m[c]
  return foto
}

/** Devuelve los campos cuyo valor cambió entre dos fotos (comparación laxa: 5 == '5'). */
export function camposCambiados(antes: any, despues: any): string[] {
  if (!antes || !despues) return []
  return CAMPOS_AUDITABLES.filter(c => {
    if (!(c in antes) && !(c in despues)) return false
    const a = antes[c] ?? null
    const b = despues[c] ?? null
    if (a === null && b === null) return false
    if (typeof a === 'number' || typeof b === 'number') return Number(a) !== Number(b)
    return String(a ?? '') !== String(b ?? '')
  })
}

type Evento = {
  accion: AccionAuditoria
  usuarioId?: string | null
  usuarioNombre: string
  usuarioRol?: string | null
  actor?: 'usuario' | 'sistema'
  entidad?: string
  movimientoId?: string | null
  huella?: string | null
  resumen?: string | null
  campos?: string[] | null
  datosAntes?: any
  datosDespues?: any
}

/**
 * Escribe un evento en la auditoría.
 *
 * TOLERANTE A FALLOS A PROPÓSITO: si el log falla, la operación de negocio (que ya se
 * ejecutó) no debe romperse por eso. Se registra en consola para no perder la señal.
 * Nunca lanza.
 */
export async function registrarAuditoria(supabase: any, ev: Evento): Promise<void> {
  try {
    const { error } = await supabase.from('auditoria').insert({
      usuario_id:     ev.usuarioId ?? null,
      usuario_nombre: ev.usuarioNombre,
      usuario_rol:    ev.usuarioRol ?? null,
      actor:          ev.actor ?? 'usuario',
      accion:         ev.accion,
      entidad:        ev.entidad ?? 'movimientos_caja',
      movimiento_id:  ev.movimientoId ?? null,
      huella:         ev.huella ?? null,
      resumen:        ev.resumen ?? null,
      campos:         ev.campos?.length ? ev.campos : null,
      datos_antes:    ev.datosAntes ?? null,
      datos_despues:  ev.datosDespues ?? null,
    })
    if (error) console.error('[auditoria] no se pudo registrar:', error.message, ev.accion)
  } catch (e: any) {
    console.error('[auditoria] excepción al registrar:', e?.message, ev.accion)
  }
}

/** Texto legible de un movimiento, para la columna `resumen` del log. */
export function describirMovimiento(m: any): string {
  const partes = [
    m?.operacion,
    m?.propio,
    m?.externo ? `/ ${m.externo}` : null,
    m?.monto !== undefined && m?.monto !== null
      ? Number(m.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })
      : null,
    m?.cliente ? `— ${m.cliente}` : null,
  ].filter(Boolean)
  return partes.join(' ')
}
