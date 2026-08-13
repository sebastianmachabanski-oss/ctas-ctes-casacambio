'use client'
import { useState } from 'react'

type Usuario = {
  id: string; email: string; nombre: string; rol: string
  activo: boolean; cuenta_cte: string | null
  telefono: string | null; notas: string | null; created_at: string
  ve_ganancias?: boolean
}
interface Props { usuariosIniciales: Usuario[]; cuentas: string[] }

const ROL_LABELS: Record<string, string> = { superusuario: 'Superusuario', operador: 'Operador', cliente: 'Cliente' }
// Tags de rol con los colores del mockup: superusuario azul, operador gris, cliente verde.
const ROL_COLORS: Record<string, string> = {
  superusuario: 'tag tag-blue',
  operador: 'tag tag-gray',
  cliente: 'tag tag-green',
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
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const [claveMsg, setClaveMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', rol: 'cliente', cuenta_cte: '', notas: '' })

  function abrirNuevo() {
    setEditando(null)
    setForm({ nombre: '', email: '', telefono: '', rol: 'cliente', cuenta_cte: '', notas: '' })
    setError(null); setClaveMsg(null); setModal('nuevo')
  }

  const [veGanancias, setVeGanancias] = useState(false)

  function abrirEditar(u: Usuario) {
    setEditando(u)
    setForm({ nombre: u.nombre, email: u.email, telefono: u.telefono ?? '', rol: u.rol, cuenta_cte: u.cuenta_cte ?? '', notas: u.notas ?? '' })
    setVeGanancias(u.ve_ganancias ?? false)
    setError(null); setClaveMsg(null); setModal('editar')
  }

  function handleNombreChange(nombre: string) {
    setForm(f => ({ ...f, nombre, email: generarEmail(nombre) }))
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null); setDebugInfo(null)
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error)
      setDebugInfo(data.debug ? JSON.stringify(data.debug, null, 2) : null)
      return
    }
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
        ve_ganancias: form.rol === 'cliente' ? false : veGanancias,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setUsuarios(prev => prev.map(u => u.id === editando!.id
      ? { ...u, nombre: form.nombre, rol: form.rol, cuenta_cte: form.rol === 'cliente' ? form.cuenta_cte : null, telefono: form.telefono || null, notas: form.notas || null, ve_ganancias: form.rol === 'cliente' ? false : veGanancias }
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

  async function eliminarUsuario(u: Usuario) {
    if (!confirm(`Eliminar DEFINITIVAMENTE la cuenta de ${u.nombre}? Esta accion no se puede deshacer.`)) return
    if (!confirm(`Confirma: Eliminar a ${u.nombre}?`)) return
    const res = await fetch(`/api/admin/usuarios/${u.id}`, { method: "DELETE" })
    if (res.ok) { setUsuarios(prev => prev.filter(x => x.id !== u.id)) }
    else { const data = await res.json(); alert("Error: " + data.error) }
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
        <p className="text-gray-500 text-sm">{usuarios.length} usuarios registrados</p>
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
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  <span title={u.activo ? 'Activo' : 'Suspendido'} className={`inline-block w-2.5 h-2.5 rounded-full ${u.activo ? 'bg-green-500' : 'bg-red-400'}`} />
                  <span className={ROL_COLORS[u.rol] ?? 'tag tag-gray'}>
                    {ROL_LABELS[u.rol] ?? u.rol}
                  </span>
                  {u.ve_ganancias && <span title="Acceso a Ganancias (superadmin)">💰</span>}
                </div>
              </div>
              {u.cuenta_cte && <p className="text-xs text-gray-500 mb-1">Cuenta: {u.cuenta_cte}</p>}
              {u.notas && <p className="text-xs text-gray-400 italic mb-2">{u.notas}</p>}
              <div className="flex gap-2 flex-wrap mt-2">
                <button onClick={() => abrirEditar(u)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  Editar
                </button>
                <button onClick={() => restablecerClave(u)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                  Clave
                </button>
                <button onClick={() => toggleActivo(u)} className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${u.activo ? 'bg-red-50 hover:bg-red-100 text-red-700' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}>
                  {u.activo
                    ? <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>Suspender</>
                    : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Activar</>
                  }
                </button>
                <button onClick={() => eliminarUsuario(u)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-700 font-medium transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop */}
        <div className="hidden md:block">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-400">
                <th className="text-left px-3 py-3 font-semibold w-[28%]">Nombre</th>
                <th className="text-left px-3 py-3 font-semibold w-[12%]">Teléfono</th>
                <th className="text-left px-3 py-3 font-semibold w-[12%]">Rol</th>
                <th className="text-left px-3 py-3 font-semibold w-[16%]">Cuenta cte.</th>
                <th className="text-center px-3 py-3 font-semibold w-[8%]">Estado</th>
                <th className="text-center px-3 py-3 font-semibold w-[24%]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {usuarios.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.activo ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-3">
                    <p className="font-medium text-gray-900 truncate">{u.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  </td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{u.telefono ?? '—'}</td>
                  <td className="px-3 py-3">
                    <span className={ROL_COLORS[u.rol] ?? 'tag tag-gray'}>
                      {ROL_LABELS[u.rol] ?? u.rol}
                    </span>
                    {u.ve_ganancias && <span className="ml-1" title="Acceso a Ganancias (superadmin)">💰</span>}
                  </td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{u.cuenta_cte ?? '—'}</td>
                  <td className="px-3 py-3 text-center">
                    <span
                      title={u.activo ? 'Activo' : 'Suspendido'}
                      className={`inline-block w-3 h-3 rounded-full ${u.activo ? 'bg-green-500' : 'bg-red-400'}`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => abrirEditar(u)} title="Editar usuario" className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => restablecerClave(u)} title="Restablecer contraseña" className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                      </button>
                      <button onClick={() => toggleActivo(u)} title={u.activo ? 'Suspender usuario' : 'Activar usuario'} className={`p-1.5 rounded-md transition-colors ${u.activo ? 'text-orange-500 hover:bg-orange-50 hover:text-orange-700' : 'text-green-500 hover:bg-green-50 hover:text-green-700'}`}>
                        {u.activo
                          ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                          : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        }
                      </button>
                      <button onClick={() => eliminarUsuario(u)} title="Eliminar usuario" className="p-1.5 rounded-md text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
                  <p className="text-sm font-semibold text-green-800 mb-1">✓ Usuario creado correctamente</p>
                  <p className="text-xs text-green-600 mt-2">⚠️ El cliente deberá cambiar su contraseña en el primer acceso.</p>
                </div>
                <button
                  onClick={() => {
                    const msg = "Bienvenido al sistema de casa de cambio\n\nPara ingresar visita: https://mictacte.netlify.app/\n\nAccede con las siguientes credenciales:\nUsuario: " + form.email + "\nContrasena: " + claveMsg + "\n\nAl ingresar por primera vez deberas cambiar tu contrasena."
                    navigator.clipboard.writeText(msg).then(() => alert("Copiado al portapapeles")).catch(() => alert("No se pudo copiar"))
                  }}
                  className="btn-secondary w-full flex items-center justify-center gap-2">
                  Copiar invitación
                </button>
                <button onClick={() => { setModal(null); setClaveMsg(null); window.location.reload() }} className="btn-primary w-full">Cerrar</button>
              </div>
            ) : (
              <form onSubmit={handleCrear} className="p-6 space-y-4">
                <div>
                  <label className="label">Nombre completo *</label>
                  <input type="text" className="input" required
                    value={form.nombre} onChange={e => handleNombreChange(e.target.value)}
                    placeholder="ej: Juan Perez" />
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
                {debugInfo && (
                  <pre className="p-3 rounded-lg bg-gray-900 text-green-300 text-[10px] leading-tight overflow-auto max-h-60 whitespace-pre-wrap break-all">{debugInfo}</pre>
                )}
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
              {form.rol !== 'cliente' && (
                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-purple-600"
                    checked={veGanancias} onChange={e => setVeGanancias(e.target.checked)} />
                  <span className="text-sm">
                    <span className="font-medium text-gray-900">💰 Acceso a Ganancias (superadmin)</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Permiso individual, independiente del rol: habilita el módulo de resultados del negocio.
                    </span>
                  </span>
                </label>
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
