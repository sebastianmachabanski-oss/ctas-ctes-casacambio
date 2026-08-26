'use client'
import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { APP_NOMBRE } from '@/lib/marca'
import { candidatosEmail } from '@/lib/usuarios'

function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    // Volver a ocultarla al enviar: si quedó revelada, no debe seguir a la vista.
    setShowPass(false)
    setLoading(true); setError(null)
    const supabase = createClient()

    // Se entra con el NOMBRE de usuario ("jperez"), no con una dirección de correo. Como
    // Supabase identifica por dirección, se prueban los dominios internos en orden: el
    // actual y el que tenían los usuarios creados antes del 26/8/2026. Quien escriba una
    // dirección completa tiene un solo candidato y se prueba tal cual.
    let ok = false
    for (const candidato of candidatosEmail(email)) {
      const { error } = await supabase.auth.signInWithPassword({ email: candidato, password })
      if (!error) { ok = true; break }
    }
    if (!ok) { setError('Usuario o contraseña incorrectos.'); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-start justify-center px-4 pt-16"
      style={{
        background:
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.11) 1.3px, transparent 0) 0 0 / 20px 20px,' +
          'radial-gradient(900px 480px at 50% -6%, rgba(59,130,246,0.38), transparent 62%),' +
          'linear-gradient(180deg, #17213b, #0b1120)',
      }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">{APP_NOMBRE}</h1>
          {/* El subtítulo decía "Portal de Cuentas Corrientes": con el nombre nuevo
              repetía lo mismo dos veces seguidas. */}
          <p className="text-brand-200 text-sm mt-1">Acceso al sistema</p>
        </div>
        <div className="card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Usuario</label>
              {/* type="text": el usuario ya no es una dirección de correo, y con type="email"
                  el navegador rechazaba "jperez" antes de llegar al servidor. */}
              <input id="email" type="text" className="input" placeholder="tu usuario"
                value={email} onChange={e => setEmail(e.target.value)} required
                autoComplete="username" autoCapitalize="none" spellCheck={false} />
            </div>
            <div>
              <label className="label" htmlFor="password">Contraseña</label>
              <div className="relative">
                <input id="password" type={showPass ? 'text' : 'password'} className="input pr-10"
                  placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
                {/* tabIndex -1: fuera del recorrido del tabulador. Con la contraseña
                    guardada en el navegador, el foco caía en este botón y el Enter lo
                    activaba en vez de enviar el formulario, dejando la clave a la vista. */}
                <button type="button" tabIndex={-1}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg">
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Ingresando...
                </span>
              ) : 'Ingresar'}
            </button>
          </form>
        </div>
        <p className="text-center text-sm mt-5" style={{ color: '#8494b3' }}>
          Si olvidó su contraseña, comuníquese con el administrador del sistema para poder restablecerla.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
