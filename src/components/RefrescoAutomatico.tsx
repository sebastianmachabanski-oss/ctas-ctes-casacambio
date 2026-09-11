'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Mantiene la pantalla al día sin que el usuario haga nada.
 *
 * POR QUÉ HACE FALTA
 * Quien carga un movimiento ve la lista actualizada —el alta llama a `router.refresh()`—,
 * pero quien tiene la pantalla abierta en OTRA máquina no se entera: el servidor no puede
 * avisarle a un navegador que no está preguntando. Con dos o tres operadores trabajando a
 * la vez, eso es mirar saldos viejos sin ninguna señal.
 *
 * PRIMERO PREGUNTA, DESPUÉS REFRESCA (11/9/2026)
 * La primera versión rearmaba la pantalla entera cada minuto. El costo no estaba en el
 * refresco sino en QUÉ recalcula: los totales del listado recorren todas las filas que
 * coinciden con el filtro, así que sin filtros se leía la tabla entera, cada minuto, por
 * pestaña abierta — y el 99% de las veces no había cambiado nada.
 *
 * Ahora cada tic consulta `/api/senal`, que devuelve dos marcas de tiempo resueltas por
 * índice. Si la señal es la misma, no se hace nada. El refresco caro ocurre solo cuando
 * de verdad se cargó, editó o borró un movimiento.
 *
 * ES UN REFRESCO SILENCIOSO. `router.refresh()` vuelve a armar los componentes de
 * servidor y CONSERVA el estado del navegador: lo tipeado en un filtro, la página del
 * listado y el scroll no se pierden.
 *
 * TRES GUARDAS, y las tres importan:
 *
 *  1. Solo con la pestaña VISIBLE. Sin esto, una pestaña olvidada toda la noche pregunta
 *     480 veces por turno sin que nadie la mire.
 *  2. No mientras el usuario está en un campo. El refresco no borra lo tipeado, pero si
 *     la lista crece mientras alguien elige una fecha o un cliente, el contenido se le
 *     mueve bajo el cursor. Se espera a que salga del campo.
 *  3. Al volver a la pestaña, se consulta enseguida. Volver de otra ventana y encontrar
 *     datos de hace media hora es justamente lo que esto viene a evitar.
 */

/** ¿El foco está en un campo de carga o filtro? Ahí el refresco espera su turno. */
function escribiendo(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable
}

export default function RefrescoAutomatico({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter()
  // En refs y no en estado: cambiarlos no tiene que volver a dibujar nada.
  const senal = useRef<string | null>(null)
  const ultimo = useRef(Date.now())
  const enVuelo = useRef(false)

  useEffect(() => {
    let vivo = true
    const ms = Math.max(10, segundos) * 1000

    async function mirar(forzarSiCambio = true) {
      if (!vivo || enVuelo.current) return
      if (document.visibilityState !== 'visible') return
      if (escribiendo()) return

      enVuelo.current = true
      try {
        const res = await fetch('/api/senal', { cache: 'no-store' })
        // 501 = la migración de `senal_cambios()` todavía no corrió. Se deja de preguntar
        // en vez de insistir cada minuto contra un endpoint que no puede responder.
        if (res.status === 501) { vivo = false; return }
        if (!res.ok) return
        const { senal: nueva } = await res.json() as { senal: string }
        ultimo.current = Date.now()

        // La primera lectura solo toma la foto: la pantalla ya viene recién armada del
        // servidor, refrescarla de entrada sería trabajo al pedo.
        if (senal.current === null) { senal.current = nueva; return }
        if (nueva !== senal.current) {
          senal.current = nueva
          if (forzarSiCambio) router.refresh()
        }
      } catch {
        // Sin red o servidor caído: se ignora y se reintenta en el próximo tic. Un cartel
        // de error por un refresco de fondo asustaría sin motivo.
      } finally {
        enVuelo.current = false
      }
    }

    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimo.current >= ms) mirar()
    }

    mirar()
    const timer = setInterval(() => mirar(), ms)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [router, segundos])

  return null
}
