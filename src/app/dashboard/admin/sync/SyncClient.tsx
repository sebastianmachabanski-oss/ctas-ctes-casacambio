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
  const [currentTotal, setCurrentTotal] = useState(totalMovimientos)
  const [currentSync, setCurrentSync] = useState(ultimaSync)

  async function handleSync() {
    if (!confirm('Esto actualizará los movimientos CTA CTE de los últimos 30 días con los datos del Excel. ¿Continuar?')) return
    setLoading(true)
    setError(null)
    setResultado(null)

    const res = await fetch('/api/sync')
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }
    setResultado(data)
    setCurrentSync(new Date().toISOString())
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Sincronización</h1>
        <p className="text-gray-500 text-sm mt-1">Actualiza los datos desde Google Sheets</p>
      </div>

      <div className="card p-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Movimientos en base</p>
            <p className="text-2xl font-bold text-gray-900">{currentTotal.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Última sincronización</p>
            <p className="text-sm font-medium text-gray-900">
              {currentSync
                ? new Date(currentSync).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Nunca'}
            </p>
          </div>
        </div>

        {resultado && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
            <p className="font-semibold">✓ Sincronización iniciada</p>
            <p>Se está actualizando en segundo plano (últimos 30 días). En unos segundos los datos quedan al día — recargá la página para ver el total actualizado.</p>
          </div>
        )}

        {resultado && resultado.monedasIncompletas?.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <p className="font-semibold">⚠️ {resultado.monedasIncompletas.length} fila{resultado.monedasIncompletas.length !== 1 ? 's' : ''} con moneda incompleta</p>
            <p className="text-xs mb-2">Falta PROPIO o EXTERNO. El Excel ignora estas filas al totalizar el saldo en cuenta corriente — revisalas en la planilla.</p>
            <ul className="text-xs space-y-1 max-h-48 overflow-auto">
              {resultado.monedasIncompletas.map((m: any, i: number) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{m.cuenta}</span>
                  <span className="opacity-70">{m.fecha}</span>
                  <span className="opacity-70">{m.operacion}</span>
                  <span className="font-medium">falta {m.falta}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <p className="font-semibold">Error en la sincronización</p>
            <p>{error}</p>
          </div>
        )}

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

          <button onClick={() => setShowInfo(!showInfo)}
            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors text-sm font-bold"
            title="Cómo funciona">
            i
          </button>
        </div>

        {showInfo && (
          <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600 space-y-2">
            <ol className="space-y-1.5">
              <li className="flex gap-2"><span className="font-bold text-brand-600">1.</span> Lee los movimientos de la solapa DIARIO donde TIPO = CTA CTE</li>
              <li className="flex gap-2"><span className="font-bold text-brand-600">2.</span> Actualiza los movimientos de los últimos 30 días (incremental)</li>
              <li className="flex gap-2"><span className="font-bold text-brand-600">3.</span> Los clientes ven la información actualizada inmediatamente</li>
            </ol>
            <p className="text-xs text-amber-600 mt-2">⚠️ Los movimientos anulados manualmente se conservan.</p>
          </div>
        )}
      </div>
    </div>
  )
}
