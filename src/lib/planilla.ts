/**
 * Convivencia con la planilla externa.
 *
 * Mientras la planilla siga siendo la fuente de verdad, la app tiene que avisar de los
 * efectos de esa convivencia, porque son reales y el operador los sufre:
 *   - una edición hecha en la app la pisa la próxima sincronización;
 *   - un borrado hay que replicarlo allá;
 *   - marcar un ingreso de calle no limpia el DEBE del otro lado.
 *
 * Esos avisos NO son decorativos: sin ellos el usuario ve cambios que se revierten
 * solos y no entiende por qué.
 *
 * El día que se retire la planilla, se define la variable de entorno
 *
 *     NEXT_PUBLIC_PLANILLA_ACTIVA=false
 *
 * y todos esos avisos desaparecen de la interfaz sin tocar una línea de código. En ese
 * momento también dejan de tener sentido el sync, `excel-write` y el borrado espejado,
 * que se eliminan por separado.
 *
 * Default: activa (el comportamiento de hoy).
 */
export const PLANILLA_ACTIVA = process.env.NEXT_PUBLIC_PLANILLA_ACTIVA !== 'false'
