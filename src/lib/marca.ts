/**
 * Nombre con el que se presenta la aplicación.
 *
 * Estaba escrito a mano en cinco lugares (login, menú lateral, barra superior, título de
 * la pestaña y el mensaje de bienvenida a un usuario nuevo), así que cambiarlo obligaba a
 * buscarlos todos y alguno quedaba afuera. Ahora es una constante: se cambia acá y viaja
 * a todas las pantallas.
 *
 * Desde el 16/10/2026 el valor sale de la configuración por cliente —la variable de
 * entorno `NEXT_PUBLIC_APP_NOMBRE`— porque el producto se instala para varios clientes
 * desde el mismo repositorio y cada uno se llama distinto. Sin la variable queda el
 * nombre de siempre, así que los despliegues existentes no cambian.
 *
 * Se reexporta desde acá para no tocar los cinco lugares que ya la importan.
 */
export { APP_NOMBRE } from './configuracion'
