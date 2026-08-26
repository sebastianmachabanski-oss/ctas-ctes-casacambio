'use client'
import { useEffect } from 'react'

/**
 * Barra de acciones del extracto — no sale impresa (`.no-print`).
 *
 * El diálogo se abre solo al entrar: el usuario viene de apretar "Exportar a PDF", así
 * que ya pidió esto. Va con un respiro para que el navegador termine de dibujar la hoja;
 * si se dispara antes, algunos navegadores imprimen la página a medio pintar.
 *
 * En el diálogo hay que elegir "Guardar como PDF" como destino. Es el camino estándar y
 * evita sumar una librería de PDF al proyecto para algo que el navegador ya hace bien.
 */
export default function BotonImprimir() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="no-print barra">
      <style>{`
        .barra {
          position: fixed; top: 0; left: 0; right: 0; z-index: 10;
          display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
          padding: 12px 18px; background: #fff; border-bottom: 1px solid #d6d6de;
          font: 13px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        .barra button, .barra a {
          font: inherit; font-weight: 600; padding: 7px 14px; border-radius: 8px;
          border: 1px solid #c9c9d2; background: #fff; color: #1c1c22;
          cursor: pointer; text-decoration: none;
        }
        .barra .primario { background: #2563eb; border-color: #2563eb; color: #fff; }
        .barra .ayuda { color: #666; }
      `}</style>
      <button className="primario" onClick={() => window.print()}>Imprimir / Guardar como PDF</button>
      <button onClick={() => window.close()}>Cerrar</button>
      <span className="ayuda">En el diálogo, elegí <b>Guardar como PDF</b> en Destino.</span>
    </div>
  )
}
