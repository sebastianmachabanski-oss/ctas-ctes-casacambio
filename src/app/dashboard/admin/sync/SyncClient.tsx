'use client'
import { useState } from 'react'

interface Props {
  totalMovimientos: number
  ultimaSync: string | null
}

export default function SyncClient({ totalMovimientos, ultimaSync }: Props) {
  const [loading, setLoading] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    if (!confirm('Esto reemplazará todos los movimientos CTA CTE con los datos actuales del Excel. ¿Continuar?')) return
    setLoading(true)
    setError(null)
    setResultado(null)

    const res = await fetch('/api/sync')
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }
    setResultado(data)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Sincronización</h1>
        <p className="text-gray-500 text-sm mt-1">Actualiza los datos desde Google Sheets</p>
      </div>

      {/* Estado actual */}
      <div className="card p-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Movimientos en base</p>
            <p className="text-2xl font-bold text-gray-900">{totalMovimientos.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Última sincronización</p>
            <p className="text-sm font-medium text-gray-900">
              {ultimaSync
                ? new Date(ultimaSync).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Nunca'}
            </p>
          </div>
        </div>

        {/* Resultados */}
        {resultado && (
          <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            <p className="font-semibold">✓ Sincronización exitosa</p>
            <p>{resultado.movimientos.toLocaleString('es-AR')} movimientos · {resultado.cuentas} cuentas actualizadas</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <p className="font-semibold">Error en la sincronización</p>
            <p>{error}</p>
          </div>
        )}

        {/* Botones */}
        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleSync} className="btn-primary" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Sincronizando...
              </span>
            ) : '🔄 Sincronizar ahora'}
          </button>

          {/* Botón de información */}
          <button onClick={() => setShowInfo(!showInfo)}
            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors text-sm font-bold"
            title="Cómo funciona">
            i
          </button>
        </div>

        {/* Panel de información colapsable */}
        {showInfo && (
          <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600 space-y-2">
            <ol className="space-y-1.5">
              <li className="flex gap-2"><span className="font-bold text-brand-600">1.</span> Lee los movimientos de la solapa DIARIO donde TIPO = CTA CTE</li>
              <li className="flex gap-2"><span className="font-bold text-brand-600">2.</span> Reemplaza los datos existentes con los nuevos</li>
              <li className="flex gap-2"><span className="font-bold text-brand-600">3.</span> Los clientes ven la información actualizada inmediatamente</li>
            </ol>
            <p className="text-xs text-amber-600 mt-2">⚠️ Los movimientos anulados manualmente se conservan.</p>
          </div>
        )}
      </div>
    </div>
  )
}
