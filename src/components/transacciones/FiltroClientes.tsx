'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Filtro de cliente con selección múltiple.
 *
 * Antes era una búsqueda por texto: escribir "fidu" filtraba por coincidencia parcial y
 * mezclaba FIDU con FEDE FIDU sin poder separarlos. Ahora escribir sirve para ENCONTRAR
 * y el filtro son los clientes que se eligen de la lista (25/8/2026).
 *
 * Va dentro de una celda de encabezado, así que ocupa poco y despliega por encima.
 */
export default function FiltroClientes({
  clientes, seleccionados, onChange,
}: {
  clientes: string[]
  seleccionados: string[]
  onChange: (nombres: string[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [query, setQuery] = useState('')
  const [marcada, setMarcada] = useState(0)
  const cont = useRef<HTMLDivElement>(null)
  const refMarcada = useRef<HTMLButtonElement | null>(null)

  const filtrados = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return clientes.slice(0, 100)
    // Primero los que EMPIEZAN con lo tipeado; después los que lo contienen.
    const empiezan = clientes.filter(c => c.toUpperCase().startsWith(q))
    const contienen = clientes.filter(c => !c.toUpperCase().startsWith(q) && c.toUpperCase().includes(q))
    return [...empiezan, ...contienen].slice(0, 100)
  }, [clientes, query])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (cont.current && !cont.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  useEffect(() => { refMarcada.current?.scrollIntoView({ block: 'nearest' }) }, [marcada, abierto])

  function alternar(nombre: string) {
    onChange(seleccionados.includes(nombre)
      ? seleccionados.filter(c => c !== nombre)
      : [...seleccionados, nombre])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setMarcada(i => Math.min(i + 1, filtrados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcada(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtrados[marcada]) alternar(filtrados[marcada]) }
    else if (e.key === 'Escape') { e.preventDefault(); setAbierto(false) }
    else if (e.key === 'Backspace' && !query && seleccionados.length) {
      // Sin texto, Backspace saca el último elegido: es lo que hace cualquier campo de etiquetas.
      onChange(seleccionados.slice(0, -1))
    }
  }

  return (
    <div className="relative" ref={cont} style={{ minWidth: 130 }}>
      {seleccionados.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 3 }}>
          {seleccionados.map(c => (
            <button key={c} type="button" onClick={() => alternar(c)}
              title="Quitar del filtro"
              className="tag tag-blue"
              style={{ border: 0, cursor: 'pointer', fontSize: 10, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {c}<span aria-hidden style={{ opacity: .6 }}>✕</span>
            </button>
          ))}
        </div>
      )}
      <input
        className="srch"
        value={query}
        onChange={e => { setQuery(e.target.value); setMarcada(0); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onKeyDown={onKeyDown}
        placeholder={seleccionados.length ? 'agregar otro…' : 'filtrar…'}
        style={{ width: '100%', minWidth: 0 }}
        aria-label="Filtrar por cliente"
      />
      {abierto && (
        <ul role="listbox"
          className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg"
          style={{ minWidth: 230, maxHeight: 260, overflowY: 'auto' }}>
          {filtrados.length > 0 ? filtrados.map((c, i) => {
            const elegido = seleccionados.includes(c)
            return (
              <li key={c}>
                <button
                  type="button"
                  ref={i === marcada ? refMarcada : undefined}
                  className={`w-full text-left px-3 py-1.5 text-xs ${i === marcada ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => setMarcada(i)}
                  onClick={() => alternar(c)}
                  style={{ display: 'flex', gap: 7, alignItems: 'center', fontWeight: elegido ? 600 : 400 }}
                >
                  <span aria-hidden style={{ width: 12 }}>{elegido ? '✓' : ''}</span>{c}
                </button>
              </li>
            )
          }) : (
            <li className="px-3 py-2 text-xs text-gray-400">Sin clientes que coincidan</li>
          )}
        </ul>
      )}
    </div>
  )
}
