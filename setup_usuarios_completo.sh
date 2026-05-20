#!/bin/bash
set -e

echo "🔧 Implementando gestión completa de usuarios..."

mkdir -p src/app/dashboard/admin/usuarios
mkdir -p src/app/dashboard/mi-cuenta
mkdir -p src/app/api/admin/usuarios
mkdir -p "src/app/api/admin/usuarios/[id]"
mkdir -p src/app/api/mi-cuenta

# ══════════════════════════════════════════════════════════════════
# API: Admin — crear usuario con clave automática
# ══════════════════════════════════════════════════════════════════
cat > src/app/api/admin/usuarios/route.ts << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function generarClave(): string {
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minus = 'abcdefghjkmnpqrstuvwxyz'
  const nums  = '23456789'
  const esp   = '!@#$%&*'
  const todos = mayus + minus + nums + esp
  let pass = [
    mayus[Math.floor(Math.random() * mayus.length)],
    minus[Math.floor(Math.random() * minus.length)],
    nums [Math.floor(Math.random() * nums.length)],
    esp  [Math.floor(Math.random() * esp.length)],
  ]
  for (let i = 0; i < 6; i++) pass.push(todos[Math.floor(Math.random() * todos.length)])
  return pass.sort(() => Math.random() - 0.5).join('')
}

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

  const { email, nombre, rol, cuenta_cte } = await request.json()
  if (!email || !nombre || !rol) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  const clave = generarClave()

  const { data, error } = await supabase.rpc('crear_usuario_admin', {
    p_email: email, p_password: clave, p_nombre: nombre,
    p_rol: rol, p_cuenta_cte: cuenta_cte || null
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, clave_generada: clave, data })
}
EOF

# ══════════════════════════════════════════════════════════════════
# API: Admin — editar, suspender, cambiar clave por ID
# ══════════════════════════════════════════════════════════════════
cat > "src/app/api/admin/usuarios/[id]/route.ts" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function generarClave(): string {
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minus = 'abcdefghjkmnpqrstuvwxyz'
  const nums  = '23456789'
  const esp   = '!@#$%&*'
  const todos = mayus + minus + nums + esp
  let pass = [
    mayus[Math.floor(Math.random() * mayus.length)],
    minus[Math.floor(Math.random() * minus.length)],
    nums [Math.floor(Math.random() * nums.length)],
    esp  [Math.floor(Math.random() * esp.length)],
  ]
  for (let i = 0; i < 6; i++) pass.push(todos[Math.floor(Math.random() * todos.length)])
  return pass.sort(() => Math.random() - 0.5).join('')
}

async function isSuperusuario(supabase: any, userId: string) {
  const { data } = await supabase.from('profiles').select('rol').eq('id', userId).single()
  return data?.rol === 'superusuario'
}

// PATCH: editar datos O cambiar clave O suspender
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!await isSuperusuario(supabase, user.id)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()

  // Cambiar clave
  if (body.reset_password) {
    const nuevaClave = generarClave()
    const { error } = await supabase.rpc('admin_cambiar_clave', {
      p_user_id: params.id,
      p_nueva_clave: nuevaClave
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, nueva_clave: nuevaClave })
  }

  // Editar perfil
  const updates: Record<string, unknown> = {}
  if (body.nombre    !== undefined) updates.nombre    = body.nombre
  if (body.rol       !== undefined) updates.rol       = body.rol
  if (body.cuenta_cte !== undefined) updates.cuenta_cte = body.cuenta_cte
  if (body.activo    !== undefined) updates.activo    = body.activo
  if (body.notas     !== undefined) updates.notas     = body.notas

  const { error } = await supabase.from('profiles').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
EOF

# ══════════════════════════════════════════════════════════════════
# API: Cambio de clave del cliente (self-service)
# ══════════════════════════════════════════════════════════════════
cat > src/app/api/mi-cuenta/cambiar-clave/route.ts << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function validarClave(clave: string): string | null {
  if (clave.length < 8)          return 'Mínimo 8 caracteres'
  if (!/[A-Z]/.test(clave))      return 'Debe incluir al menos una mayúscula'
  if (!/[a-z]/.test(clave))      return 'Debe incluir al menos una minúscula'
  if (!/[0-9]/.test(clave))      return 'Debe incluir al menos un número'
  if (!/[!@#$%&*]/.test(clave))  return 'Debe incluir al menos un carácter especial (!@#$%&*)'
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

  const error_validacion = validarClave(clave_nueva)
  if (error_validacion)
    return NextResponse.json({ error: error_validacion }, { status: 400 })

  // Verificar clave actual reautenticando
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!, password: clave_actual
  })
  if (signInError)
    return NextResponse.json({ error: 'La clave actual es incorrecta' }, { status: 400 })

  // Actualizar clave
  const { error } = await supabase.auth.updateUser({ password: clave_nueva })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
EOF

# ══════════════════════════════════════════════════════════════════
# Página: Mi cuenta (cambio de clave)
# ══════════════════════════════════════════════════════════════════
cat > src/app/dashboard/mi-cuenta/page.tsx << 'EOF'
import CambiarClaveForm from './CambiarClaveForm'

export default function MiCuentaPage() {
  return (
    <div className="p-4 md:p-6 max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-gray-500 text-sm mt-1">Administrá tu acceso</p>
      </div>
      <CambiarClaveForm />
    </div>
  )
}
EOF

cat > src/app/dashboard/mi-cuenta/CambiarClaveForm.tsx << 'EOF'
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
EOF

# ══════════════════════════════════════════════════════════════════
# Página: Admin usuarios (con todas las funcionalidades)
# ══════════════════════════════════════════════════════════════════
cat > src/app/dashboard/admin/usuarios/page.tsx << 'EOF'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminUsuariosClient from './AdminUsuariosClient'

export default async function AdminUsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario') redirect('/dashboard')

  const { data: usuarios } = await supabase.from('profiles').select('*').order('nombre')
  const { data: cuentas } = await supabase.from('cuentas_corrientes').select('nombre').eq('activo', true).order('nombre')

  return (
    <AdminUsuariosClient
      usuariosIniciales={(usuarios as any[]) ?? []}
      cuentas={(cuentas ?? []).map((c: any) => c.nombre)}
    />
  )
}
EOF

cat > src/app/dashboard/admin/usuarios/AdminUsuariosClient.tsx << 'EOF'
'use client'
import { useState } from 'react'

type Usuario = {
  id: string; email: string; nombre: string; rol: string
  activo: boolean; cuenta_cte: string | null; notas: string | null; created_at: string
}

interface Props {
  usuariosIniciales: Usuario[]
  cuentas: string[]
}

const ROL_LABELS: Record<string, string> = {
  superusuario: 'Superusuario', operador: 'Operador', cliente: 'Cliente',
}
const ROL_COLORS: Record<string, string> = {
  superusuario: 'bg-purple-100 text-purple-700',
  operador: 'bg-blue-100 text-blue-700',
  cliente: 'bg-gray-100 text-gray-700',
}

export default function AdminUsuariosClient({ usuariosIniciales, cuentas }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[]>(usuariosIniciales)
  const [modal, setModal] = useState<'nuevo' | 'editar' | 'clave' | null>(null)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claveGenerada, setClaveGenerada] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', nombre: '', rol: 'cliente', cuenta_cte: '', notas: '' })

  function abrirNuevo() {
    setEditando(null)
    setForm({ email: '', nombre: '', rol: 'cliente', cuenta_cte: '', notas: '' })
    setError(null); setClaveGenerada(null)
    setModal('nuevo')
  }

  function abrirEditar(u: Usuario) {
    setEditando(u)
    setForm({ email: u.email, nombre: u.nombre, rol: u.rol, cuenta_cte: u.cuenta_cte ?? '', notas: u.notas ?? '' })
    setError(null); setClaveGenerada(null)
    setModal('editar')
  }

  function abrirResetClave(u: Usuario) {
    setEditando(u)
    setError(null); setClaveGenerada(null)
    setModal('clave')
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
    setClaveGenerada(data.clave_generada)
    window.location.reload()
  }

  async function handleEditar(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    const res = await fetch(`/api/admin/usuarios/${editando!.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: form.nombre, rol: form.rol,
        cuenta_cte: form.rol === 'cliente' ? form.cuenta_cte : null,
        notas: form.notas,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setUsuarios(prev => prev.map(u => u.id === editando!.id
      ? { ...u, nombre: form.nombre, rol: form.rol, cuenta_cte: form.rol === 'cliente' ? form.cuenta_cte : null, notas: form.notas }
      : u))
    setModal(null)
  }

  async function handleResetClave() {
    setLoading(true); setError(null)
    const res = await fetch(`/api/admin/usuarios/${editando!.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_password: true }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setClaveGenerada(data.nueva_clave)
  }

  async function toggleActivo(u: Usuario) {
    const accion = u.activo ? 'suspender' : 'activar'
    if (!confirm(`¿${accion === 'suspender' ? 'Suspender' : 'Activar'} la cuenta de ${u.nombre}?`)) return
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
        {/* Mobile: cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {usuarios.map(u => (
            <div key={u.id} className={`p-4 ${!u.activo ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-900">{u.nombre}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{u.email}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ml-2 ${ROL_COLORS[u.rol] ?? 'bg-gray-100 text-gray-700'}`}>
                  {ROL_LABELS[u.rol] ?? u.rol}
                </span>
              </div>
              {u.cuenta_cte && <p className="text-xs text-gray-500 mb-1">Cuenta: {u.cuenta_cte}</p>}
              {u.notas && <p className="text-xs text-gray-400 mb-2 italic">{u.notas}</p>}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => abrirEditar(u)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600">Editar</button>
                <button onClick={() => abrirResetClave(u)} className="text-xs px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 text-blue-600">Nueva clave</button>
                <button onClick={() => toggleActivo(u)} className={`text-xs px-2 py-1 rounded border ${u.activo ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                  {u.activo ? 'Suspender' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: tabla */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cuenta corriente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Notas</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {usuarios.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROL_COLORS[u.rol] ?? 'bg-gray-100 text-gray-700'}`}>
                      {ROL_LABELS[u.rol] ?? u.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.cuenta_cte ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate">{u.notas ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.activo ? 'Activo' : 'Suspendido'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => abrirEditar(u)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600">Editar</button>
                      <button onClick={() => abrirResetClave(u)} className="text-xs px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 text-blue-600">Clave</button>
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

      {/* ── Modal Nuevo usuario ── */}
      {modal === 'nuevo' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-900">Nuevo usuario</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {claveGenerada ? (
              <div className="p-6 space-y-4">
                <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm font-semibold text-green-800 mb-2">✓ Usuario creado correctamente</p>
                  <p className="text-sm text-green-700 mb-3">Compartí estas credenciales con el cliente:</p>
                  <div className="bg-white rounded border border-green-200 p-3">
                    <p className="text-xs text-gray-500">Contraseña inicial:</p>
                    <p className="text-lg font-mono font-bold text-gray-900 mt-1">{claveGenerada}</p>
                  </div>
                  <p className="text-xs text-green-600 mt-2">El cliente deberá cambiarla en su primer acceso.</p>
                </div>
                <button onClick={() => { setModal(null); setClaveGenerada(null) }} className="btn-primary w-full">Cerrar</button>
              </div>
            ) : (
              <form onSubmit={handleCrear} className="p-6 space-y-4">
                <div><label className="label">Email *</label><input type="email" className="input" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><label className="label">Nombre completo *</label><input type="text" className="input" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
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
                    <label className="label">Cuenta corriente</label>
                    <select className="input" value={form.cuenta_cte} onChange={e => setForm(f => ({ ...f, cuenta_cte: e.target.value }))}>
                      <option value="">Sin asignar</option>
                      {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <div><label className="label">Notas internas</label><textarea className="input h-20 resize-none" placeholder="Observaciones..." value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} /></div>
                <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">🔐 Se generará una contraseña segura automáticamente. Podés compartirla con el cliente para su primer acceso.</p>
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

      {/* ── Modal Editar ── */}
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
              <div><label className="label">Nombre completo *</label><input type="text" className="input" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
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
                  <label className="label">Cuenta corriente</label>
                  <select className="input" value={form.cuenta_cte} onChange={e => setForm(f => ({ ...f, cuenta_cte: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div><label className="label">Notas internas</label><textarea className="input h-20 resize-none" placeholder="Observaciones sobre este usuario..." value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} /></div>
              {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Guardando...' : 'Guardar cambios'}</button>
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Reset clave ── */}
      {modal === 'clave' && editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Nueva contraseña</h2>
              <button onClick={() => { setModal(null); setClaveGenerada(null) }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Se generará una nueva contraseña segura para <strong>{editando.nombre}</strong>.</p>
              {claveGenerada ? (
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-sm font-semibold text-blue-800 mb-2">✓ Contraseña actualizada</p>
                  <p className="text-sm text-blue-700 mb-3">Nueva contraseña para compartir:</p>
                  <div className="bg-white rounded border border-blue-200 p-3">
                    <p className="text-xs text-gray-500">Nueva contraseña:</p>
                    <p className="text-lg font-mono font-bold text-gray-900 mt-1">{claveGenerada}</p>
                  </div>
                </div>
              ) : (
                <>
                  {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
                  <div className="flex gap-3">
                    <button onClick={handleResetClave} className="btn-primary flex-1" disabled={loading}>
                      {loading ? 'Generando...' : '🔐 Generar nueva contraseña'}
                    </button>
                    <button onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
                  </div>
                </>
              )}
              {claveGenerada && (
                <button onClick={() => { setModal(null); setClaveGenerada(null) }} className="btn-secondary w-full">Cerrar</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
EOF

# ══════════════════════════════════════════════════════════════════
# Sidebar actualizado con "Mi cuenta" para todos los roles
# ══════════════════════════════════════════════════════════════════
cat > src/components/Sidebar.tsx << 'EOF'
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'

const navItems = {
  superusuario: [
    { href: '/dashboard/cuenta-corriente', label: 'Cuentas Corrientes', icon: '📋' },
    { href: '/dashboard/admin/usuarios',   label: 'Usuarios',           icon: '👥' },
    { href: '/dashboard/mi-cuenta',        label: 'Mi cuenta',          icon: '🔑' },
  ],
  operador: [
    { href: '/dashboard/cuenta-corriente', label: 'Cuentas Corrientes', icon: '📋' },
    { href: '/dashboard/mi-cuenta',        label: 'Mi cuenta',          icon: '🔑' },
  ],
  cliente: [
    { href: '/dashboard/cuenta-corriente', label: 'Mi cuenta corriente', icon: '📋' },
    { href: '/dashboard/mi-cuenta',        label: 'Cambiar contraseña',  icon: '🔑' },
  ],
}

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const items = navItems[profile.rol] ?? []

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const NavContent = () => (
    <>
      <div className="p-4 border-b border-brand-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white text-sm font-bold shrink-0">CC</div>
          <div className="overflow-hidden">
            <p className="text-white text-sm font-semibold truncate">Cuentas Corrientes</p>
            <p className="text-brand-300 text-xs capitalize">{profile.rol}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? 'bg-brand-700 text-white font-medium' : 'text-brand-200 hover:bg-brand-800 hover:text-white'}`}>
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t border-brand-700 space-y-1">
        <div className="px-3 py-2">
          <p className="text-brand-200 text-xs font-medium truncate">{profile.nombre}</p>
          <p className="text-brand-400 text-xs truncate">{profile.email}</p>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-brand-200 hover:bg-brand-800 hover:text-white transition-colors">
          <span>🚪</span><span>Salir</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-brand-900 flex items-center justify-between px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white text-xs font-bold">CC</div>
          <span className="text-white text-sm font-semibold">Cuentas Corrientes</span>
        </div>
        <button onClick={() => setOpen(!open)} className="text-white p-1 rounded-lg hover:bg-brand-700 transition-colors">
          {open
            ? <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          }
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute top-0 left-0 bottom-0 w-64 bg-brand-900 flex flex-col pt-14" onClick={e => e.stopPropagation()}>
            <NavContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-brand-900 flex-col h-full shrink-0">
        <NavContent />
      </aside>
    </>
  )
}
EOF

echo ""
echo "✅ Gestión de usuarios completa"
echo ""
echo "Ejecutá en Supabase SQL Editor la función admin_cambiar_clave"
echo "Luego:"
echo "  git add ."
echo "  git commit -m 'gestion usuarios: crear, editar, suspender, cambiar clave'"
echo "  git push"
