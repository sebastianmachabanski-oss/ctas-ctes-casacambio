#!/bin/bash
set -e

echo "🔧 Aplicando mejoras..."

# ══════════════════════════════════════════════════════════════════
# 1. Filtros sin campo Concepto
# 2. Selector de cuenta para admin/operador
# ══════════════════════════════════════════════════════════════════
cat > src/components/cuenta-corriente/FiltrosMovimientos.tsx << 'EOF'
'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  tiposOperacion: { codigo: string; descripcion: string }[]
  valoresIniciales: { desde: string; hasta: string; operacion: string; cuenta?: string }
  cuentas?: string[]
  esSuperusuarioOOperador?: boolean
}

export default function FiltrosMovimientos({ tiposOperacion, valoresIniciales, cuentas, esSuperusuarioOOperador }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [desde, setDesde] = useState(valoresIniciales.desde)
  const [hasta, setHasta] = useState(valoresIniciales.hasta)
  const [operacion, setOperacion] = useState(valoresIniciales.operacion)
  const [cuenta, setCuenta] = useState(valoresIniciales.cuenta ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!desde || !hasta) return
    const params = new URLSearchParams()
    params.set('desde', desde)
    params.set('hasta', hasta)
    if (operacion) params.set('operacion', operacion)
    if (cuenta) params.set('cuenta', cuenta)
    startTransition(() => { router.push(`${pathname}?${params.toString()}`) })
  }

  function handleLimpiar() {
    setDesde(''); setHasta(''); setOperacion(''); setCuenta('')
    startTransition(() => { router.push(pathname) })
  }

  return (
    <form onSubmit={handleSubmit}>
      {isPending && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg px-8 py-6 flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <p className="text-sm font-medium text-gray-700">Cargando movimientos...</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Selector de cuenta — solo para admin/operador */}
        {esSuperusuarioOOperador && cuentas && cuentas.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="label">Cuenta corriente</label>
            <select className="input" value={cuenta} onChange={e => setCuenta(e.target.value)}>
              <option value="">Todas las cuentas</option>
              {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="desde">Fecha desde *</label>
          <input id="desde" type="date" className="input" value={desde}
            onChange={e => setDesde(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Fecha hasta *</label>
          <input id="hasta" type="date" className="input" value={hasta}
            onChange={e => setHasta(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="operacion">Tipo de movimiento</label>
          <select id="operacion" className="input" value={operacion}
            onChange={e => setOperacion(e.target.value)}>
            <option value="">Todos</option>
            <option value="DONACION">Ingreso</option>
            <option value="COMPROMISO">Egreso</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div className="flex gap-3 w-full">
            <button type="submit" className="btn-primary flex-1" disabled={isPending}>
              Buscar
            </button>
            <button type="button" className="btn-secondary" disabled={isPending} onClick={handleLimpiar}>
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
EOF

# ══════════════════════════════════════════════════════════════════
# Página cuenta corriente con selector de cuenta para admin/operador
# ══════════════════════════════════════════════════════════════════
cat > src/app/dashboard/cuenta-corriente/page.tsx << 'EOF'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FiltrosMovimientos from '@/components/cuenta-corriente/FiltrosMovimientos'
import TablaMovimientos from '@/components/cuenta-corriente/TablaMovimientos'
import TarjetasSaldos from '@/components/cuenta-corriente/TarjetasSaldos'

export default async function CuentaCorrientePage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; operacion?: string; cuenta?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol, cuenta_cte, nombre').eq('id', user.id).single()
  const profile = profileData as { rol: string; cuenta_cte: string | null; nombre: string } | null
  if (!profile) redirect('/login')

  const esStaff = profile.rol === 'superusuario' || profile.rol === 'operador'
  const esCliente = profile.rol === 'cliente'

  // Para cliente: su cuenta fija. Para staff: la que eligió en el filtro (o null = todas)
  const cuentaFiltro = esCliente
    ? profile.cuenta_cte
    : searchParams.cuenta || null

  if (esCliente && !profile.cuenta_cte) {
    return (
      <div className="p-4 md:p-8">
        <div className="card p-6 text-center text-gray-500">
          Tu cuenta no está configurada. Contactá al administrador.
        </div>
      </div>
    )
  }

  // Saldos: filtrado por cuenta si se eligió una, o todos si no
  let saldosQuery = supabase.from('saldos_cuenta_corriente').select('*')
  if (cuentaFiltro) saldosQuery = saldosQuery.eq('cuenta_cte', cuentaFiltro)
  const { data: saldosData } = await saldosQuery
  const saldos = (saldosData ?? []) as any[]

  // Lista de cuentas para el selector (solo staff)
  let cuentasList: string[] = []
  if (esStaff) {
    const { data: cuentasData } = await supabase
      .from('cuentas_corrientes').select('nombre').eq('activo', true).order('nombre')
    cuentasList = (cuentasData ?? []).map((c: any) => c.nombre)
  }

  const { desde, hasta, operacion } = searchParams
  let movimientos: any[] = []
  let totalMovimientos = 0

  if (desde && hasta) {
    let query = supabase.from('diario').select('*', { count: 'exact' })
      .eq('tipo', 'CTA CTE').eq('anulado', false)
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (cuentaFiltro) query = query.eq('cuenta_cte', cuentaFiltro)
    if (operacion) query = query.eq('operacion', operacion)
    const { data, count } = await query
    movimientos = (data ?? []) as any[]
    totalMovimientos = count ?? 0
  }

  const { data: tiposData } = await supabase
    .from('tipos_operacion').select('codigo, descripcion').eq('activo', true)
  const tiposOp = (tiposData ?? []) as any[]

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Cuenta Corriente</h1>
        {esCliente && profile.cuenta_cte && (
          <p className="text-gray-500 text-sm mt-1">{profile.cuenta_cte}</p>
        )}
        {esStaff && cuentaFiltro && (
          <p className="text-gray-500 text-sm mt-1">{cuentaFiltro}</p>
        )}
        {esStaff && !cuentaFiltro && (
          <p className="text-gray-500 text-sm mt-1">Todas las cuentas</p>
        )}
      </div>

      <TarjetasSaldos saldos={saldos} cuentaCte={cuentaFiltro} />

      <div className="card p-4 md:p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Filtrar movimientos</h2>
        <FiltrosMovimientos
          tiposOperacion={tiposOp}
          valoresIniciales={{
            desde: desde ?? '',
            hasta: hasta ?? '',
            operacion: operacion ?? '',
            cuenta: searchParams.cuenta ?? '',
          }}
          cuentas={cuentasList}
          esSuperusuarioOOperador={esStaff}
        />
      </div>

      {desde && hasta ? (
        <div className="card">
          <div className="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Movimientos</h2>
            <span className="text-sm text-gray-500">{totalMovimientos} registro{totalMovimientos !== 1 ? 's' : ''}</span>
          </div>
          <TablaMovimientos movimientos={movimientos} />
        </div>
      ) : (
        <div className="card p-8 text-center">
          <div className="text-gray-400 text-sm">Seleccioná un rango de fechas para ver los movimientos</div>
        </div>
      )}
    </div>
  )
}
EOF

# ══════════════════════════════════════════════════════════════════
# 2. Sidebar: hamburger a la izquierda
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
      {/* Mobile top bar — hamburger a la IZQUIERDA */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-brand-900 flex items-center gap-3 px-4 py-3 shadow-lg">
        <button onClick={() => setOpen(!open)} className="text-white p-1 rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          {open
            ? <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          }
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white text-xs font-bold">CC</div>
          <span className="text-white text-sm font-semibold">Cuentas Corrientes</span>
        </div>
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

# ══════════════════════════════════════════════════════════════════
# 3. Login con botón ver/ocultar contraseña
# ══════════════════════════════════════════════════════════════════
cat > src/app/login/page.tsx << 'EOF'
'use client'
import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email o contraseña incorrectos.'); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-start justify-center bg-gradient-to-br from-brand-900 to-brand-700 px-4 pt-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Cuentas Corrientes</h1>
          <p className="text-brand-200 text-sm mt-1">Portal de cuenta corriente</p>
        </div>
        <div className="card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" placeholder="tu@email.com"
                value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">Contraseña</label>
              <div className="relative">
                <input id="password" type={showPass ? 'text' : 'password'} className="input pr-10"
                  placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
                <button type="button" onClick={() => setShowPass(!showPass)}
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
EOF

echo "✅ Todas las mejoras aplicadas"
echo ""
echo "Ejecutá:"
echo "  git add ."
echo "  git commit -m 'mejoras: sin concepto, hamburger izq, ver clave login, filtro cuenta staff'"
echo "  git push"
