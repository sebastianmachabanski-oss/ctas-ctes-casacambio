'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Vuelve a pedir los datos de la pantalla cada tanto, sin que el usuario haga nada.
 *
 * POR QUÉ HACE FALTA
 * Quien carga un movimiento ve la lista actualizada —el alta llama a `router.refresh()`—,
 * pero quien tiene la pantalla abierta en OTRA máquina no se entera: no hay tiempo real ni
 * consulta periódica, así que su lista se queda como estaba hasta que navegue o refresque.
 * Con dos o tres operadores trabajando a la vez, eso es ver saldos viejos sin saberlo.
 *
 * ES UN REFRESCO SILENCIOSO. `router.refresh()` vuelve a armar los componentes de servidor
 * y CONSERVA el estado del navegador: lo tipeado en un filtro, la página en la que está y
 * el scroll no se pierden. Por eso no hace falta avisar ni pedir permiso.
 *
 * TRES GUARDAS, y las tres importan:
 *
 *  1. Solo con la pestaña VISIBLE. Sin esto, una pestaña olvidada toda la noche consulta
 *     la base 480 veces por turno sin que nadie la mire.
 *  2. No mientras el usuario está en un campo. El refresco no borra lo tipeado, pero si la
 *     lista crece mientras alguien elige una fecha o un cliente, el contenido se le mueve
 *     bajo el cursor. Se espera a que salga del campo.
 *  3. Al volver a la pestaña, refresca YA. Volver de otra ventana y encontrar datos de
 *     hace media hora es justamente lo que esto viene a evitar, y esperar hasta un minuto
 *     más sería raro.
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
  // En un ref y no en estado: cambiarlo no tiene que volver a dibujar nada.
  const ultimo = useRef(Date.now())

  useEffect(() => {
    const ms = Math.max(10, segundos) * 1000

    const refrescar = () => {
      ultimo.current = Date.now()
      router.refresh()
    }

    const tic = () => {
      if (document.visibilityState !== 'visible') return
      if (escribiendo()) return
      refrescar()
    }

    // Al volver a la pestaña: si pasó más de un intervalo, se actualiza en el momento.
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimo.current >= ms) refrescar()
    }

    const timer = setInterval(tic, ms)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [router, segundos])

  return null
}
