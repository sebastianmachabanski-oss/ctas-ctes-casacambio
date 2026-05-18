#!/bin/bash
set -e

echo "📱 Aplicando cambios responsive y de título..."

# ── Login page ────────────────────────────────────────────────────
cat > src/app/login/page.tsx << 'EOF'
'use client'
import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email o contraseña incorrectos.'); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 px-4 py-8">
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
              <input id="password" type="password" className="input" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
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

# ── Layout metadata ───────────────────────────────────────────────
cat > src/app/layout.tsx << 'EOF'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Cuentas Corrientes',
  description: 'Portal de cuenta corriente',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
EOF

# ── Sidebar responsive con hamburger menu en mobile ───────────────
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
  ],
  operador: [
    { href: '/dashboard/cuenta-corriente', label: 'Cuentas Corrientes', icon: '📋' },
  ],
  cliente: [
    { href: '/dashboard/cuenta-corriente', label: 'Mi cuenta',          icon: '📋' },
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
      {/* Header */}
      <div className="p-4 border-b border-brand-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            CC
          </div>
          <div className="overflow-hidden">
            <p className="text-white text-sm font-semibold truncate">Cuentas Corrientes</p>
            <p className="text-brand-300 text-xs capitalize">{profile.rol}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {items.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-brand-700 text-white font-medium'
                  : 'text-brand-200 hover:bg-brand-800 hover:text-white'
              }`}>
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
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
      {/* Mobile: top bar con hamburger */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-brand-900 flex items-center justify-between px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white text-xs font-bold">CC</div>
          <span className="text-white text-sm font-semibold">Cuentas Corrientes</span>
        </div>
        <button onClick={() => setOpen(!open)}
          className="text-white p-1 rounded-lg hover:bg-brand-700 transition-colors">
          {open ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile: drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute top-0 left-0 bottom-0 w-64 bg-brand-900 flex flex-col pt-14"
            onClick={e => e.stopPropagation()}>
            <NavContent />
          </div>
        </div>
      )}

      {/* Desktop: sidebar fijo */}
      <aside className="hidden md:flex w-56 bg-brand-900 flex-col h-full shrink-0">
        <NavContent />
      </aside>
    </>
  )
}
EOF

# ── Dashboard layout con padding mobile ──────────────────────────
cat > src/app/dashboard/layout.tsx << 'EOF'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar profile={profile as any} />
      {/* pt-14 en mobile para compensar el top bar fijo */}
      <main className="flex-1 overflow-y-auto bg-gray-50 pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
EOF

# ── Cuenta corriente page responsive ─────────────────────────────
cat > src/app/dashboard/cuenta-corriente/page.tsx << 'EOF'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FiltrosMovimientos from '@/components/cuenta-corriente/FiltrosMovimientos'
import TablaMovimientos from '@/components/cuenta-corriente/TablaMovimientos'
import TarjetasSaldos from '@/components/cuenta-corriente/TarjetasSaldos'

export default async function CuentaCorrientePage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; concepto?: string; operacion?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles').select('rol, cuenta_cte, nombre').eq('id', user.id).single()
  const profile = profileData as { rol: string; cuenta_cte: string | null; nombre: string } | null
  if (!profile) redirect('/login')

  const cuentaCte = profile.rol === 'cliente' ? profile.cuenta_cte : null

  if (profile.rol === 'cliente' && !cuentaCte) {
    return (
      <div className="p-4 md:p-8">
        <div className="card p-6 text-center text-gray-500">
          Tu cuenta no está configurada. Contactá al administrador.
        </div>
      </div>
    )
  }

  let saldosQuery = supabase.from('saldos_cuenta_corriente').select('*')
  if (cuentaCte) saldosQuery = saldosQuery.eq('cuenta_cte', cuentaCte)
  const { data: saldosData } = await saldosQuery
  const saldos = (saldosData ?? []) as any[]

  const { desde, hasta, concepto, operacion } = searchParams
  let movimientos: any[] = []
  let totalMovimientos = 0

  if (desde && hasta) {
    let query = supabase.from('diario').select('*', { count: 'exact' })
      .eq('tipo', 'CTA CTE').eq('anulado', false)
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false })
    if (cuentaCte) query = query.eq('cuenta_cte', cuentaCte)
    if (concepto) query = query.ilike('concepto', `%${concepto}%`)
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
        {cuentaCte && <p className="text-gray-500 text-sm mt-1">{cuentaCte}</p>}
      </div>
      <TarjetasSaldos saldos={saldos} cuentaCte={cuentaCte} />
      <div className="card p-4 md:p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Filtrar movimientos</h2>
        <FiltrosMovimientos
          tiposOperacion={tiposOp}
          valoresIniciales={{
            desde: desde ?? '', hasta: hasta ?? '',
            concepto: concepto ?? '', operacion: operacion ?? ''
          }}
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

# ── Filtros responsive ────────────────────────────────────────────
cat > src/components/cuenta-corriente/FiltrosMovimientos.tsx << 'EOF'
'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'

interface Props {
  tiposOperacion: { codigo: string; descripcion: string }[]
  valoresIniciales: { desde: string; hasta: string; concepto: string; operacion: string }
}

export default function FiltrosMovimientos({ tiposOperacion, valoresIniciales }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [desde, setDesde] = useState(valoresIniciales.desde)
  const [hasta, setHasta] = useState(valoresIniciales.hasta)
  const [concepto, setConcepto] = useState(valoresIniciales.concepto)
  const [operacion, setOperacion] = useState(valoresIniciales.operacion)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!desde || !hasta) return
    const params = new URLSearchParams()
    params.set('desde', desde)
    params.set('hasta', hasta)
    if (concepto) params.set('concepto', concepto)
    if (operacion) params.set('operacion', operacion)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* 1 col en mobile, 2 en sm, 4 en lg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <label className="label" htmlFor="concepto">Concepto</label>
          <input id="concepto" type="text" className="input" placeholder="ej: DONACIONES"
            value={concepto} onChange={e => setConcepto(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="operacion">Tipo de operación</label>
          <select id="operacion" className="input" value={operacion}
            onChange={e => setOperacion(e.target.value)}>
            <option value="">Todas</option>
            {tiposOperacion.map(t => <option key={t.codigo} value={t.codigo}>{t.descripcion}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" className="btn-primary flex-1 sm:flex-none">
          Buscar
        </button>
        <button type="button" className="btn-secondary"
          onClick={() => { setDesde(''); setHasta(''); setConcepto(''); setOperacion(''); router.push(pathname) }}>
          Limpiar
        </button>
      </div>
    </form>
  )
}
EOF

# ── Tabla responsive con scroll horizontal ────────────────────────
cat > src/components/cuenta-corriente/TablaMovimientos.tsx << 'EOF'
'use client'

type DiarioRow = {
  id: string; fecha: string; cuenta_cte: string; operacion: string
  concepto: string | null; evento: string | null
  cc_dolares: number | null; cc_pesos: number | null
  cc_euros: number | null; cc_reales: number | null
}

function fmt(v: number | null, sym: string) {
  if (!v || v === 0) return null
  const n = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(Math.abs(v))
  return { text: `${sym} ${n}`, ingreso: v < 0 }
}

// Vista mobile: cards en lugar de tabla
function MovimientoCard({ m }: { m: DiarioRow }) {
  const cols = [
    { key: 'cc_dolares' as const, sym: 'U$S' },
    { key: 'cc_pesos' as const, sym: '$' },
    { key: 'cc_euros' as const, sym: '€' },
    { key: 'cc_reales' as const, sym: 'R$' },
  ]
  const montos = cols.map(c => ({ ...c, v: fmt(m[c.key], c.sym) })).filter(c => c.v)

  return (
    <div className="p-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-gray-900 text-sm">{m.cuenta_cte}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
            {m.evento ? ` · ${m.evento}` : ''}
          </p>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ml-2 ${
          m.operacion === 'DONACION' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
        }`}>{m.operacion}</span>
      </div>
      {m.concepto && <p className="text-gray-500 text-xs mb-2">{m.concepto}</p>}
      <div className="flex flex-wrap gap-2">
        {montos.map(({ key, v }) => v && (
          <span key={key} className={`text-sm font-medium ${v.ingreso ? 'text-green-600' : 'text-orange-600'}`}>
            {v.ingreso ? '+' : '-'}{v.text}
          </span>
        ))}
        {montos.length === 0 && <span className="text-gray-400 text-xs">Sin impacto monetario</span>}
      </div>
    </div>
  )
}

export default function TablaMovimientos({ movimientos }: { movimientos: DiarioRow[] }) {
  if (!movimientos.length) {
    return <div className="px-5 py-12 text-center text-gray-400 text-sm">No hay movimientos para los filtros seleccionados</div>
  }

  const cols = [
    { key: 'cc_dolares' as const, sym: 'U$S', label: 'Dólares' },
    { key: 'cc_pesos' as const, sym: '$', label: 'Pesos' },
    { key: 'cc_euros' as const, sym: '€', label: 'Euros' },
    { key: 'cc_reales' as const, sym: 'R$', label: 'Reales' },
  ]

  return (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden">
        {movimientos.map(m => <MovimientoCard key={m.id} m={m} />)}
      </div>

      {/* Desktop: tabla */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cuenta</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Operación</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Concepto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Evento</th>
              {cols.map(c => <th key={c.key} className="text-right px-4 py-3 font-medium text-gray-600">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {movimientos.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate">{m.cuenta_cte}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    m.operacion === 'DONACION' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>{m.operacion}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{m.concepto ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{m.evento ?? '—'}</td>
                {cols.map(c => {
                  const v = fmt(m[c.key], c.sym)
                  return (
                    <td key={c.key} className="px-4 py-3 text-right tabular-nums">
                      {v
                        ? <span className={v.ingreso ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>{v.ingreso ? '+' : '-'}{v.text}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
EOF

# ── Tarjetas responsive ───────────────────────────────────────────
cat > src/components/cuenta-corriente/TarjetasSaldos.tsx << 'EOF'
type Saldo = {
  cuenta_cte: string; saldo_pesos: number | null; saldo_dolares: number | null
  saldo_euros: number | null; saldo_reales: number | null
}
interface Props { saldos: Saldo[]; cuentaCte: string | null }

const MONEDAS = [
  { key: 'saldo_dolares' as const, label: 'Dólares', sym: 'U$S', color: 'bg-green-50 border-green-200 text-green-900' },
  { key: 'saldo_pesos'   as const, label: 'Pesos',   sym: '$',   color: 'bg-blue-50 border-blue-200 text-blue-900'    },
  { key: 'saldo_euros'   as const, label: 'Euros',   sym: '€',   color: 'bg-purple-50 border-purple-200 text-purple-900' },
  { key: 'saldo_reales'  as const, label: 'Reales',  sym: 'R$',  color: 'bg-orange-50 border-orange-200 text-orange-900' },
]

export default function TarjetasSaldos({ saldos }: Props) {
  const t = saldos.reduce((a, s) => ({
    saldo_pesos:   (a.saldo_pesos   ?? 0) + (s.saldo_pesos   ?? 0),
    saldo_dolares: (a.saldo_dolares ?? 0) + (s.saldo_dolares ?? 0),
    saldo_euros:   (a.saldo_euros   ?? 0) + (s.saldo_euros   ?? 0),
    saldo_reales:  (a.saldo_reales  ?? 0) + (s.saldo_reales  ?? 0),
  }), { saldo_pesos: 0, saldo_dolares: 0, saldo_euros: 0, saldo_reales: 0 })

  const conSaldo = MONEDAS.filter(m => (t[m.key] ?? 0) !== 0)
  const mostrar = conSaldo.length > 0 ? conSaldo : MONEDAS.slice(0, 2)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {mostrar.map(m => {
        const v = t[m.key] ?? 0
        const n = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(Math.abs(v))
        return (
          <div key={m.key} className={`card border p-3 md:p-4 ${m.color}`}>
            <p className="text-xs font-medium opacity-70 uppercase tracking-wide mb-1">{m.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-medium opacity-60">{m.sym}</span>
              <span className="text-xl md:text-2xl font-bold">{n}</span>
            </div>
            <p className="text-xs opacity-60 mt-1">
              {v < 0 ? 'A tu favor' : v > 0 ? 'Saldo pendiente' : 'Sin movimientos'}
            </p>
          </div>
        )
      })}
    </div>
  )
}
EOF

echo ""
echo "✅ Cambios responsive aplicados"
echo ""
echo "Ejecutá:"
echo "  git add ."
echo "  git commit -m 'responsive mobile + titulo Cuentas Corrientes'"
echo "  git push"
