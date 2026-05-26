#!/bin/bash
set -e

echo "🔧 Actualizando gestión de usuarios..."

mkdir -p src/app/dashboard/admin/usuarios
mkdir -p src/app/dashboard/mi-cuenta
mkdir -p src/app/api/admin/usuarios
mkdir -p "src/app/api/admin/usuarios/[id]"
mkdir -p src/app/api/mi-cuenta/cambiar-clave

# ══════════════════════════════════════════════════════════════════
# API: Admin — crear y listar usuarios
# ══════════════════════════════════════════════════════════════════
cat > src/app/api/admin/usuarios/route.ts << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const CLAVE_INICIAL = 'Cliente1234!'

async function isSuperusuario(supabase: any, userId: string) {
  const { data } = await supabase.from('profiles').select('rol').eq('id', userId).single()
  return data?.rol === 'superusuario'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!await isSuperusuario(supabase, user.id)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const { data } = await supabase.from('profiles').select('*').order('nombre')
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!await isSuperusuario(supabase, user.id)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { email, nombre, rol, cuenta_cte, telefono, notas } = await request.json()
  if (!email || !nombre || !rol) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  if (rol === 'cliente' && !cuenta_cte) return NextResponse.json({ error: 'La cuenta corriente es obligatoria para clientes' }, { status: 400 })

  const { data, error } = await supabase.rpc('crear_usuario_admin', {
    p_email: email,
    p_password: CLAVE_INICIAL,
    p_nombre: nombre,
    p_rol: rol,
    p_cuenta_cte: cuenta_cte || null
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Guardar teléfono, notas y forzar cambio de clave
  await supabase.from('profiles').update({
    telefono: telefono || null,
    notas: notas || null,
    debe_cambiar_clave: true
  }).eq('id', data)

  return NextResponse.json({ success: true, clave_inicial: CLAVE_INICIAL })
}
EOF

# ══════════════════════════════════════════════════════════════════
# API: Admin — editar y restablecer contraseña por ID
# ══════════════════════════════════════════════════════════════════
cat > "src/app/api/admin/usuarios/[id]/route.ts" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const CLAVE_INICIAL = 'Cliente1234!'

async function isSuperusuario(supabase: any, userId: string) {
  const { data } = await supabase.from('profiles').select('rol').eq('id', userId).single()
  return data?.rol === 'superusuario'
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!await isSuperusuario(supabase, user.id)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()

  // Restablecer contraseña → vuelve a Cliente1234! y fuerza cambio
  if (body.reset_password) {
    const { error } = await supabase.rpc('admin_cambiar_clave', {
      p_user_id: params.id,
      p_nueva_clave: CLAVE_INICIAL
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('profiles').update({ debe_cambiar_clave: true }).eq('id', params.id)
    return NextResponse.json({ success: true, clave: CLAVE_INICIAL })
  }

  // Editar perfil
  const updates: Record<string, unknown> = {}
  if (body.nombre     !== undefined) updates.nombre     = body.nombre
  if (body.rol        !== undefined) updates.rol        = body.rol
  if (body.cuenta_cte !== undefined) updates.cuenta_cte = body.cuenta_cte
  if (body.activo     !== undefined) updates.activo     = body.activo
  if (body.telefono   !== undefined) updates.telefono   = body.telefono
  if (body.notas      !== undefined) updates.notas      = body.notas

  const { error } = await supabase.from('profiles').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
EOF

# ══════════════════════════════════════════════════════════════════
# API: Cambio de clave del cliente
# ══════════════════════════════════════════════════════════════════
cat > src/app/api/mi-cuenta/cambiar-clave/route.ts << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function validarClave(clave: string): string | null {
  if (clave.length < 8)         return 'Mínimo 8 caracteres'
  if (!/[A-Z]/.test(clave))     return 'Debe incluir al menos una mayúscula'
  if (!/[a-z]/.test(clave))     return 'Debe incluir al menos una minúscula'
  if (!/[0-9]/.test(clave))     return 'Debe incluir al menos un número'
  if (!/[!@#$%&*]/.test(clave)) return 'Debe incluir al menos un carácter especial (!@#$%&*)'
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { clave_actual, clave_nueva, clave_confirmacion } = await request.json()

  if (!clave_actual || !clave_nueva || !clave_confirmacion)
    return NextResponse.json({ error: 'Completá todos los campos' }, { status: 400 })

  if (clave_nueva !== clave_confirmacion)
    return NextResponse.json({ error: 'Las claves nuevas no coinciden' }, { status: 400 })

  const err = validarClave(clave_nueva)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  // Verificar clave actual
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!, password: clave_actual
  })
  if (signInError) return NextResponse.json({ error: 'La clave actual es incorrecta' }, { status: 400 })

  // Actualizar clave
  const { error } = await supabase.auth.updateUser({ password: clave_nueva })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marcar que ya cambió la clave
  await supabase.from('profiles').update({ debe_cambiar_clave: false }).eq('id', user.id)

  return NextResponse.json({ success: true })
}
EOF

# ══════════════════════════════════════════════════════════════════
# Middleware: forzar cambio de clave si debe_cambiar_clave = true
# ══════════════════════════════════════════════════════════════════
cat > src/middleware.ts << 'EOF'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Rutas públicas
  if (pathname === '/login') {
    if (user) return NextResponse.redirect(new URL('/dashboard', request.url))
    return supabaseResponse
  }

  // Requiere autenticación
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: profile } = await supabase
    .from('profiles').select('rol, activo, debe_cambiar_clave').eq('id', user.id).single()

  // Cuenta inactiva
  if (!profile || !profile.activo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=cuenta_inactiva', request.url))
  }

  // Forzar cambio de clave — solo se puede ir a /dashboard/mi-cuenta
  if (profile.debe_cambiar_clave && !pathname.startsWith('/dashboard/mi-cuenta')) {
    return NextResponse.redirect(new URL('/dashboard/mi-cuenta?forzado=1', request.url))
  }

  // Solo superusuario puede acceder a /admin
  if (pathname.startsWith('/dashboard/admin') && profile.rol !== 'superusuario') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
EOF

# ══════════════════════════════════════════════════════════════════
# Página: Mi cuenta — con alerta de cambio forzado
# ══════════════════════════════════════════════════════════════════
cat > src/app/dashboard/mi-cuenta/page.tsx << 'EOF'
import CambiarClaveForm from './CambiarClaveForm'

export default function MiCuentaPage({
  searchParams
}: {
  searchParams: { forzado?: string }
}) {
  const forzado = searchParams.forzado === '1'
  return (
    <div className="p-4 md:p-6 max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-gray-500 text-sm mt-1">Administrá tu acceso</p>
      </div>
      {forzado && (
        <div className="mb-5 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm">
          <p className="font-semibold mb-1">⚠️ Debés cambiar tu contraseña para continuar</p>
          <p>Por seguridad, tu contraseña inicial debe ser reemplazada por una personal antes de usar la aplicación.</p>
        </div>
      )}
      <CambiarClaveForm forzado={forzado} />
    </div>
  )
}
EOF

# ══════════════════════════════════════════════════════════════════
# Componente: formulario de cambio de clave
# ══════════════════════════════════════════════════════════════════
cat > src/app/dashboard/mi-cuenta/CambiarClaveForm.tsx << 'EOF'
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const REQUISITOS = [
  { regex: /.{8,}/,       texto: 'Mínimo 8 caracteres' },
  { regex: /[A-Z]/,       texto: 'Al menos una mayúscula' },
  { regex: /[a-z]/,       texto: 'Al menos una minúscula' },
  { regex: /[0-9]/,       texto: 'Al menos un número' },
  { regex: /[!@#$%&*]/,  texto: 'Al menos un carácter especial (!@#$%&*)' },
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

    // Si era forzado, redirigir al dashboard
    if (forzado) {
      setTimeout(() => router.push('/dashboard'), 1500)
    }
  }

  return (
    <div className="card p-5 md:p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-5">
        {forzado ? 'Crear tu contraseña personal' : 'Cambiar contraseña'}
      </h2>

      {/* Requisitos */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-5">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          La contraseña debe tener:
        </p>
        <ul className="space-y-1.5">
          {REQUISITOS.map(r => {
            const ok = r.regex.test(nueva)
            return (
              <li key={r.texto} className={`flex items-center gap-2 text-sm transition-colors ${ok ? 'text-green-600' : 'text-gray-500'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 transition-colors ${ok ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-400'}`}>
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
          <label className="label">{forzado ? 'Contraseña inicial (Cliente1234!)' : 'Contraseña actual'}</label>
          <div className="relative">
            <input type={showActual ? 'text' : 'password'} className="input pr-10"
              value={actual} onChange={e => setActual(e.target.value)} required
              placeholder={forzado ? 'Cliente1234!' : ''} />
            <button type="button" onClick={() => setShowActual(!showActual)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg">
              {showActual ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <div>
          <label className="label">Nueva contraseña</label>
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
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${r.regex.test(nueva) ? 'bg-green-400' : 'bg-gray-200'}`} />
                ))}
              </div>
              <p className="text-xs mt-1 transition-colors" style={{
                color: REQUISITOS.filter(r => r.regex.test(nueva)).length < 3 ? '#ef4444'
                     : REQUISITOS.filter(r => r.regex.test(nueva)).length < 5 ? '#f59e0b' : '#16a34a'
              }}>
                {REQUISITOS.filter(r => r.regex.test(nueva)).length < 3 ? 'Contraseña débil'
                : REQUISITOS.filter(r => r.regex.test(nueva)).length < 5 ? 'Contraseña media'
                : '✓ Contraseña fuerte'}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="label">Confirmá la nueva contraseña</label>
          <div className="relative">
            <input type={showConf ? 'text' : 'password'} className="input pr-10"
              value={confirmar} onChange={e => setConfirmar(e.target.value)} required />
            <button type="button" onClick={() => setShowConf(!showConf)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg">
              {showConf ? '🙈' : '👁️'}
            </button>
          </div>
          {confirmar && (
            <p className={`text-xs mt-1 ${coinciden ? 'text-green-600' : 'text-red-500'}`}>
              {coinciden ? '✓ Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
            </p>
          )}
        </div>

        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        {success && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            ✓ Contraseña actualizada correctamente{forzado ? '. Redirigiendo...' : ''}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading || !requisitosOk || !coinciden}>
          {loading ? 'Actualizando...' : forzado ? 'Crear mi contraseña' : 'Actualizar contraseña'}
        </button>
      </form>
    </div>
  )
}
EOF

# ══════════════════════════════════════════════════════════════════
# Panel admin usuarios actualizado
# ══════════════════════════════════════════════════════════════════
cat > src/app/dashboard/admin/usuarios/AdminUsuariosClient.tsx << 'EOF'
'use client'
import { useState } from 'react'

type Usuario = {
  id: string; email: string; nombre: string; rol: string
  activo: boolean; cuenta_cte: string | null
  telefono: string | null; notas: string | null; created_at: string
}
interface Props { usuariosIniciales: Usuario[]; cuentas: string[] }

const ROL_LABELS: Record<string, string> = { superusuario: 'Superusuario', operador: 'Operador', cliente: 'Cliente' }
const ROL_COLORS: Record<string, string> = {
  superusuario: 'bg-purple-100 text-purple-700',
  operador: 'bg-blue-100 text-blue-700',
  cliente: 'bg-gray-100 text-gray-700',
}

function generarEmail(nombre: string) {
  return nombre.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '') + '@casadecambio.com'
}

export default function AdminUsuariosClient({ usuariosIniciales, cuentas }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[]>(usuariosIniciales)
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claveMsg, setClaveMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', rol: 'cliente', cuenta_cte: '', notas: '' })

  function abrirNuevo() {
    setEditando(null)
    setForm({ nombre: '', email: '', telefono: '', rol: 'cliente', cuenta_cte: '', notas: '' })
    setError(null); setClaveMsg(null); setModal('nuevo')
  }

  function abrirEditar(u: Usuario) {
    setEditando(u)
    setForm({ nombre: u.nombre, email: u.email, telefono: u.telefono ?? '', rol: u.rol, cuenta_cte: u.cuenta_cte ?? '', notas: u.notas ?? '' })
    setError(null); setClaveMsg(null); setModal('editar')
  }

  function handleNombreChange(nombre: string) {
    setForm(f => ({ ...f, nombre, email: generarEmail(nombre) }))
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setClaveMsg(data.clave_inicial)
  }

  async function handleEditar(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    const res = await fetch(`/api/admin/usuarios/${editando!.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: form.nombre, rol: form.rol,
        cuenta_cte: form.rol === 'cliente' ? form.cuenta_cte : null,
        telefono: form.telefono || null, notas: form.notas || null,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setUsuarios(prev => prev.map(u => u.id === editando!.id
      ? { ...u, nombre: form.nombre, rol: form.rol, cuenta_cte: form.rol === 'cliente' ? form.cuenta_cte : null, telefono: form.telefono || null, notas: form.notas || null }
      : u))
    setModal(null)
  }

  async function restablecerClave(u: Usuario) {
    if (!confirm(`¿Restablecer la contraseña de ${u.nombre}? Volverá a ser "Cliente1234!" y deberá cambiarla al ingresar.`)) return
    const res = await fetch(`/api/admin/usuarios/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_password: true }),
    })
    if (res.ok) alert(`✓ Contraseña restablecida. La nueva contraseña es: Cliente1234!`)
  }

  async function toggleActivo(u: Usuario) {
    if (!confirm(`¿${u.activo ? 'Suspender' : 'Activar'} la cuenta de ${u.nombre}?`)) return
    const res = await fetch(`/api/admin/usuarios/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !u.activo }),
    })
    if (res.ok) setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, activo: !x.activo } : x))
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-500 text-sm mt-1">{usuarios.length} usuarios registrados</p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary">+ Nuevo usuario</button>
      </div>

      <div className="card overflow-hidden">
        {/* Mobile */}
        <div className="md:hidden divide-y divide-gray-100">
          {usuarios.map(u => (
            <div key={u.id} className={`p-4 ${!u.activo ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p className="font-medium text-gray-900">{u.nombre}</p>
                  <p className="text-gray-500 text-xs">{u.email}</p>
                  {u.telefono && <p className="text-gray-400 text-xs">{u.telefono}</p>}
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ml-2 ${ROL_COLORS[u.rol] ?? 'bg-gray-100'}`}>
                  {ROL_LABELS[u.rol] ?? u.rol}
                </span>
              </div>
              {u.cuenta_cte && <p className="text-xs text-gray-500 mb-1">Cuenta: {u.cuenta_cte}</p>}
              {u.notas && <p className="text-xs text-gray-400 italic mb-2">{u.notas}</p>}
              <div className="flex gap-2 flex-wrap mt-2">
                <button onClick={() => abrirEditar(u)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600">Editar</button>
                <button onClick={() => restablecerClave(u)} className="text-xs px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 text-blue-600">Restablecer contraseña</button>
                <button onClick={() => toggleActivo(u)} className={`text-xs px-2 py-1 rounded border ${u.activo ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                  {u.activo ? 'Suspender' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cuenta corriente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {usuarios.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.telefono ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROL_COLORS[u.rol] ?? 'bg-gray-100'}`}>
                      {ROL_LABELS[u.rol] ?? u.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.cuenta_cte ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.activo ? 'Activo' : 'Suspendido'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => abrirEditar(u)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600">Editar</button>
                      <button onClick={() => restablecerClave(u)} className="text-xs px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 text-blue-600">Restablecer contraseña</button>
                      <button onClick={() => toggleActivo(u)} className={`text-xs px-2 py-1 rounded border ${u.activo ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                        {u.activo ? 'Suspender' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo */}
      {modal === 'nuevo' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-900">Nuevo usuario</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {claveMsg ? (
              <div className="p-6 space-y-4">
                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm font-semibold text-green-800 mb-2">✓ Usuario creado correctamente</p>
                  <p className="text-sm text-green-700 mb-3">Compartí estas credenciales con el cliente:</p>
                  <div className="bg-white rounded border border-green-200 p-3 space-y-2">
                    <div>
                      <p className="text-xs text-gray-500">Email de acceso:</p>
                      <p className="font-mono text-sm font-bold text-gray-900">{form.email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Contraseña inicial:</p>
                      <p className="font-mono text-lg font-bold text-gray-900">{claveMsg}</p>
                    </div>
                  </div>
                  <p className="text-xs text-green-600 mt-3">⚠️ El cliente deberá cambiarla en su primer acceso.</p>
                </div>
                <button onClick={() => { setModal(null); setClaveMsg(null); window.location.reload() }} className="btn-primary w-full">Cerrar</button>
              </div>
            ) : (
              <form onSubmit={handleCrear} className="p-6 space-y-4">
                <div>
                  <label className="label">Nombre completo *</label>
                  <input type="text" className="input" required
                    value={form.nombre} onChange={e => handleNombreChange(e.target.value)}
                    placeholder="ej: Leo Holcman" />
                </div>
                <div>
                  <label className="label">Email de acceso</label>
                  <input type="email" className="input" required
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="se genera automáticamente" />
                  <p className="text-xs text-gray-400 mt-1">Generado automáticamente, podés editarlo</p>
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input type="text" className="input" placeholder="ej: +54 11 1234-5678"
                    value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Rol *</label>
                  <select className="input" value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value, cuenta_cte: '' }))}>
                    <option value="cliente">Cliente</option>
                    <option value="operador">Operador</option>
                    <option value="superusuario">Superusuario</option>
                  </select>
                </div>
                {form.rol === 'cliente' && (
                  <div>
                    <label className="label">Cuenta corriente *</label>
                    <select className="input" required value={form.cuenta_cte} onChange={e => setForm(f => ({ ...f, cuenta_cte: e.target.value }))}>
                      <option value="">Seleccionar cuenta...</option>
                      {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="label">Notas internas</label>
                  <textarea className="input h-20 resize-none" placeholder="Observaciones..."
                    value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
                  🔐 La contraseña inicial será <strong>Cliente1234!</strong> — el cliente deberá cambiarla en su primer acceso.
                </div>
                {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
                <div className="flex gap-3">
                  <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Creando...' : 'Crear usuario'}</button>
                  <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {modal === 'editar' && editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-900">Editar usuario</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleEditar} className="p-6 space-y-4">
              <div>
                <label className="label">Email</label>
                <input type="email" className="input bg-gray-50" value={form.email} disabled />
                <p className="text-xs text-gray-400 mt-1">El email no se puede modificar</p>
              </div>
              <div>
                <label className="label">Nombre completo *</label>
                <input type="text" className="input" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="label">Teléfono</label>
                <input type="text" className="input" placeholder="ej: +54 11 1234-5678"
                  value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
              <div>
                <label className="label">Rol *</label>
                <select className="input" value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value, cuenta_cte: '' }))}>
                  <option value="cliente">Cliente</option>
                  <option value="operador">Operador</option>
                  <option value="superusuario">Superusuario</option>
                </select>
              </div>
              {form.rol === 'cliente' && (
                <div>
                  <label className="label">Cuenta corriente *</label>
                  <select className="input" required value={form.cuenta_cte} onChange={e => setForm(f => ({ ...f, cuenta_cte: e.target.value }))}>
                    <option value="">Seleccionar cuenta...</option>
                    {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Notas internas</label>
                <textarea className="input h-20 resize-none" placeholder="Observaciones..."
                  value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
              {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Guardando...' : 'Guardar cambios'}</button>
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
EOF

# Agregar columna telefono al tipo Profile si no existe
cat >> src/lib/supabase/types.ts << 'EOF'

// Extender Profile con campo telefono
declare module './types' {
  interface Profile {
    telefono?: string | null
  }
}
EOF

echo ""
echo "✅ Gestión de usuarios actualizada"
echo ""
echo "Ejecutá:"
echo "  git add ."
echo "  git commit -m 'usuarios: clave inicial, forzar cambio, telefono, restablecer'"
echo "  git push"
