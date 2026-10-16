/**
 * Configuración por cliente (16/10/2026).
 *
 * EL PROBLEMA QUE RESUELVE
 * El producto se instala para varios clientes desde UN SOLO repositorio: cada uno tiene
 * su sitio en Netlify y su base en Supabase, pero el código es el mismo. Sin un lugar
 * donde declarar las diferencias, la primera customización termina siendo un
 * `if (cliente === 'X')` desparramado por el código — un fork encubierto, con el costo de
 * mantener variantes y sin la libertad de tocarlas por separado.
 *
 * QUÉ VA ACÁ Y QUÉ NO
 *   Acá:            lo que se decide al INSTALAR y casi nunca cambia — la marca, qué
 *                   módulos ve el cliente. Son variables de entorno: están disponibles sin
 *                   ir a la base, que importa porque el menú se arma en cada pantalla.
 *   En `app_config`: lo que el cliente ajusta SOLO (umbral de alerta, paridad de la
 *                   libra). Se cambia sin desplegar.
 *
 * LA FORMA ES "QUÉ APAGO", NO "QUÉ PRENDO"
 * Casi todo el producto le sirve a cualquier casa de cambio. Si la lista fuera de módulos
 * habilitados, cada instalación nueva arrancaría con todo apagado y habría que acordarse
 * de prender; y peor, agregar un módulo al producto obligaría a tocar la configuración de
 * todos los clientes para que lo vean. Al revés, lo nuevo llega prendido y se apaga donde
 * no corresponda.
 *
 * CONSECUENCIA BUSCADA: una instalación sin ninguna variable definida se comporta
 * exactamente como hoy. Los despliegues existentes no necesitan tocar nada.
 */

/** Módulos que se pueden apagar por cliente. Los que no están acá son parte del núcleo. */
export const MODULOS = [
  'transferencias',  // alta de transferencias y su listado
  'gastos',
  'calle',           // dinero en la calle (repartidores)
  'posicion',        // posición consolidada de cuentas corrientes
  'ganancias',
  'auditoria',
] as const

export type Modulo = typeof MODULOS[number]

/**
 * Módulos apagados en esta instalación.
 *
 *     NEXT_PUBLIC_MODULOS_OFF=gastos,calle
 *
 * Los nombres que no correspondan a un módulo conocido se ignoran en silencio: un error
 * de tipeo en una variable de entorno no debería dejar la app sin arrancar, y el efecto
 * —que el módulo siga visible— se nota enseguida.
 */
const APAGADOS: ReadonlySet<string> = new Set(
  (process.env.NEXT_PUBLIC_MODULOS_OFF ?? '')
    .split(',')
    .map(m => m.trim().toLowerCase())
    .filter(Boolean),
)

/** ¿Este cliente ve el módulo? */
export function moduloActivo(m: Modulo): boolean {
  return !APAGADOS.has(m)
}

/**
 * Nombre con el que se presenta la aplicación.
 *
 *     NEXT_PUBLIC_APP_NOMBRE=Casa de Cambio Fulano
 *
 * Viaja a las cinco pantallas que lo muestran (login, menú, barra superior, título de la
 * pestaña y la bienvenida a un usuario nuevo). Ver `src/lib/marca.ts`.
 */
export const APP_NOMBRE: string =
  (process.env.NEXT_PUBLIC_APP_NOMBRE ?? '').trim() || 'Mi Cuenta Corriente'

/**
 * A qué módulo pertenece cada ruta del panel.
 *
 * Existe porque esconder una opción del menú NO apaga el módulo: con la URL en la mano se
 * entra igual. Las pantallas de un módulo apagado tienen que rebotar, y para eso hace
 * falta saber qué ruta es de qué módulo.
 *
 * El orden importa: se busca por prefijo y gana la primera que coincida, así que las
 * rutas más específicas van antes.
 */
const RUTAS: [string, Modulo][] = [
  ['/dashboard/nueva-transferencia', 'transferencias'],
  ['/dashboard/transferencias',      'transferencias'],
  ['/dashboard/gastos',              'gastos'],
  ['/dashboard/calle',               'calle'],
  ['/dashboard/deudores',            'posicion'],
  ['/dashboard/ganancias',           'ganancias'],
  ['/dashboard/admin/auditoria',     'auditoria'],
]

/** El módulo al que pertenece una ruta, o `null` si es parte del núcleo. */
export function moduloDeRuta(ruta: string): Modulo | null {
  return RUTAS.find(([prefijo]) => ruta.startsWith(prefijo))?.[1] ?? null
}

/** ¿Se puede entrar a esta ruta en esta instalación? El núcleo siempre sí. */
export function rutaActiva(ruta: string): boolean {
  const m = moduloDeRuta(ruta)
  return m === null || moduloActivo(m)
}
