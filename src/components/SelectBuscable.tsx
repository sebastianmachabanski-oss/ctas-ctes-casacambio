'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Desplegable con búsqueda por teclado.
 *
 * POR QUÉ NO ALCANZA CON UN <select> NATIVO
 * El `<select>` acumula las teclas y las trata como UNA sola búsqueda: al tocar E y
 * después V busca "EV", que no existe, y no se mueve. Y cuando el menú está ABIERTO el
 * navegador se queda con los eventos de teclado —la app no los recibe—, así que tampoco
 * se puede corregir desde afuera. De ahí este componente (pedido del 25/8/2026).
 *
 * Comportamiento:
 *   - Escribir filtra: primero las que EMPIEZAN con lo tipeado, después las que lo contienen.
 *   - Enter elige la primera de la lista; Escape cancela y restaura el valor anterior.
 *   - Flechas ↑ ↓ recorren, Tab y el clic afuera cierran sin cambiar nada.
 */
export default function SelectBuscable({
  value, opciones, onChange, id, required, disabled, placeholder,
}: {
  value: string
  opciones: string[]
  onChange: (v: string) => void
  id?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [query, setQuery] = useState('')
  const [marcada, setMarcada] = useState(0)
  const cont = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLUListElement>(null)

  const filtradas = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return opciones
    const empiezan = opciones.filter(o => o.toUpperCase().startsWith(q))
    const contienen = opciones.filter(o => !o.toUpperCase().startsWith(q) && o.toUpperCase().includes(q))
    return [...empiezan, ...contienen]
  }, [opciones, query])

  // Cerrar al hacer clic afuera.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (cont.current && !cont.current.contains(e.target as Node)) cerrar()
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  // Mantener a la vista la opción marcada al moverse con las flechas.
  useEffect(() => {
    if (!abierto || !lista.current) return
    const el = lista.current.children[marcada] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [marcada, abierto])

  function abrir() {
    if (disabled) return
    setQuery('')
    setMarcada(Math.max(0, opciones.indexOf(value)))
    setAbierto(true)
  }
  function cerrar() { setAbierto(false); setQuery('') }
  function elegir(v: string) { onChange(v); cerrar() }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!abierto) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); abrir() }
      return
    }
    if (e.key === 'ArrowDown')      { e.preventDefault(); setMarcada(i => Math.min(i + 1, filtradas.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setMarcada(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); if (filtradas[marcada]) elegir(filtradas[marcada]) }
    else if (e.key === 'Escape')    { e.preventDefault(); cerrar() }
    else if (e.key === 'Tab')       { cerrar() }
  }

  return (
    <div className="relative" ref={cont}>
      <input
        id={id}
        type="text"
        className="input"
        // Con el menú cerrado muestra el valor elegido; al escribir, lo tipeado.
        value={abierto ? query : value}
        placeholder={placeholder ?? value}
        onChange={e => { setQuery(e.target.value); setMarcada(0); if (!abierto) setAbierto(true) }}
        onFocus={abrir}
        onKeyDown={onKeyDown}
        autoComplete="off"
        disabled={disabled}
        // El valor real siempre sale de `value`; el input es solo la caja de búsqueda.
        required={required && !value}
        aria-expanded={abierto}
        role="combobox"
        aria-controls={id ? `${id}-lista` : undefined}
      />
      <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▾</span>
      {abierto && (
        <ul id={id ? `${id}-lista` : undefined} ref={lista} role="listbox"
          className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtradas.length > 0 ? filtradas.map((o, i) => (
            <li key={o} role="option" aria-selected={o === value}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm ${i === marcada ? 'bg-brand-50' : 'hover:bg-gray-50'} ${o === value ? 'font-semibold' : ''}`}
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setMarcada(i)}
                onClick={() => elegir(o)}
              >
                {o}
              </button>
            </li>
          )) : (
            <li className="px-3 py-2 text-sm text-gray-400">Sin coincidencias</li>
          )}
        </ul>
      )}
    </div>
  )
}
