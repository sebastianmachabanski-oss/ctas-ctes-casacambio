/**
 * El elenco ficticio de la demostración, en un solo lugar.
 *
 * POR QUÉ ESTÁ APARTE
 * Tres scripts necesitan estos nombres: el que carga las operaciones, el que crea el
 * usuario del cliente y el que llena el registro de auditoría. Repetidos, se desincronizan
 * —se agrega una cuenta en uno y los otros siguen con la lista vieja— y el que sufre es el
 * guardián: `pareceBaseDeDemo()` empieza a dar falsos negativos y bloquea una base que sí
 * era de demo.
 *
 * Y sobre todo: estos nombres son LA GUARDA. Un script que escribe datos falsos no puede
 * confiar en una bandera de línea de comandos como única defensa —se tipea distraído—, así
 * que además comprueba que la base contenga este elenco y nada más. Una base de un cliente
 * real no tiene a "ACME CAMBIOS", así que la comprobación no se puede pasar por error.
 */

/** Cuentas corrientes de fantasía. A propósito poco creíbles como clientes reales. */
export const CUENTAS = [
  'ACME CAMBIOS', 'BOREAL SRL', 'CITRUS IMPORT', 'DELTA VIAJES',
  'ESTUDIO NORTE', 'FARO LOGISTICA', 'GRANADA TEXTIL', 'HORIZONTE SA',
]

/** Clientes de mostrador, sin cuenta corriente. */
export const EVENTUALES = [
  'J. MARTINEZ', 'L. ROSSI', 'P. ALVAREZ', 'R. SUAREZ', 'M. BENITEZ',
  'C. DOMINGUEZ', 'A. FERRARI', 'S. NAVARRO', 'T. ORTEGA', 'V. QUIROGA',
]

export const REPARTIDORES = ['RUTA 1', 'RUTA 2', 'MOTO CENTRO']
export const CONTRAPARTES_TT = ['ACME - BOREAL', 'CITRUS - DELTA', 'FARO - HORIZONTE']
export const CONCEPTOS_GASTO = ['ALQUILER', 'SUELDOS', 'SERVICIOS', 'LIMPIEZA', 'SEGURIDAD']

/** Operadores ficticios, para que el registro de auditoría no sea de una sola persona. */
export const OPERADORES = [
  { nombre: 'Lucía Fernández', rol: 'operador' },
  { nombre: 'Martín Paz',      rol: 'operador' },
  { nombre: 'Ana Ortiz',       rol: 'administrador' },
]

/**
 * ¿Las cuentas corrientes de esta base son las del elenco ficticio?
 *
 * Devuelve el motivo del rechazo, o `null` si la base es de demostración. Se pide la lista
 * de cuentas ya leída para que el llamador decida cómo consultarla (y para poder probar
 * esta función sin una base).
 *
 * Criterio: TODAS las cuentas tienen que ser del elenco. Alcanza con una desconocida para
 * rechazar — podría ser una cuenta real, y en la duda no se escribe. Una base sin ninguna
 * cuenta también se rechaza: o no se sembró, o no es la que se cree.
 */
export function pareceBaseDeDemo(cuentasEnLaBase: string[]): string | null {
  // `Array.from` y no `[...]`: el tsconfig del proyecto apunta a una versión que no
  // permite recorrer un Set con el operador de propagación, y `scripts/` entra en el
  // chequeo de tipos del build. Con el spread, el despliegue falla.
  const unicas = Array.from(new Set(cuentasEnLaBase.map(c => (c ?? '').trim().toUpperCase()).filter(Boolean)))
  if (unicas.length === 0) {
    return 'la base no tiene ninguna cuenta corriente cargada: ¿corriste scripts/sembrar-demo.mts?'
  }
  const conocidas = new Set(CUENTAS.map(c => c.toUpperCase()))
  const ajenas = unicas.filter(c => !conocidas.has(c))
  if (ajenas.length) {
    return `la base tiene cuentas que NO son del elenco ficticio: ${ajenas.slice(0, 5).join(', ')}`
      + `${ajenas.length > 5 ? ` y ${ajenas.length - 5} más` : ''}.\n`
      + '   Esto parece una base con datos reales. No se escribe nada.'
  }
  return null
}
