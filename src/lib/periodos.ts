/**
 * Períodos de los reportes: Día / Semana / Mes / Año, más un rango libre.
 *
 * Vivía duplicado entre `dashboard/ganancias/page.tsx` y `GananciasView.tsx`. Se sacó a
 * un módulo propio el 26/8/2026, cuando Gastos pidió el mismo selector: dos copias de la
 * cuenta de "en qué semana cae esta fecha" se desincronizan tarde o temprano.
 *
 * Todo se calcula en UTC al mediodía a propósito. Las fechas son días calendario, no
 * instantes; sumando días sobre medianoche local, un cambio de huso mueve el resultado
 * un día entero.
 */

export const PERIODOS: [string, string][] = [
  ['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'],
]

export const esPeriodoValido = (p: string | undefined | null): boolean =>
  PERIODOS.some(([id]) => id === p)

/** Hoy en Argentina. El servidor corre en UTC: de noche ya sería mañana. */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function addMonths(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** Primer y último día del período, anclado en la fecha cursor. */
export function rangoDe(p: string, cursor: string): [string, string] {
  const d = new Date(cursor + 'T12:00:00Z')
  if (p === 'semana') {
    const dow = (d.getUTCDay() + 6) % 7 // lunes = 0
    const ini = addDays(cursor, -dow)
    return [ini, addDays(ini, 6)]
  }
  if (p === 'mes') {
    const ini = cursor.slice(0, 8) + '01'
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))
    return [ini, fin.toISOString().slice(0, 10)]
  }
  if (p === 'anio') return [cursor.slice(0, 4) + '-01-01', cursor.slice(0, 4) + '-12-31']
  return [cursor, cursor] // dia
}

/** Un paso adelante o atrás dentro del mismo período. */
export function navegarPeriodo(p: string, cursor: string, dir: 1 | -1): string {
  if (p === 'dia') return addDays(cursor, dir)
  if (p === 'semana') return addDays(cursor, 7 * dir)
  if (p === 'mes') return addMonths(cursor, dir)
  return addMonths(cursor, 12 * dir)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Cómo se lee el período en pantalla: "Martes 26 de agosto de 2026", "Agosto 2026"… */
export function labelPeriodo(p: string, fecha: string): string {
  const d = new Date(fecha + 'T12:00:00Z')
  if (p === 'dia') return cap(d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  if (p === 'semana') {
    const dow = (d.getUTCDay() + 6) % 7
    const ini = addDays(fecha, -dow), fin = addDays(ini, 6)
    const di = new Date(ini + 'T12:00:00Z'), df = new Date(fin + 'T12:00:00Z')
    return `Semana del ${di.getUTCDate()}/${di.getUTCMonth() + 1} al ${df.getUTCDate()}/${df.getUTCMonth() + 1}/${df.getUTCFullYear()}`
  }
  if (p === 'mes') return cap(d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }))
  return `Año ${fecha.slice(0, 4)}`
}

/** Etiqueta de un rango libre: "Del 01/08/2026 al 26/08/2026". */
export const labelRango = (desde: string, hasta: string) =>
  `Del ${desde.split('-').reverse().join('/')} al ${hasta.split('-').reverse().join('/')}`
