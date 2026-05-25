'use client'
import { useState } from 'react'

const REQUISITOS = [
  { regex: /.{8,}/,        texto: 'Mínimo 8 caracteres' },
  { regex: /[A-Z]/,        texto: 'Una mayúscula' },
  { regex: /[a-z]/,        texto: 'Una minúscula' },
  { regex: /[0-9]/,        texto: 'Un número' },
  { regex: /[!@#$%&*]/,   texto: 'Un carácter especial (!@#$%&*)' },
]

export default function CambiarClaveForm() {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showActual, setShowActual] = useState(false)
  const [showNueva, setShowNueva] = useState(false)
  const [showConf, setShowConf] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null); setSuccess(false)

    const res = await fetch('/api/mi-cuenta/cambiar-clave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave_actual: actual, clave_nueva: nueva, clave_confirmacion: confirmar }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setSuccess(true)
    setActual(''); setNueva(''); setConfirmar('')
  }

  return (
    <div className="card p-5 md:p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-5">Cambiar contraseña</h2>

      {/* Requisitos de clave */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-5">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          La nueva contraseña debe tener:
        </p>
        <ul className="space-y-1">
          {REQUISITOS.map(r => {
            const ok = r.regex.test(nueva)
            return (
              <li key={r.texto} className={`flex items-center gap-2 text-sm ${ok ? 'text-green-600' : 'text-gray-500'}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${ok ? 'bg-green-100' : 'bg-gray-100'}`}>
                  {ok ? '✓' : '·'}
                </span>
                {r.texto}
              </li>
            )
          })}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Clave actual */}
        <div>
          <label className="label">Contraseña actual</label>
          <div className="relative">
            <input type={showActual ? 'text' : 'password'} className="input pr-10"
              value={actual} onChange={e => setActual(e.target.value)} required />
            <button type="button" onClick={() => setShowActual(!showActual)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showActual ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {/* Nueva clave */}
        <div>
          <label className="label">Nueva contraseña</label>
          <div className="relative">
            <input type={showNueva ? 'text' : 'password'} className="input pr-10"
              value={nueva} onChange={e => setNueva(e.target.value)} required />
            <button type="button" onClick={() => setShowNueva(!showNueva)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showNueva ? '🙈' : '👁️'}
            </button>
          </div>
          {/* Barra de fuerza */}
          {nueva && (
            <div className="mt-2">
              <div className="flex gap-1">
                {REQUISITOS.map((r, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${r.regex.test(nueva) ? 'bg-green-400' : 'bg-gray-200'}`} />
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {REQUISITOS.filter(r => r.regex.test(nueva)).length < 3 ? 'Clave débil' :
                 REQUISITOS.filter(r => r.regex.test(nueva)).length < 5 ? 'Clave media' : 'Clave fuerte ✓'}
              </p>
            </div>
          )}
        </div>

        {/* Confirmar */}
        <div>
          <label className="label">Confirmar nueva contraseña</label>
          <div className="relative">
            <input type={showConf ? 'text' : 'password'} className="input pr-10"
              value={confirmar} onChange={e => setConfirmar(e.target.value)} required />
            <button type="button" onClick={() => setShowConf(!showConf)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showConf ? '🙈' : '👁️'}
            </button>
          </div>
          {confirmar && nueva !== confirmar && (
            <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
          )}
          {confirmar && nueva === confirmar && (
            <p className="text-xs text-green-600 mt-1">✓ Las contraseñas coinciden</p>
          )}
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        {success && <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">✓ Contraseña actualizada correctamente</div>}

        <button type="submit" className="btn-primary w-full" disabled={loading || nueva !== confirmar || REQUISITOS.some(r => !r.regex.test(nueva))}>
          {loading ? 'Actualizando...' : 'Actualizar contraseña'}
        </button>
      </form>
    </div>
  )
}
