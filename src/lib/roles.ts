/**
 * Modelo de roles — la ÚNICA definición de quién puede hacer qué en la app.
 *
 * Antes esto vivía repartido en ~25 archivos con comparaciones literales de string
 * (`rol === 'superusuario'`) más una columna booleana suelta para Ganancias. Dos fuentes
 * de verdad y veinte lugares donde olvidarse de mirar una de ellas: por ahí se coló que
 * un administrador pudiera darse a sí mismo acceso a Ganancias.
 *
 * Regla: NINGÚN archivo compara roles a mano. Todos preguntan por uno de estos predicados.
 * Del lado de la base hay funciones espejo (`es_admin()`, `es_staff()`, `ve_ganancias()`)
 * que usan las policies de RLS — ver migrations/2026-08-11_roles.sql.
 */

export const ROLES = ['superadmin', 'administrador', 'operador', 'cliente'] as const
export type Rol = typeof ROLES[number]

/** Nombre visible del rol. */
export const ROL_LABEL: Record<Rol, string> = {
  superadmin:    'Superadmin',
  administrador: 'Administrador',
  operador:      'Operador',
  cliente:       'Cliente',
}

/** Qué alcanza cada rol, en una línea. Se muestra en la pantalla de Usuarios. */
export const ROL_DESCRIPCION: Record<Rol, string> = {
  superadmin:    'Acceso total, incluido el módulo de Ganancias.',
  administrador: 'Acceso total excepto Ganancias.',
  operador:      'Carga y consulta transacciones y cuentas corrientes. No edita ni borra.',
  cliente:       'Solo su cuenta corriente y su contraseña.',
}

// Alias transitorio: entre que se publica esta versión y que se corre la migración de
// roles, la base todavía dice 'superusuario'. Sin esto nadie podría entrar en esos
// minutos. Se comporta como administrador (sin Ganancias) — fail-closed. Se puede
// eliminar una vez corrida la migración.
const LEGACY_ADMIN = 'superusuario'

const norm = (rol: string | null | undefined): Rol | null => {
  if (rol === LEGACY_ADMIN) return 'administrador'
  return (ROLES as readonly string[]).includes(rol ?? '') ? (rol as Rol) : null
}

/** Personal interno: operador, administrador o superadmin. Todo menos los clientes. */
export function esStaff(rol: string | null | undefined): boolean {
  const r = norm(rol)
  return r === 'operador' || r === 'administrador' || r === 'superadmin'
}

/**
 * Acceso total: administrador o superadmin.
 * Incluye administrar usuarios, editar y borrar transacciones, sincronizar y auditar.
 */
export function esAdmin(rol: string | null | undefined): boolean {
  const r = norm(rol)
  return r === 'administrador' || r === 'superadmin'
}

/** El módulo de Ganancias es del dueño del negocio: solo superadmin. */
export function veGanancias(rol: string | null | undefined): boolean {
  return norm(rol) === 'superadmin'
}

/** Un cliente solo ve su propia cuenta corriente. */
export function esCliente(rol: string | null | undefined): boolean {
  return norm(rol) === 'cliente'
}

/**
 * Quién puede asignar cada rol. Nadie otorga un nivel al que no llega: un administrador
 * no puede crear ni promover a un superadmin, porque si pudiera se daría acceso a
 * Ganancias por vía indirecta creándose una segunda cuenta.
 */
export function puedeAsignarRol(rolDelQueEdita: string | null | undefined, rolDestino: string): boolean {
  if (!esAdmin(rolDelQueEdita)) return false
  if (rolDestino === 'superadmin') return veGanancias(rolDelQueEdita)
  return (ROLES as readonly string[]).includes(rolDestino)
}

/**
 * Quién puede administrar la cuenta de quién (editar, desactivar, resetear la clave,
 * borrar). Un administrador no puede tocar la cuenta de un superadmin: si pudiera, le
 * bastaría con resetearle la contraseña —que queda en la inicial conocida— y entrar
 * como él. Sin esta regla, cualquier otra restricción sobre Ganancias es decorativa.
 */
export function puedeAdministrarA(rolDelQueEdita: string | null | undefined, rolObjetivo: string | null | undefined): boolean {
  if (!esAdmin(rolDelQueEdita)) return false
  if (norm(rolObjetivo) === 'superadmin') return veGanancias(rolDelQueEdita)
  return true
}
