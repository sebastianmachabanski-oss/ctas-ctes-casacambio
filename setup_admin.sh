#!/bin/bash
set -e

echo "📁 Creando panel de administración de usuarios..."

mkdir -p src/app/dashboard/admin/usuarios
mkdir -p src/app/api/admin/usuarios

# ── API Route: listar y crear usuarios ───────────────────────────
cat > src/app/api/admin/usuarios/route.ts << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET: listar todos los usuarios
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || profile.rol !== 'superusuario')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: crear nuevo usuario
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || profile.rol !== 'superusuario')
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  const { email, password, nombre, rol, cuenta_cte } = body

  if (!email || !password || !nombre || !rol)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  // Crear en auth.users via SQL
  const { data: newUser, error: createError } = await supabase.rpc('crear_usuario_admin', {
    p_email: email,
    p_password: password,
    p_nombre: nombre,
    p_rol: rol,
    p_cuenta_cte: cuenta_cte || null
  })

  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })
  return NextResponse.json({ success: true, data: newUser })
}
EOF

# ── API Route: editar y desactivar usuario por ID ─────────────────
mkdir -p src/app/api/admin/usuarios/\[id\]
cat > "src/app/api/admin/usuarios/[id]/route.ts" << 'EOF'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function checkSuperusuario(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || profile.rol !== 'superusuario') return null
  return user
}

// PATCH: editar usuario
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const admin = await checkSuperusuario(supabase)
  if (!admin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await request.json()
  const { nombre, rol, cuenta_cte, activo } = body

  const updates: Record<string, unknown> = {}
  if (nombre !== undefined) updates.nombre = nombre
  if (rol !== undefined) updates.rol = rol
  if (cuenta_cte !== undefined) updates.cuenta_cte = cuenta_cte
  if (activo !== undefined) updates.activo = activo

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE: desactivar usuario (baja lógica)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const admin = await checkSuperusuario(supabase)
  if (!admin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { error } = await supabase
    .from('profiles')
    .update({ activo: false })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
EOF

# ── Página admin usuarios ─────────────────────────────────────────
cat > src/app/dashboard/admin/usuarios/page.tsx << 'EOF'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminUsuariosClient from './AdminUsuariosClient'

export default async function AdminUsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || (profile as any).rol !== 'superusuario') redirect('/dashboard')

  const { data: usuarios } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: cuentas } = await supabase
    .from('cuentas_corrientes')
    .select('nombre')
    .eq('activo', true)
    .order('nombre')

  return (
    <AdminUsuariosClient
      usuariosIniciales={(usuarios as any[]) ?? []}
      cuentas={(cuentas ?? []).map((c: any) => c.nombre)}
    />
  )
}
EOF

# ── Componente cliente de administración ──────────────────────────
cat > src/app/dashboard/admin/usuarios/AdminUsuariosClient.tsx << 'EOF'
'use client'
import { useState } from 'react'

type Usuario = {
  id: string; email: string; nombre: string; rol: string
  activo: boolean; cuenta_cte: string | null; created_at: string
}

interface Props {
  usuariosIniciales: Usuario[]
  cuentas: string[]
}

const ROL_LABELS: Record<string, string> = {
  superusuario: 'Superusuario',
  operador: 'Operador',
  cliente: 'Cliente',
}
const ROL_COLORS: Record<string, string> = {
  superusuario: 'bg-purple-100 text-purple-700',
  operador: 'bg-blue-100 text-blue-700',
  cliente: 'bg-gray-100 text-gray-700',
}

export default function AdminUsuariosClient({ usuariosIniciales, cuentas }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[]>(usuariosIniciales)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    email: '', password: '', nombre: '', rol: 'cliente', cuenta_cte: ''
  })

  function abrirNuevo() {
    setEditando(null)
    setForm({ email: '', password: '', nombre: '', rol: 'cliente', cuenta_cte: '' })
    setError(null)
    setShowModal(true)
  }

  function abrirEditar(u: Usuario) {
    setEditando(u)
    setForm({ email: u.email, password: '', nombre: u.nombre, rol: u.rol, cuenta_cte: u.cuenta_cte ?? '' })
    setError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (editando) {
        // Editar
        const res = await fetch(`/api/admin/usuarios/${editando.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: form.nombre,
            rol: form.rol,
            cuenta_cte: form.rol === 'cliente' ? form.cuenta_cte : null,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setUsuarios(prev => prev.map(u => u.id === editando.id
          ? { ...u, nombre: form.nombre, rol: form.rol, cuenta_cte: form.rol === 'cliente' ? form.cuenta_cte : null }
          : u
        ))
        setSuccess('Usuario actualizado correctamente')
      } else {
        // Crear
        const res = await fetch('/api/admin/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setSuccess('Usuario creado. Puede demorar unos segundos en aparecer.')
        window.location.reload()
      }
      setShowModal(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleActivo(u: Usuario) {
    if (!confirm(`¿${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre}?`)) return
    const res = await fetch(`/api/admin/usuarios/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !u.activo }),
    })
    if (res.ok) {
      setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, activo: !x.activo } : x))
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-500 text-sm mt-1">{usuarios.length} usuarios registrados</p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary">
          + Nuevo usuario
        </button>
      </div>

      {/* Alertas */}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex justify-between">
          {success}
          <button onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {/* Tabla */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
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
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROL_COLORS[u.rol] ?? 'bg-gray-100 text-gray-700'}`}>
                      {ROL_LABELS[u.rol] ?? u.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.cuenta_cte ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => abrirEditar(u)}
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600">
                        Editar
                      </button>
                      <button onClick={() => toggleActivo(u)}
                        className={`text-xs px-2 py-1 rounded border ${u.activo ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {editando ? 'Editar usuario' : 'Nuevo usuario'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {!editando && (
                <div>
                  <label className="label">Email *</label>
                  <input type="email" className="input" required
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              )}
              {!editando && (
                <div>
                  <label className="label">Contraseña *</label>
                  <input type="password" className="input" required minLength={6}
                    value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="label">Nombre completo *</label>
                <input type="text" className="input" required
                  value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
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
                  <label className="label">Cuenta corriente</label>
                  <select className="input" value={form.cuenta_cte} onChange={e => setForm(f => ({ ...f, cuenta_cte: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Si la cuenta no aparece, creala primero en el maestro de clientes</p>
                </div>
              )}
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear usuario'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
EOF

echo "✅ Panel de admin creado"
echo ""
echo "Ahora ejecutá en Supabase SQL Editor la función crear_usuario_admin"
echo "Luego: git add . && git commit -m 'admin usuarios' && git push"
