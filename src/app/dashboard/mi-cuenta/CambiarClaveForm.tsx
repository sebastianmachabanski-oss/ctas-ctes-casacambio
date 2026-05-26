'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const REQUISITOS = [
  { regex: /.{8,}/,      texto: 'Mínimo 8 caracteres' },
  { regex: /[A-Z]/,      texto: 'Al menos una mayúscula' },
  { regex: /[a-z]/,      texto: 'Al menos una minúscula' },
  { regex: /[0-9]/,      texto: 'Al menos un número' },
  { regex: /[!@#$%&*]/, texto: 'Al menos un carácter especial (!@#$%&*)' },
]

export default function CambiarClaveForm({ forzado }: { forzado?: boolean }) {
  const router = useRouter()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showActual, setShowActual] = useState(false)
  const [showNueva, setShowNueva] = useState(false)
  const [showConf, setShowConf] = useState(false)

  const requisitosOk = REQUISITOS.every(r => r.regex.test(nueva))
  const coinciden = nueva === confirmar && nueva.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!requisitosOk || !coinciden) return
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Sesion expirada. Ingresa nuevamente.')

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!, password: actual
      })
      if (signInError) throw new Error('La contrasena actual es incorrecta')

      const { error: updateError } = await supabase.auth.updateUser({ password: nueva })
      if (updateError) throw new Error('Error al actualizar: ' + updateError.message)

      await supabase.from('profiles').update({ debe_cambiar_clave: false }).eq('id', user.id)

      await supabase.auth.signInWithPassword({ email: user.email!, password: nueva })

      setSuccess(true)
      setActual('')
      setNueva('')
      setConfirmar('')

      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 1500)

    } catch (err: any) {
      setError(err.message || 'Ocurrio un error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-5 md:p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-5">
        {forzado ? 'Crear tu contrasena personal' : 'Cambiar contrasena'}
      </h2>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-5">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">La contrasena debe tener:</p>
        <ul className="space-y-1.5">
          {REQUISITOS.map(r => {
            const ok = r.regex.test(nueva)
            return (
              <li key={r.texto} className={"flex items-center gap-2 text-sm " + (ok ? 'text-green-600' : 'text-gray-500')}>
                <span className={"w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 " + (ok ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-400')}>
                  {ok ? '✓' : '·'}
                </span>
                {r.texto}
              </li>
            )
          })}
        </ul>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">{forzado ? 'Contrasena inicial (Cliente1234!)' : 'Contrasena actual'}</label>
          <div className="relative">
            <input type={showActual ? 'text' : 'password'} className="input pr-10"
              value={actual} onChange={e => setActual(e.target.value)} required placeholder={forzado ? 'Cliente1234!' : ''} />
            <button type="button" onClick={() => setShowActual(!showActual)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg">
              {showActual ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <div>
          <label className="label">Nueva contrasena</label>
          <div className="relative">
            <input type={showNueva ? 'text' : 'password'} className="input pr-10"
              value={nueva} onChange={e => setNueva(e.target.value)} required />
            <button type="button" onClick={() => setShowNueva(!showNueva)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg">
              {showNueva ? '🙈' : '👁️'}
            </button>
          </div>
          {nueva && (
            <div className="mt-2">
              <div className="flex gap-1">
                {REQUISITOS.map((r, i) => (
                  <div key={i} className={"h-1.5 flex-1 rounded-full " + (r.regex.test(nueva) ? 'bg-green-400' : 'bg-gray-200')} />
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: REQUISITOS.filter(r => r.regex.test(nueva)).length < 3 ? '#ef4444' : REQUISITOS.filter(r => r.regex.test(nueva)).length < 5 ? '#f59e0b' : '#16a34a' }}>
                {REQUISITOS.filter(r => r.regex.test(nueva)).length < 3 ? 'Contrasena debil' : REQUISITOS.filter(r => r.regex.test(nueva)).length < 5 ? 'Contrasena media' : '✓ Contrasena fuerte'}
              </p>
            </div>
          )}
        </div>
        <div>
          <label className="label">Confirma la nueva contrasena</label>
          <div className="relative">
            <input type={showConf ? 'text' : 'password'} className="input pr-10"
              value={confirmar} onChange={e => setConfirmar(e.target.value)} required />
            <button type="button" onClick={() => setShowConf(!showConf)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg">
              {showConf ? '🙈' : '👁️'}
            </button>
          </div>
          {confirmar && (
            <p className={"text-xs mt-1 " + (coinciden ? 'text-green-600' : 'text-red-500')}>
              {coinciden ? '✓ Las contrasenas coinciden' : 'Las contrasenas no coinciden'}
            </p>
          )}
        </div>
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        {success && <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">✓ Contrasena actualizada. Redirigiendo...</div>}
        <button type="submit" className="btn-primary w-full" disabled={loading || !requisitosOk || !coinciden}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Actualizando...
            </span>
          ) : forzado ? 'Crear mi contrasena' : 'Actualizar contrasena'}
        </button>
      </form>
    </div>
  )
}
