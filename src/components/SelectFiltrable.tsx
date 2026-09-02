'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { filtrarPorTexto, norm } from '@/lib/texto'

/**
 * Desplegable de UNA opción sobre una lista larga: se escribe para ir achicando hasta
 * encontrar el valor.
 *
 * POR QUÉ NO SIRVEN LOS OTROS DOS
 *   - Un `<select>` nativo acumula las teclas como UNA búsqueda y, con el menú abierto, el
 *     navegador se queda con los eventos: no hay forma de corregirlo desde la app.
 *   - `SelectBuscable` cicla con la primera letra. Va perfecto para las listas de cinco
 *     opciones de Nueva transacción, pero con más de mil cuentas corrientes recorrer de a
 *     una todas las que empiezan con M es inusable.
 *
 * Acá escribir FILTRA. Las flechas recorren lo filtrado y Enter elige. Salir del campo
 * sin elegir vuelve al valor que estaba: nunca queda a medio tipear.
 *
 * La búsqueda ignora mayúsculas Y acentos: "maria", "MARIA" y "María" encuentran lo
 * mismo. Los nombres de cuenta se cargaron a mano durante años y conviven las tres
 * formas; obligar a escribirlo igual que está guardado sería pedirle al operador que
 * adivine cómo lo tipeó otro.
 */

export default function SelectFiltrable({
  value, opciones, onChange, id, placeholder = 'Todos', etiqueta, maxLista = 100, className = 'input',
}: {
  value: string
  opciones: string[]
  onChange: (v: string) => void
  id?: string
  /** Clase del campo: 'input' en los formularios, 'srch' en las barras de filtros. */
  className?: string
  /** Qué se muestra —y qué significa— cuando no hay nada elegido. */
  placeholder?: string
  etiqueta?: string
  maxLista?: number
}) {
  const [abierto, setAbierto] = useState(false)
  const [query, setQuery] = useState('')
  const [marcada, setMarcada] = useState(0)
  const cont = useRef<HTMLDivElement>(null)
  const refMarcada = useRef<HTMLButtonElement | null>(null)

  const filtrados = useMemo(
    () => filtrarPorTexto(opciones, query, maxLista),
    [opciones, query, maxLista],
  )

  const totalCoincidencias = useMemo(() => {
    const q = norm(query)
    if (!q) return opciones.length
    return opciones.filter(o => norm(o).includes(q)).length
  }, [opciones, query])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (cont.current && !cont.current.contains(e.target as Node)) cerrar()
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  useEffect(() => { refMarcada.current?.scrollIntoView({ block: 'nearest' }) }, [marcada, abierto])

  function cerrar() {
    setAbierto(false)
    setQuery('') // se descarta lo tipeado: el campo vuelve a mostrar lo elegido
  }

  function elegir(v: string) {
    onChange(v)
    setAbierto(false)
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setAbierto(true)
      setMarcada(i => Math.min(i + 1, filtrados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setMarcada(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // Con la lista ABIERTA, Enter elige: hay que frenar el submit, porque el filtro
      // todavía no está resuelto. Con la lista CERRADA se deja pasar y el formulario se
      // envía, que es lo que espera quien ya eligió y quiere buscar.
      if (abierto) {
        e.preventDefault()
        if (filtrados[marcada]) elegir(filtrados[marcada])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault(); cerrar()
    }
  }

  return (
    <div className="relative" ref={cont}>
      <input
        id={id}
        type="text"
        className={className}
        // Mientras está abierto se ve lo que se escribe; cerrado, el valor elegido.
        value={abierto ? query : value}
        placeholder={value ? value : placeholder}
        onChange={e => { setQuery(e.target.value); setMarcada(0); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={abierto}
        aria-label={etiqueta}
        title="Escribí para buscar; las flechas recorren la lista y Enter elige"
        style={{ paddingRight: value ? 52 : 28 }}
      />

      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); setQuery(''); setAbierto(false) }}
          title={placeholder}
          aria-label={`Quitar el filtro (${placeholder})`}
          className="absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
          style={{ right: 26, background: 'none', border: 0, cursor: 'pointer', lineHeight: 1, fontSize: 15 }}
        >✕</button>
      )}
      <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▾</span>

      {abierto && (
        <ul role="listbox"
          className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg"
          style={{ maxHeight: 260, overflowY: 'auto', minWidth: 220 }}>
          <li>
            <button type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-500"
              onMouseDown={e => e.preventDefault()}
              onClick={() => elegir('')}>
              {placeholder}
            </button>
          </li>
          {filtrados.length > 0 ? filtrados.map((o, i) => (
            <li key={o} role="option" aria-selected={o === value}>
              <button
                type="button"
                ref={i === marcada ? refMarcada : undefined}
                className={`w-full text-left px-3 py-2 text-sm ${i === marcada ? 'bg-brand-50' : 'hover:bg-gray-50'} ${o === value ? 'font-semibold' : ''}`}
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setMarcada(i)}
                onClick={() => elegir(o)}
              >
                {o}
              </button>
            </li>
          )) : (
            <li className="px-3 py-2 text-sm text-gray-400">Sin resultados</li>
          )}
          {totalCoincidencias > filtrados.length && (
            <li className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
              {totalCoincidencias - filtrados.length} más — seguí escribiendo para acotar
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
