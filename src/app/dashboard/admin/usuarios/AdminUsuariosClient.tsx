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

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Invitacion para WhatsApp</p>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                    {`Bienvenido al sistema de cuentas corrientes

Para ingresar visita: https://ctas-ctes.netlify.app/

Accede con las siguientes credenciales:
Usuario: ${form.email}
Contrasena: ${claveMsg}

Al ingresar por primera vez deberas cambiar tu contrasena.`}
                  </div>
                  <button
                    onClick={() => {
                      const msg = "Bienvenido al sistema de cuentas corrientes\n\nPara ingresar visita: https://ctas-ctes.netlify.app/\n\nAccede con las siguientes credenciales:\nUsuario: " + form.email + "\nContrasena: " + claveMsg + "\n\nAl ingresar por primera vez deberas cambiar tu contrasena."
                      navigator.clipboard.writeText(msg).then(() => alert("Copiado al portapapeles")).catch(() => alert("No se pudo copiar"))
                    }}
                    className="btn-secondary w-full flex items-center justify-center gap-2">
                    Copiar invitacion
                  </button>
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
