'use client'
import { useEffect } from 'react'

/**
 * Avisa antes de abandonar una pantalla con datos cargados sin grabar.
 *
 * Cubre los dos caminos por los que se pierde una carga a medio hacer:
 *
 *   1. Cerrar la pestaña, recargar o ir a otra dirección → `beforeunload`, el aviso
 *      propio del navegador.
 *   2. Hacer clic en un enlace de la app (el menú lateral, por ejemplo) → esa navegación
 *      la resuelve Next sin recargar la página, así que `beforeunload` NO se dispara.
 *      Por eso se interceptan los clics sobre enlaces internos y se pregunta antes.
 *
 * Queda afuera el botón "atrás" del navegador: para cubrirlo habría que manipular el
 * historial, que trae más problemas de los que resuelve.
 */
export function useAvisoSinGuardar(hayCambios: boolean, mensaje =
  'Tenés una transacción a medio cargar. Si salís ahora se pierde.\n\n¿Salir igual?') {
  useEffect(() => {
    if (!hayCambios) return

    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Los navegadores modernos ignoran el texto y muestran su propio mensaje, pero
      // sigue haciendo falta asignarlo para que el aviso aparezca.
      e.returnValue = ''
      return ''
    }

    const alClickear = (e: MouseEvent) => {
      // Respetar clic con Ctrl/Cmd (abre en pestaña nueva) y clic con botón del medio.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const enlace = (e.target as HTMLElement | null)?.closest?.('a')
      if (!enlace) return
      const href = enlace.getAttribute('href')
      if (!href || href.startsWith('#') || enlace.target === '_blank') return
      // Enlaces externos: los cubre `beforeunload`.
      if (/^https?:\/\//i.test(href) && !href.startsWith(window.location.origin)) return
      if (href === window.location.pathname + window.location.search) return

      if (!window.confirm(mensaje)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('beforeunload', alSalir)
    // Fase de captura: hay que llegar antes que el manejador de Next.
    document.addEventListener('click', alClickear, true)
    return () => {
      window.removeEventListener('beforeunload', alSalir)
      document.removeEventListener('click', alClickear, true)
    }
  }, [hayCambios, mensaje])
}
