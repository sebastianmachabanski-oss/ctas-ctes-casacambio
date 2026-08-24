'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Desplegable pensado para CARGA RÁPIDA con el teclado.
 *
 * La letra ELIGE, no filtra: tocar V deja VENTA seleccionada al instante, sin Enter y sin
 * abrir nada. Tab pasa al campo siguiente. En las listas de esta pantalla ninguna opción
 * comparte inicial —COMPRA, VENTA, INGRESAN, EGRESAN, GASTOS; PESOS, CHEQUES, DOLARES,
 * EUROS, REALES, USDT—, así que una tecla por campo alcanza. Si dos empezaran igual,
 * repetir la tecla cicla entre ellas.
 *
 * POR QUÉ NO UN <select> NATIVO (dos intentos previos, 25/8/2026)
 *   1. Acumula las teclas y las trata como UNA búsqueda: E y después V busca "EV", que no
 *      existe, y no se mueve.
 *   2. Con el menú ABIERTO el navegador se queda con los eventos de teclado: la app no los
 *      recibe y no hay forma de corregirlo desde afuera.
 *
 * El mouse sigue andando igual: clic abre la lista, clic en una opción la elige.
 */
export default function SelectBuscable({
  value, opciones, onChange, id, required, disabled,
}: {
  value: string
  opciones: string[]
  onChange: (v: string) => void
  id?: string
  required?: boolean
  disabled?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const cont = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (cont.current && !cont.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  // Mantener a la vista la opción elegida mientras la lista está abierta.
  useEffect(() => {
    if (!abierto || !lista.current) return
    const i = opciones.indexOf(value)
    if (i >= 0) (lista.current.children[i] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
  }, [abierto, value, opciones])

  function elegir(v: string) { onChange(v); setAbierto(false) }

  function mover(paso: 1 | -1) {
    if (!opciones.length) return
    const i = opciones.indexOf(value)
    onChange(opciones[(i + paso + opciones.length) % opciones.length])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return

    if (e.key === 'ArrowDown')  { e.preventDefault(); mover(1);  return }
    if (e.key === 'ArrowUp')    { e.preventDefault(); mover(-1); return }
    if (e.key === 'Escape')     { e.preventDefault(); setAbierto(false); return }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierto(a => !a); return }

    // Una letra o número: elige la primera opción que empiece así. Repetir la misma tecla
    // cicla entre las que comparten inicial.
    if (e.key.length !== 1 || e.altKey || e.ctrlKey || e.metaKey) return
    const inicial = e.key.toUpperCase()
    const coincidencias = opciones.filter(o => o.toUpperCase().startsWith(inicial))
    if (!coincidencias.length) return
    e.preventDefault()
    const i = coincidencias.indexOf(value)
    onChange(coincidencias[(i + 1) % coincidencias.length])
  }

  return (
    <div className="relative" ref={cont}>
      <input
        id={id}
        type="text"
        className="input"
        value={value}
        // Solo lectura: el valor se cambia con el teclado o con el mouse, nunca tipeando
        // texto libre. Así una tecla equivale a una elección y no hay estados a medias.
        readOnly
        onKeyDown={onKeyDown}
        onClick={() => !disabled && setAbierto(a => !a)}
        disabled={disabled}
        required={required && !value}
        autoComplete="off"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={id ? `${id}-lista` : undefined}
        title="Tocá la primera letra para elegir (V = VENTA). Las flechas recorren la lista."
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▾</span>
      {abierto && (
        <ul id={id ? `${id}-lista` : undefined} ref={lista} role="listbox"
          className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {opciones.map(o => (
            <li key={o} role="option" aria-selected={o === value}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${o === value ? 'bg-brand-50 font-semibold' : ''}`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => elegir(o)}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
