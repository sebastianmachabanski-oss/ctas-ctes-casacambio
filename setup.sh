#!/bin/bash
set -e

SUPABASE_URL="https://ukrerhrwtthcmsegnifz.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcmVyaHJ3dHRoY21zZWduaWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODA0ODYsImV4cCI6MjA5NDM1NjQ4Nn0.POS-8jZfeco3g_-9bsevWTTajAbW0E3qUaYELfpHdBw"

echo "📦 Creando estructura del proyecto..."

cat > package.json << 'EOF'
{
  "name": "casa-cambio",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.1",
    "@supabase/supabase-js": "^2.45.4",
    "date-fns": "^3.6.0",
    "next": "14.2.15",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.0.1",
    "eslint": "^8",
    "eslint-config-next": "14.2.15",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}
EOF

cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {}
module.exports = nextConfig
EOF

cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc',
          500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e',
        },
      },
    },
  },
  plugins: [],
}
EOF

cat > postcss.config.js << 'EOF'
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }
EOF

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true, "skipLibCheck": true, "strict": true, "noEmit": true,
    "esModuleInterop": true, "module": "esnext", "moduleResolution": "bundler",
    "resolveJsonModule": true, "isolatedModules": true, "jsx": "preserve",
    "incremental": true, "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat > netlify.toml << 'EOF'
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
EOF

cat > .gitignore << 'EOF'
.env.local
.env*.local
node_modules/
.next/
out/
EOF

cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_KEY}
EOF

mkdir -p src/app/login
mkdir -p src/app/dashboard/cuenta-corriente
mkdir -p src/components/cuenta-corriente
mkdir -p src/lib/supabase

cat > src/app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body { @apply bg-gray-50 text-gray-900 antialiased; }
}

@layer components {
  .btn-primary {
    @apply inline-flex items-center justify-center px-4 py-2 rounded-lg
           bg-brand-600 text-white font-medium text-sm
           hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500
           disabled:opacity-50 disabled:cursor-not-allowed transition-colors;
  }
  .btn-secondary {
    @apply inline-flex items-center justify-center px-4 py-2 rounded-lg
           bg-white text-gray-700 font-medium text-sm border border-gray-300
           hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500
           disabled:opacity-50 disabled:cursor-not-allowed transition-colors;
  }
  .input {
    @apply block w-full rounded-lg border border-gray-300 bg-white px-3 py-2
           text-sm text-gray-900 placeholder-gray-400
           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
           disabled:bg-gray-100 disabled:cursor-not-allowed;
  }
  .label { @apply block text-sm font-medium text-gray-700 mb-1; }
  .card  { @apply bg-white rounded-xl border border-gray-200 shadow-sm; }
}
EOF

cat > src/app/layout.tsx << 'EOF'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
const inter = Inter({ subsets: ['latin'] })
export const metadata: Metadata = { title: 'Casa de Cambio', description: 'Portal de cuenta corriente' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body className={inter.className}>{children}</body></html>
}
EOF

cat > src/app/page.tsx << 'EOF'
import { redirect } from 'next/navigation'
export default function Home() { redirect('/dashboard') }
EOF

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
  if (pathname === '/login') {
    if (user) return NextResponse.redirect(new URL('/dashboard', request.url))
    return supabaseResponse
  }
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  const { data: profile } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single()
  if (!profile || !profile.activo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=cuenta_inactiva', request.url))
  }
  if (pathname.startsWith('/admin') && profile.rol !== 'superusuario')
    return NextResponse.redirect(new URL('/dashboard', request.url))
  return supabaseResponse
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
EOF

cat > src/lib/supabase/types.ts << 'EOF'
export type UserRole = 'superusuario' | 'operador' | 'cliente'
export interface Profile {
  id: string; email: string; nombre: string; rol: UserRole
  activo: boolean; cuenta_cte: string | null; created_at: string; updated_at: string
}
export interface DiarioRow {
  id: string; fecha: string; tipo: string; cuenta_cte: string
  operacion: string; concepto: string | null; evento: string | null
  detalle: string | null; recibo: string | null; moneda: string; monto: number
  cc_pesos: number | null; cc_dolares: number | null; cc_euros: number | null; cc_reales: number | null
  anulado: boolean; anulado_por: string | null; anulado_at: string | null
  motivo_anulacion: string | null; notas: string | null; creado_por: string | null
  created_at: string; updated_at: string
}
export interface SaldoCuentaCorriente {
  cuenta_cte: string; saldo_pesos: number | null; saldo_dolares: number | null
  saldo_euros: number | null; saldo_reales: number | null; ultimo_movimiento: string | null
}
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile,'created_at'|'updated_at'>; Update: Partial<Profile> }
      diario: { Row: DiarioRow; Insert: Omit<DiarioRow,'id'|'created_at'|'updated_at'>; Update: Partial<DiarioRow> }
    }
    Views: { saldos_cuenta_corriente: { Row: SaldoCuentaCorriente } }
    Functions: { get_my_role: { Returns: UserRole }; get_my_cuenta_cte: { Returns: string | null } }
  }
}
EOF

cat > src/lib/supabase/client.ts << 'EOF'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
EOF

cat > src/lib/supabase/server.ts << 'EOF'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
}
EOF

cat > src/app/login/page.tsx << 'EOF'
'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email o contraseña incorrectos.'); setLoading(false); return }
    router.push('/dashboard'); router.refresh()
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Casa de Cambio</h1>
          <p className="text-brand-200 text-sm mt-1">Portal de cuenta corriente</p>
        </div>
        <div className="card p-6">
          {searchParams.get('error') === 'cuenta_inactiva' && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Tu cuenta está inactiva. Contactá al administrador.
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" placeholder="tu@email.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="password">Contraseña</label>
              <input id="password" type="password" className="input" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
EOF

cat > src/components/Sidebar.tsx << 'EOF'
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'
const navItems = {
  superusuario: [{ href: '/dashboard/cuenta-corriente', label: 'Cuentas Corrientes', icon: '📋' }],
  operador: [{ href: '/dashboard/cuenta-corriente', label: 'Cuentas Corrientes', icon: '📋' }],
  cliente: [{ href: '/dashboard/cuenta-corriente', label: 'Mi cuenta', icon: '📋' }],
}
export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const items = navItems[profile.rol] ?? []
  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login'); router.refresh()
  }
  return (
    <aside className="w-56 bg-brand-900 flex flex-col h-full shrink-0">
      <div className="p-4 border-b border-brand-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white text-sm font-bold">CC</div>
          <div className="overflow-hidden">
            <p className="text-white text-sm font-semibold truncate">Casa de Cambio</p>
            <p className="text-brand-300 text-xs capitalize">{profile.rol}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-brand-700 text-white font-medium' : 'text-brand-200 hover:bg-brand-800 hover:text-white'}`}>
              <span>{item.icon}</span><span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t border-brand-700 space-y-2">
        <div className="px-3 py-2">
          <p className="text-brand-200 text-xs truncate">{profile.nombre}</p>
          <p className="text-brand-400 text-xs truncate">{profile.email}</p>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-brand-200 hover:bg-brand-800 hover:text-white transition-colors">
          <span>🚪</span><span>Salir</span>
        </button>
      </div>
    </aside>
  )
}
EOF

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
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
    </div>
  )
}
EOF

cat > src/app/dashboard/page.tsx << 'EOF'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile) redirect('/login')
  redirect('/dashboard/cuenta-corriente')
}
EOF

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
  const { data: profile } = await supabase.from('profiles').select('rol, cuenta_cte, nombre').eq('id', user.id).single()
  if (!profile) redirect('/login')
  const cuentaCte = profile.rol === 'cliente' ? profile.cuenta_cte : null
  if (profile.rol === 'cliente' && !cuentaCte) {
    return <div className="p-8"><div className="card p-6 text-center text-gray-500">Tu cuenta no está configurada. Contactá al administrador.</div></div>
  }
  let saldosQuery = supabase.from('saldos_cuenta_corriente').select('*')
  if (cuentaCte) saldosQuery = saldosQuery.eq('cuenta_cte', cuentaCte)
  const { data: saldos } = await saldosQuery
  const { desde, hasta, concepto, operacion } = searchParams
  let movimientos = null
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
    movimientos = data; totalMovimientos = count ?? 0
  }
  const { data: tiposOp } = await supabase.from('tipos_operacion').select('codigo, descripcion').eq('activo', true)
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cuenta Corriente</h1>
        {cuentaCte && <p className="text-gray-500 text-sm mt-1">{cuentaCte}</p>}
      </div>
      <TarjetasSaldos saldos={saldos ?? []} cuentaCte={cuentaCte} />
      <div className="card p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Filtrar movimientos</h2>
        <FiltrosMovimientos
          tiposOperacion={tiposOp ?? []}
          valoresIniciales={{ desde: desde ?? '', hasta: hasta ?? '', concepto: concepto ?? '', operacion: operacion ?? '' }}
        />
      </div>
      {desde && hasta ? (
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Movimientos</h2>
            <span className="text-sm text-gray-500">{totalMovimientos} registro{totalMovimientos !== 1 ? 's' : ''}</span>
          </div>
          <TablaMovimientos movimientos={movimientos ?? []} />
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
    params.set('desde', desde); params.set('hasta', hasta)
    if (concepto) params.set('concepto', concepto)
    if (operacion) params.set('operacion', operacion)
    router.push(`${pathname}?${params.toString()}`)
  }
  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="desde">Fecha desde *</label>
          <input id="desde" type="date" className="input" value={desde} onChange={e => setDesde(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="hasta">Fecha hasta *</label>
          <input id="hasta" type="date" className="input" value={hasta} onChange={e => setHasta(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="concepto">Concepto</label>
          <input id="concepto" type="text" className="input" placeholder="ej: DONACIONES" value={concepto} onChange={e => setConcepto(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="operacion">Tipo de operación</label>
          <select id="operacion" className="input" value={operacion} onChange={e => setOperacion(e.target.value)}>
            <option value="">Todas</option>
            {tiposOperacion.map(t => <option key={t.codigo} value={t.codigo}>{t.descripcion}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" className="btn-primary">Buscar movimientos</button>
        <button type="button" className="btn-secondary" onClick={() => { setDesde(''); setHasta(''); setConcepto(''); setOperacion(''); router.push(pathname) }}>Limpiar</button>
      </div>
    </form>
  )
}
EOF

cat > src/components/cuenta-corriente/TablaMovimientos.tsx << 'EOF'
import type { DiarioRow } from '@/lib/supabase/types'
function fmt(v: number | null, sym: string) {
  if (!v || v === 0) return null
  const n = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(Math.abs(v))
  return { text: `${sym} ${n}`, ingreso: v < 0 }
}
export default function TablaMovimientos({ movimientos }: { movimientos: DiarioRow[] }) {
  if (!movimientos.length) return <div className="px-5 py-12 text-center text-gray-400 text-sm">No hay movimientos para los filtros seleccionados</div>
  const cols = [
    { key: 'cc_dolares' as const, sym: 'U$S', label: 'Dólares' },
    { key: 'cc_pesos' as const, sym: '$', label: 'Pesos' },
    { key: 'cc_euros' as const, sym: '€', label: 'Euros' },
    { key: 'cc_reales' as const, sym: 'R$', label: 'Reales' },
  ]
  return (
    <div className="overflow-x-auto">
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
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
              <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate">{m.cuenta_cte}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${m.operacion === 'DONACION' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{m.operacion}</span>
              </td>
              <td className="px-4 py-3 text-gray-600">{m.concepto ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{m.evento ?? '—'}</td>
              {cols.map(c => {
                const v = fmt(m[c.key], c.sym)
                return (
                  <td key={c.key} className="px-4 py-3 text-right tabular-nums">
                    {v ? <span className={v.ingreso ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>{v.ingreso ? '+' : '-'}{v.text}</span> : <span className="text-gray-300">—</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
EOF

cat > src/components/cuenta-corriente/TarjetasSaldos.tsx << 'EOF'
import type { SaldoCuentaCorriente } from '@/lib/supabase/types'
interface Props { saldos: SaldoCuentaCorriente[]; cuentaCte: string | null }
const MONEDAS = [
  { key: 'saldo_dolares' as const, label: 'Dólares', sym: 'U$S', color: 'bg-green-50 border-green-200 text-green-900' },
  { key: 'saldo_pesos' as const, label: 'Pesos', sym: '$', color: 'bg-blue-50 border-blue-200 text-blue-900' },
  { key: 'saldo_euros' as const, label: 'Euros', sym: '€', color: 'bg-purple-50 border-purple-200 text-purple-900' },
  { key: 'saldo_reales' as const, label: 'Reales', sym: 'R$', color: 'bg-orange-50 border-orange-200 text-orange-900' },
]
export default function TarjetasSaldos({ saldos }: Props) {
  const t = saldos.reduce((a, s) => ({
    saldo_pesos: (a.saldo_pesos ?? 0) + (s.saldo_pesos ?? 0),
    saldo_dolares: (a.saldo_dolares ?? 0) + (s.saldo_dolares ?? 0),
    saldo_euros: (a.saldo_euros ?? 0) + (s.saldo_euros ?? 0),
    saldo_reales: (a.saldo_reales ?? 0) + (s.saldo_reales ?? 0),
  }), { saldo_pesos: 0, saldo_dolares: 0, saldo_euros: 0, saldo_reales: 0 })
  const conSaldo = MONEDAS.filter(m => (t[m.key] ?? 0) !== 0)
  const mostrar = conSaldo.length > 0 ? conSaldo : MONEDAS.slice(0, 2)
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {mostrar.map(m => {
        const v = t[m.key] ?? 0
        const n = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(Math.abs(v))
        return (
          <div key={m.key} className={`card border p-4 ${m.color}`}>
            <p className="text-xs font-medium opacity-70 uppercase tracking-wide mb-1">{m.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-medium opacity-60">{m.sym}</span>
              <span className="text-2xl font-bold">{n}</span>
            </div>
            <p className="text-xs opacity-60 mt-1">{v < 0 ? 'A tu favor' : v > 0 ? 'Saldo pendiente' : 'Sin movimientos'}</p>
          </div>
        )
      })}
    </div>
  )
}
EOF

echo ""
echo "📦 Instalando dependencias..."
npm install

echo ""
echo "✅ ¡Proyecto listo!"
echo ""
echo "Próximos pasos:"
echo "  1. npm run dev        → probar localmente"
echo "  2. git add . && git commit -m 'setup inicial' && git push"
echo "  3. Ir a netlify.com e importar este repo"
