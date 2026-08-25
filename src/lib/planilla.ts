/**
 * Menciones a la planilla externa dentro de la interfaz.
 *
 * Mientras la planilla fue la fuente de verdad, la app avisaba de los efectos de esa
 * convivencia, porque eran reales y el operador los sufría:
 *   - una edición hecha en la app la pisa la próxima sincronización;
 *   - un borrado hay que replicarlo allá;
 *   - marcar un ingreso de calle no limpia el DEBE del otro lado.
 *
 * Desde el 25/8/2026 esos avisos están APAGADOS por pedido del cliente: la app se
 * presenta como el único sistema y no menciona la planilla en ninguna pantalla.
 *
 * Ojo con lo que este interruptor NO hace: la sincronización, `excel-write` y el borrado
 * espejado siguen funcionando exactamente igual por detrás. Esto es solo lo que se ve.
 * El apagado real del circuito es un trabajo aparte.
 *
 * Para volver a mostrar los avisos —si la convivencia con la planilla se reanuda— se
 * define la variable de entorno en Netlify:
 *
 *     NEXT_PUBLIC_PLANILLA_ACTIVA=true
 *
 * y reaparecen todos, sin tocar una línea de código.
 */
export const PLANILLA_ACTIVA = process.env.NEXT_PUBLIC_PLANILLA_ACTIVA === 'true'
