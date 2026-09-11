'use client'
import { useEffect, useState } from 'react'

/**
 * Descarga el extracto de la cuenta en PDF y —donde el dispositivo lo permite— lo comparte
 * directo por WhatsApp.
 *
 * ANTES (hasta el 10/9/2026) esto abría una pestaña con la vista imprimible y disparaba el
 * diálogo de impresión; el usuario tenía que elegir "Guardar como PDF" a mano. Para
 * mandarle el extracto a un cliente por WhatsApp eran once pasos.
 *
 * COMPARTIR: la Web Share API abre la hoja de compartir del sistema con el PDF adjunto; de
 * ahí el usuario elige WhatsApp y el contacto. Solo existe en teléfonos y tablets: el
 * navegador de escritorio no comparte archivos, así que ahí el botón ni aparece y queda
 * solo la descarga.
 *
 * OJO: WhatsApp decide qué hace con el texto que acompaña a un documento —según la versión
 * puede mostrarlo, mandarlo aparte o descartarlo—, así que no se manda ninguno. Lo que sí
 * viaja siempre es el NOMBRE DEL ARCHIVO, que lleva la cuenta y el período adentro.
 */

type Params = { cuenta: string; desde?: string; hasta?: string; operacion?: string }

const ESTILO: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
  border: '1px solid var(--ring)', color: 'var(--ink-2)', background: 'var(--card)',
  textDecoration: 'none', whiteSpace: 'nowrap', cursor: 'pointer',
}

function url(params: Params) {
  const qs = new URLSearchParams({ cuenta: params.cuenta })
  if (params.desde) qs.set('desde', params.desde)
  if (params.hasta) qs.set('hasta', params.hasta)
  if (params.operacion) qs.set('operacion', params.operacion)
  return `/api/extracto/pdf?${qs}`
}

/** Nombre que anuncia el servidor en Content-Disposition, para reusarlo al compartir. */
function nombreDe(res: Response, alternativa: string): string {
  const cd = res.headers.get('content-disposition') ?? ''
  const utf8 = cd.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) { try { return decodeURIComponent(utf8[1]) } catch { /* sigue abajo */ } }
  return cd.match(/filename="([^"]+)"/i)?.[1] ?? alternativa
}

export default function BotonExtracto({ params }: { params: Params }) {
  const [compartiendo, setCompartiendo] = useState(false)
  const [error, setError] = useState('')
  const [puedeCompartir, setPuedeCompartir] = useState(false)

  // La comprobación va DESPUÉS de montar, no durante el render: el servidor no tiene
  // `navigator` y decidir en el render dejaría el HTML del servidor distinto del que arma
  // el navegador, que es un error de hidratación.
  //
  // Se pregunta con un archivo de mentira porque no alcanza con que exista `share`: hay
  // navegadores que la tienen pero rechazan archivos, y ahí el usuario se queda mirando
  // un botón que no hace nada.
  useEffect(() => {
    try {
      const prueba = new File([''], 'x.pdf', { type: 'application/pdf' })
      setPuedeCompartir(Boolean(navigator.canShare?.({ files: [prueba] })))
    } catch { setPuedeCompartir(false) }
  }, [])

  async function compartir() {
    setCompartiendo(true); setError('')
    try {
      const res = await fetch(url(params))
      if (!res.ok) throw new Error(`No se pudo generar el extracto (${res.status})`)
      const blob = await res.blob()
      const archivo = new File([blob], nombreDe(res, 'extracto.pdf'), { type: 'application/pdf' })

      // Se vuelve a preguntar por ESTE archivo: el tamaño también puede hacer que el
      // navegador lo rechace, y eso no se sabía con el archivo de prueba.
      if (!navigator.canShare?.({ files: [archivo] })) {
        throw new Error('Este dispositivo no permite compartir archivos. Usá "Descargar PDF".')
      }
      await navigator.share({ files: [archivo] })
    } catch (e: any) {
      // Cancelar la hoja de compartir tira AbortError: no es un problema, es el usuario
      // arrepintiéndose. Mostrar un error rojo ahí sería mentirle.
      if (e?.name !== 'AbortError') setError(e?.message ?? 'No se pudo compartir')
    } finally {
      setCompartiendo(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <a href={url(params)} download style={ESTILO} title="Descarga el extracto del período en PDF">
        <span aria-hidden>⬇</span> Descargar PDF
      </a>

      {/* Solo aparece si el dispositivo puede compartir archivos: en el navegador de
          escritorio no existe, y un botón que no hace nada es peor que no tenerlo. */}
      {puedeCompartir && (
        <button onClick={compartir} disabled={compartiendo} style={{ ...ESTILO, opacity: compartiendo ? 0.6 : 1 }}
          title="Genera el PDF y lo comparte por WhatsApp u otra aplicación">
          <span aria-hidden>📤</span> {compartiendo ? 'Generando…' : 'Compartir'}
        </button>
      )}

      {error && <span style={{ fontSize: 12, color: 'var(--neg-ink)' }}>{error}</span>}
    </span>
  )
}
