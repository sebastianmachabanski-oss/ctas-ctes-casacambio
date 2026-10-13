/**
 * Detección de un movimiento de CUENTA CORRIENTE cargado como CAJA por error.
 *
 * EL PROBLEMA (13/10/2026)
 * Cargar en CAJA lo que correspondía a una cuenta corriente deja la plata movida en la
 * oficina pero sin impactar en la posición del cliente. La diferencia es casi invisible:
 * los clientes que miran su cuenta la detectan, el resto no.
 *
 * POR QUÉ NO ALCANZA CON MIRAR EL NOMBRE
 * La primera idea fue avisar cada vez que el cliente de una fila de CAJA coincidiera con
 * una cuenta corriente. Los datos la desmintieron: en tres semanas hubo más de cien casos
 * y casi todos eran legítimos. Un cliente con cuenta corriente TAMBIÉN cambia plata por
 * ventanilla pagando efectivo, y eso es una COMPRA o una VENTA de caja como cualquier
 * otra. Un aviso que salta cien veces por mes se cierra sin leer y no protege nada.
 *
 * LA DISTINCIÓN QUE SÍ SIRVE ESTÁ EN LA OPERACIÓN
 *   COMPRA / VENTA     → hay un cambio en el mostrador. Normal, tenga cuenta o no.
 *   INGRESAN / EGRESAN → entra o sale plata SIN cambio. Para alguien que tiene cuenta
 *                        corriente, "trajo plata" o "se llevó plata" es exactamente un
 *                        movimiento de su cuenta. Ahí sí hay que preguntar.
 *
 * Y una excepción: las TRANSFERENCIAS (op = 'T') se cargan como INGRESAN/EGRESAN en CAJA
 * y están bien así. No se avisa sobre ellas.
 *
 * El aviso NO bloquea: hay casos legítimos (un retiro de efectivo puntual que el cliente
 * no quiere que pase por su cuenta). Pide una confirmación explícita, igual que el banner
 * de operación grande.
 */

/** Operaciones donde entra o sale plata sin que haya un cambio de monedas. */
const SIN_CAMBIO = ['INGRESAN', 'EGRESAN']

export type MovimientoAChequear = {
  tipo: string | null | undefined
  operacion: string | null | undefined
  /** Columna F: 'C' = operación común, 'T' = transferencia. */
  op: string | null | undefined
  cliente: string | null | undefined
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()

/**
 * ¿Este movimiento de CAJA parece ser en realidad de cuenta corriente?
 *
 * `cuentas` son los nombres de las cuentas corrientes ACTIVAS. La comparación es por
 * igualdad normalizada (sin espacios de sobra, sin distinguir mayúsculas) y no por
 * "contiene": con `contiene`, un cliente eventual llamado "MARCOS" dispararía el aviso
 * por una cuenta "MARCOS JONY", que es otra persona.
 */
export function pareceCuentaCorriente(mov: MovimientoAChequear, cuentas: string[]): boolean {
  if (norm(mov.tipo) !== 'CAJA') return false
  if (!SIN_CAMBIO.includes(norm(mov.operacion))) return false
  // Las transferencias viven en CAJA por diseño.
  if (norm(mov.op) === 'T') return false

  const nombre = norm(mov.cliente)
  if (!nombre) return false
  return cuentas.some(c => norm(c) === nombre)
}

/** Texto del aviso, compartido por el formulario y la respuesta del servidor. */
export function avisoCajaVsCtaCte(cliente: string): string {
  return `"${cliente.trim()}" tiene cuenta corriente, y este movimiento entra o saca plata sin que haya un cambio. `
       + `Cargado como CAJA, el dinero se mueve en la oficina pero NO impacta en el saldo del cliente. `
       + `Si corresponde a su cuenta, cambiá el tipo a CTA CTE.`
}
