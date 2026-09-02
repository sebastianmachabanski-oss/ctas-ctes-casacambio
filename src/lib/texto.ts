/**
 * Comparación de texto para las búsquedas de la interfaz.
 *
 * Los nombres de cliente y de cuenta se cargaron a mano durante años: conviven "MARÍA",
 * "Maria" y "maria" para la misma persona. Obligar a escribirlo igual que quedó guardado
 * sería pedirle al operador que adivine cómo lo tipeó otro.
 *
 * Por eso todo lo que se busca en pantalla se compara normalizado: sin mayúsculas, sin
 * acentos y sin espacios de sobra.
 */

/** Mayúsculas sin acentos ni espacios al borde. */
export const norm = (s: string): string =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()

/**
 * Ordena una lista poniendo primero lo que EMPIEZA con lo buscado y después lo que lo
 * contiene en el medio. Con el padrón de clientes, buscar "GRA" tiene que traer GRANDE
 * antes que FEDE GRANDE.
 */
export function filtrarPorTexto(opciones: string[], query: string, tope?: number): string[] {
  const q = norm(query)
  if (!q) return tope ? opciones.slice(0, tope) : opciones
  const empiezan: string[] = []
  const contienen: string[] = []
  for (const o of opciones) {
    const n = norm(o)
    if (n.startsWith(q)) empiezan.push(o)
    else if (n.includes(q)) contienen.push(o)
  }
  const r = [...empiezan, ...contienen]
  return tope ? r.slice(0, tope) : r
}
