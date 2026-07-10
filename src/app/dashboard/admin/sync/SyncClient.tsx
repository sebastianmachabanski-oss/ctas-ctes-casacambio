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
    if (!res.ok) { setLoading(false); setError(data.error); return }

    // El sync corre en segundo plano; hacemos polling de la marca `lastRun` hasta confirmar.
    const before = data.before
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    const start = Date.now()
    // Leyendo del Google Sheet el sync tarda pocos segundos; el margen es por las dudas.
    while (Date.now() - start < 360000) {
      await sleep(3000)
      try {
        const sres = await fetch('/api/sync-status')
        const sdata = await sres.json()
        if (sres.ok && sdata.lastRun && sdata.lastRun !== before) {
          setLoading(false)
          let info: any = {}
          try { info = JSON.parse(sdata.lastRun) } catch { /* */ }
          if (info.ok === false) {
            setError('La sincronización falló: ' + (info.error || 'error desconocido'))
            return
          }
          setCurrentTotal(sdata.total)
          setCurrentSync(info.at || new Date().toISOString())
          setResultado({ done: true, total: sdata.total })
          return
        }
      } catch { /* reintenta */ }
    }
    setLoading(false)
    setError('La sincronización está tardando más de lo esperado (>6 min). Recargá la página en un momento para verificar.')
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div className="card p-5">
        <div className="kpis-caja" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          <div className="kpi">
            <span className="cur">Movimientos en base</span>
            <div className="val num">{currentTotal.toLocaleString('es-AR')}</div>
          </div>
          <div className="kpi">
            <span className="cur">Última sincronización</span>
            <div className="val" style={{ fontSize: 15 }}>
              {currentSync
                ? new Date(currentSync).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Nunca'}
            </div>
          </div>
        </div>

        {resultado && (
          <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            <p className="font-semibold">✓ Sincronización completada</p>
            <p>{Number(resultado.total).toLocaleString('es-AR')} movimientos CTA CTE en base · actualizado recién</p>
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
