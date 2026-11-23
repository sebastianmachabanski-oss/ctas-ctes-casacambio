/**
 * La imagen del cheque: dónde vive y qué se acepta.
 *
 * Las reglas están acá, en un solo lugar, porque las necesitan tres: el navegador —para
 * rechazar un archivo sin subirlo—, el servidor —para no confiar en el navegador— y el
 * bucket, que tiene las mismas puestas en `migrations/2026-11-23_cheques_imagenes.sql`.
 * Si se separaran, el navegador aceptaría algo que el bucket rechaza y el operador vería
 * un error incomprensible después de esperar la subida.
 */

/** El bucket es PRIVADO: un cheque muestra la firma de un tercero. */
export const BUCKET_CHEQUES = 'cheques'

export const TIPOS_PERMITIDOS = [
  'image/jpeg', 'image/png', 'image/webp',
  // Los teléfonos de Apple sacan HEIC por defecto; sin esto se rechaza media ventanilla.
  'image/heic', 'image/heif',
  // Un echeq no es una foto: es un archivo, y suele venir en PDF.
  'application/pdf',
] as const

/** 10 MB: de sobra para una foto de teléfono, y frena un video cargado por error. */
export const TAMANO_MAXIMO = 10 * 1024 * 1024

/** Lo que se le pasa al `accept` del campo, para que el explorador ya filtre. */
export const ACEPTA = TIPOS_PERMITIDOS.join(',')

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf',
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

/** Motivo del rechazo, o `null` si el archivo sirve. */
export function problemaDelArchivo(archivo: { type: string; size: number }): string | null {
  if (!TIPOS_PERMITIDOS.includes(archivo.type as typeof TIPOS_PERMITIDOS[number]))
    return 'Se aceptan fotos (JPG, PNG, WEBP, HEIC) o un PDF.'
  if (archivo.size > TAMANO_MAXIMO)
    return `El archivo pesa ${mb(archivo.size)} y el máximo es ${mb(TAMANO_MAXIMO)}.`
  if (archivo.size === 0) return 'El archivo está vacío.'
  return null
}

/**
 * Dónde se guarda: `AAAA/MM/<id>.<ext>`.
 *
 * Con año y mes adelante, una carpeta no junta decenas de miles de archivos y la purga
 * del día que se defina la retención es borrar un prefijo. El nombre NO lleva el número
 * del cheque ni el librador: el nombre de un archivo en un bucket se filtra, se comparte
 * y aparece en los registros, y ahí no tiene por qué ir el dato de un tercero.
 */
export function rutaDeArchivo(tipoMime: string, hoy = new Date()): string {
  const ext = EXTENSION[tipoMime] ?? 'bin'
  const aa = hoy.getUTCFullYear()
  const mm = String(hoy.getUTCMonth() + 1).padStart(2, '0')
  // `randomUUID` existe en el navegador moderno y en Node; el respaldo es por si la
  // pantalla corre en un contexto sin `crypto` (una vista previa, una prueba).
  const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  return `${aa}/${mm}/${id}.${ext}`
}

/** ¿Esta ruta apunta a un PDF? Decide si la ficha muestra una imagen o un enlace. */
export const esPdf = (ruta: string | null): boolean => !!ruta && ruta.toLowerCase().endsWith('.pdf')
