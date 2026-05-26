'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const REQUISITOS = [
  { regex: /.{8,}/,      texto: 'Minimo 8 caracteres' },
  { regex: /[A-Z]/,      texto: 'Al menos una mayuscula' },
  { regex: /[a-z]/,      texto: 'Al menos una minuscula' },
  { regex: /[0-9]/,      texto: 'Al menos un numero' },
  { regex: /[!@#$%&*]/, texto: 'Al menos un caracter especial (!@#$%&*)' },
]

export default function CambiarClaveForm({ forzado }: { forzado?: boolean }) {
  const router = useRouter()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const requisitosOk = REQUISITOS.every(r => r.regex.test(nueva))
  const coinciden = nueva === confirmar && nueva.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!requisitosOk || !coinciden) return
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sesion expirada')

      const { error: e1 } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: actual
      })
      if (e1) throw new Error('La contrasena actual es incorrecta')

      const userId = user.id

      const { error: e2 } = await supabase.auth.updateUser({ password: nueva })
      if (e2) throw new Error('Error al actualizar: ' + e2.message)

      const { error: e3 } = await (supabase as any).rpc('marcar_clave_cambiada', { p_user_id: userId })
      if (e3) console.error('Error marcando clave:', e3.message)

      setSuccess(true)

      setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
      }, 2000)

    } catch (err: any) {
      setError(err.message || 'Error inesperado')
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
              <li key={r.texto} className={ok ? 'flex items-center gap-2 text-sm text-green-600' : 'flex items-center gap-2 text-sm text-gray-500'}>
                <span className={ok ? 'w-5 h-5 rounded-full flex items-center justify-center text-xs bg-green-100 text-green-600' : 'w-5 h-5 rounded-full flex items-center justify-center text-xs bg-gray-200 text-gray-400'}>
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
          <label className="label">{forzado ? 'Contrasena inicial' : 'Contrasena actual'}</label>
          <input type="password" className="input" value={actual}
            onChange={e => setActual(e.target.value)} required
            placeholder={forzado ? 'Cliente1234!' : ''} />
        </div>

        <div>
          <label className="label">Nueva contrasena</label>
          <input type="password" className="input" value={nueva}
            onChange={e => setNueva(e.target.value)} required />
          {nueva && (
            <div className="mt-2">
              <div className="flex gap-1">
                {REQUISITOS.map((r, i) => (
                  <div key={i} className={r.regex.test(nueva) ? 'h-1.5 flex-1 rounded-full bg-green-400' : 'h-1.5 flex-1 rounded-full bg-gray-200'} />
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: REQUISITOS.filter(r => r.regex.test(nueva)).length < 3 ? '#ef4444' : REQUISITOS.filter(r => r.regex.test(nueva)).length < 5 ? '#f59e0b' : '#16a34a' }}>
                {REQUISITOS.filter(r => r.regex.test(nueva)).length < 3 ? 'Contrasena debil' : REQUISITOS.filter(r => r.regex.test(nueva)).length < 5 ? 'Contrasena media' : '✓ Contrasena fuerte'}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="label">Confirmar nueva contrasena</label>
          <input type="password" className="input" value={confirmar}
            onChange={e => setConfirmar(e.target.value)} required />
          {confirmar && (
            <p className={coinciden ? 'text-xs mt-1 text-green-600' : 'text-xs mt-1 text-red-500'}>
              {coinciden ? '✓ Las contrasenas coinciden' : 'Las contrasenas no coinciden'}
            </p>
          )}
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

        {success ? (
          <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm text-center space-y-2">
            <div className="flex items-center justify-center gap-2 font-medium">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Cerrando sesion...
            </div>
            <p className="text-xs">Seras redirigido al login para ingresar con tu nueva contrasena</p>
          </div>
        ) : (
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
        )}
      </form>
    </div>
  )
}
