'use client'
import { useState } from 'react'

interface Props {
  totalMovimientos: number
  ultimaSync: string | null
}

export default function SyncClient({ totalMovimientos, ultimaSync }: Props) {
  const [loading, setLoading] = useState(false)
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
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Sincronización con Excel</h1>
        <p className="text-gray-500 text-sm mt-1">Lee el Excel de OneDrive y actualiza los datos de la app</p>
      </div>

      {/* Estado actual */}
      <div className="card p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Estado actual</h2>
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
      </div>

      {/* Cómo funciona */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Cómo funciona</h2>
        <ol className="space-y-2 text-sm text-gray-600">
          <li className="flex gap-2"><span className="font-bold text-brand-600">1.</span> La app descarga el Excel desde OneDrive</li>
          <li className="flex gap-2"><span className="font-bold text-brand-600">2.</span> Lee todos los movimientos de la solapa DIARIO donde TIPO = CTA CTE</li>
          <li className="flex gap-2"><span className="font-bold text-brand-600">3.</span> Reemplaza los datos existentes con los nuevos</li>
          <li className="flex gap-2"><span className="font-bold text-brand-600">4.</span> Los clientes ven la información actualizada inmediatamente</li>
        </ol>
        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
          ⚠️ La sincronización reemplaza todos los movimientos no anulados. Los movimientos anulados manualmente se conservan.
        </div>
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-700">
          <p className="font-semibold mb-1">✓ Sincronización exitosa</p>
          <p className="text-sm">{resultado.movimientos.toLocaleString('es-AR')} movimientos importados</p>
          <p className="text-sm">{resultado.cuentas} cuentas corrientes actualizadas</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <p className="font-semibold mb-1">Error en la sincronización</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Botón */}
      <button onClick={handleSync} className="btn-primary w-full md:w-auto" disabled={loading}>
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Sincronizando... puede demorar unos segundos
          </span>
        ) : '🔄 Sincronizar ahora'}
      </button>
    </div>
  )
}
