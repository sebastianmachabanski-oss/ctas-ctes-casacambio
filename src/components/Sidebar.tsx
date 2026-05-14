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
