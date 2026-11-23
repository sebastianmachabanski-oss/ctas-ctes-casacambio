'use client'
import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ACEPTA, BUCKET_CHEQUES, problemaDelArchivo, rutaDeArchivo,
} from '@/lib/cheques-archivo'

/**
 * Sube la imagen de un cheque y devuelve la RUTA dentro del bucket.
 *
 * SUBE DESDE EL NAVEGADOR, no a través de una función del servidor. Una foto de teléfono
 * son varios megas: pasarla por una función que tiene 30 segundos y un tope de cuerpo es
 * pagar un rodeo para llegar al mismo lugar. Va directo al bucket con la sesión del
 * operador, así que las policies deciden igual que en cualquier otra escritura.
 *
 * Se sube AL ELEGIR el archivo y no al guardar: así el operador ve enseguida si el
 * archivo sirve, en vez de enterarse al final de que la foto pesaba demasiado.
 */
export default function SubirImagen({ valor, onChange, deshabilitado, compacto }: {
  valor: string | null
  onChange: (ruta: string | null) => void
  deshabilitado?: boolean
  /** En el alta el espacio es poco: solo el botón y el estado. */
  compacto?: boolean
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    // El campo se limpia siempre: si no, elegir el mismo archivo dos veces seguidas
    // (porque la primera falló) no dispara el evento y parece que la pantalla se colgó.
    e.target.value = ''
    if (!archivo) return

    setError(null)
    const problema = problemaDelArchivo(archivo)
    if (problema) { setError(problema); return }

    setSubiendo(true)
    try {
      const ruta = rutaDeArchivo(archivo.type)
      const { error: errorSubida } = await createClient()
        .storage.from(BUCKET_CHEQUES)
        .upload(ruta, archivo, { contentType: archivo.type, upsert: false })
      if (errorSubida) {
        setError(errorSubida.message.toLowerCase().includes('bucket')
          ? 'Falta crear el depósito de imágenes: corré migrations/2026-11-23_cheques_imagenes.sql.'
          : `No se pudo subir: ${errorSubida.message}`)
        return
      }
      onChange(ruta)
    } catch {
      setError('No se pudo subir el archivo. Probá de nuevo.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input ref={entrada} type="file" accept={ACEPTA} onChange={elegir}
        style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="chip" disabled={deshabilitado || subiendo}
          onClick={() => entrada.current?.click()}>
          {subiendo ? 'Subiendo…' : valor ? 'Cambiar imagen' : compacto ? 'Foto' : 'Subir imagen'}
        </button>

        {valor && !subiendo && (
          <>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Cargada</span>
            <button type="button" className="chip" disabled={deshabilitado}
              onClick={() => onChange(null)}>
              Quitar
            </button>
          </>
        )}
      </div>

      {!compacto && !valor && !error && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45 }}>
          Foto o PDF, hasta 10 MB.
        </div>
      )}

      {error && <div style={{ fontSize: 11.5, color: '#b91c1c', lineHeight: 1.45 }}>{error}</div>}
    </div>
  )
}
