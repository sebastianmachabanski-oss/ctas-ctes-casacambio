'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'

const navItems = {
  superusuario: [
    { href: '/dashboard/cuenta-corriente',    label: 'Cuentas Corrientes',  icon: '📋' },
    { href: '/dashboard/nueva-transaccion',   label: 'Nueva transacción',   icon: '➕', disabled: true },
    { href: '/dashboard/admin/usuarios',      label: 'Usuarios',            icon: '👥' },
    { href: '/dashboard/deudores',            label: 'Saldos Pendientes',   icon: '📊' },
    { href: '/dashboard/admin/sync',          label: 'Sincronizar Excel',   icon: '🔄' },
    { href: '/dashboard/mi-cuenta',           label: 'Mi cuenta',           icon: '🔑' },
  ],
  operador: [
    { href: '/dashboard/cuenta-corriente',    label: 'Cuentas Corrientes',  icon: '📋' },
    { href: '/dashboard/nueva-transaccion',   label: 'Nueva transacción',   icon: '➕', disabled: true },
    { href: '/dashboard/deudores',            label: 'Saldos Pendientes',   icon: '📊' },
    { href: '/dashboard/mi-cuenta',           label: 'Mi cuenta',           icon: '🔑' },
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
            <p className="text-white text-sm font-semibold truncate">Casa de Cambio</p>
            <p className="text-brand-300 text-xs capitalize">{profile.rol}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map(item => {
          const active = pathname.startsWith(item.href)
          if ((item as any).disabled) {
            return (
              <span key={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-brand-600 cursor-not-allowed select-none">
                <span className="text-base opacity-40">{item.icon}</span>
                <span className="opacity-40">{item.label}</span>
                <span className="ml-auto text-xs opacity-50">pronto</span>
              </span>
            )
          }
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
          <span className="text-white text-sm font-semibold">Casa de Cambio</span>
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
