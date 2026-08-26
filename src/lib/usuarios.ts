/**
 * Nombre de usuario ↔ dirección de acceso.
 *
 * Supabase Auth identifica a cada persona por una dirección de correo: es la forma en
 * que se entra con contraseña y no es opcional. Pero acá nadie usa esa dirección para
 * recibir nada —no se manda un solo correo— y obligar a inventar una era una molestia
 * sin sentido (26/8/2026).
 *
 * Entonces: el administrador escribe un NOMBRE DE USUARIO libre ("jperez") y el sistema
 * le agrega por dentro un dominio que nunca se muestra. Si escribe algo que ya es una
 * dirección de correo, se respeta tal cual: quien prefiera usar su mail real, puede.
 *
 * Los usuarios anteriores quedaron con "@casadecambio.com". Siguen entrando igual, y
 * además ya les alcanza con el nombre solo: `candidatosEmail` prueba los dos dominios.
 * Por eso no hace falta tocar ni una fila de la base.
 */

// Dominio interno de los usuarios nuevos. No existe ni recibe correo: es solo la forma
// que Supabase Auth exige para identificar la cuenta.
export const DOMINIO_INTERNO = 'micuentacorriente.local'

// El histórico va después: los usuarios creados antes del 26/8/2026 lo tienen.
const DOMINIOS_INTERNOS = [DOMINIO_INTERNO, 'casadecambio.com']

/** ¿Lo que se escribió ya es una dirección de correo? */
export function esCorreo(entrada: string): boolean {
  return entrada.includes('@')
}

/** Nombre de usuario → dirección con la que se guarda la cuenta. */
export function aEmail(entrada: string, dominio = DOMINIO_INTERNO): string {
  const v = entrada.trim().toLowerCase()
  return esCorreo(v) ? v : `${v}@${dominio}`
}

/**
 * Dirección guardada → lo que se muestra en pantalla.
 * Los dominios internos se esconden; un correo real se muestra entero.
 */
export function aUsuario(email: string | null | undefined): string {
  const v = (email ?? '').trim()
  const dom = DOMINIOS_INTERNOS.find(d => v.toLowerCase().endsWith('@' + d))
  return dom ? v.slice(0, -(dom.length + 1)) : v
}

/**
 * Direcciones a probar al entrar, en orden.
 *
 * Con un correo completo hay una sola opción. Con un nombre suelto se prueba el dominio
 * nuevo y después el viejo, así el nombre solo alcanza tanto para los usuarios nuevos
 * como para los que ya estaban.
 */
export function candidatosEmail(entrada: string): string[] {
  const v = entrada.trim().toLowerCase()
  if (!v) return []
  if (esCorreo(v)) return [v]
  return DOMINIOS_INTERNOS.map(d => `${v}@${d}`)
}

/**
 * Sugerencia de nombre de usuario a partir del nombre completo: "Juan Pérez" → "juan.perez".
 * Es solo una propuesta — el campo queda editable.
 */
export function sugerirUsuario(nombre: string): string {
  return nombre.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    // "Ana M. Ñandú" dejaba "ana.m..nandu": el punto del nombre y el del espacio se suman.
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\-_]+|[.\-_]+$/g, '')
}
