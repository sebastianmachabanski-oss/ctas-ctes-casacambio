'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { filtrarPorTexto } from '@/lib/texto'

/**
 * Filtro de selección múltiple con etiquetas.
 *
 * Antes era una búsqueda por texto: escribir "fidu" filtraba por coincidencia parcial y
 * mezclaba FIDU con FEDE FIDU sin poder separarlos. Ahora escribir sirve para ENCONTRAR
 * y el filtro son los valores que se eligen de la lista (25/8/2026).
 *
 * Nació como el filtro de clientes de Transacciones y se generalizó el 26/8/2026, cuando
 * Transferencias necesitó lo mismo para los participantes. Entra en una celda de
 * encabezado, así que ocupa poco y despliega por encima.
 */
export default function FiltroMultiple({
  opciones, seleccionados, onChange, etiqueta = 'Filtrar', placeholder = 'filtrar…', anchoLista = 230,
}: {
  opciones: string[]
  seleccionados: string[]
  onChange: (valores: string[]) => void
  /** Texto para lectores de pantalla. */
  etiqueta?: string
  placeholder?: string
  anchoLista?: number
}) {
  const [abierto, setAbierto] = useState(false)
  const [query, setQuery] = useState('')
  const [marcada, setMarcada] = useState(0)
  const cont = useRef<HTMLDivElement>(null)
  const refMarcada = useRef<HTMLButtonElement | null>(null)

  // Ignora mayúsculas y acentos: los nombres se cargaron a mano y conviven las variantes.
  const filtrados = useMemo(() => filtrarPorTexto(opciones, query, 100), [opciones, query])

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
        placeholder={seleccionados.length ? 'agregar otro…' : placeholder}
        style={{ width: '100%', minWidth: 0 }}
        aria-label={etiqueta}
      />
      {abierto && (
        <ul role="listbox"
          className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg"
          style={{ minWidth: anchoLista, maxHeight: 260, overflowY: 'auto' }}>
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
            <li className="px-3 py-2 text-xs text-gray-400">Sin resultados</li>
          )}
        </ul>
      )}
    </div>
  )
}
