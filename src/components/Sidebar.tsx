'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'

type Item = { href?: string; label: string; icon: string; off?: boolean; section?: string }

// Menú por rol.
// Habilitadas: Inicio, Cuentas Corrientes, Nueva transacción, Usuarios, Mi cuenta.
// Deshabilitadas ("pronto") para TODOS los roles (decisión 11/7/2026, tras validar):
// Transacciones, Dinero en calle, Saldos Pendientes, Ganancias, Sincronizar. Las
// pantallas siguen existiendo y son accesibles por URL directa; solo se ocultan del menú.
// Para volver a habilitar cualquiera, reemplazar su `{ off: true }` por `{ href: '...' }`.
const NAV: Record<string, Item[]> = {
  superusuario: [
    { section: 'Operación', label: '', icon: '' },
    { href: '/dashboard/inicio',            label: 'Inicio',            icon: '📊' },
    { href: '/dashboard/cuenta-corriente',  label: 'Cuentas Corrientes', icon: '📋' },
    { href: '/dashboard/nueva-transaccion', label: 'Nueva transacción', icon: '💱' },
    { label: 'Transacciones',    icon: '💲', off: true },
    { label: 'Dinero en calle',  icon: '🚚', off: true },
    { label: 'Saldos Pendientes', icon: '📈', off: true },
    { section: 'Gestión', label: '', icon: '' },
    { label: 'Ganancias',   icon: '💰', off: true },
    { href: '/dashboard/admin/usuarios', label: 'Usuarios',  icon: '👥' },
    { label: 'Sincronizar', icon: '🔄', off: true },
    { href: '/dashboard/mi-cuenta', label: 'Mi cuenta', icon: '🔑' },
  ],
  operador: [
    { section: 'Operación', label: '', icon: '' },
    { href: '/dashboard/inicio',            label: 'Inicio',            icon: '📊' },
    { href: '/dashboard/cuenta-corriente',  label: 'Cuentas Corrientes', icon: '📋' },
    { href: '/dashboard/nueva-transaccion', label: 'Nueva transacción', icon: '💱' },
    { label: 'Transacciones',    icon: '💲', off: true },
    { label: 'Dinero en calle',  icon: '🚚', off: true },
    { label: 'Saldos Pendientes', icon: '📈', off: true },
    { section: 'Cuenta', label: '', icon: '' },
    { href: '/dashboard/mi-cuenta', label: 'Mi cuenta', icon: '🔑' },
  ],
  cliente: [
    { section: 'Mi cuenta', label: '', icon: '' },
    { href: '/dashboard/cuenta-corriente', label: 'Mi cuenta corriente', icon: '📋' },
    { href: '/dashboard/mi-cuenta',        label: 'Cambiar contraseña',  icon: '🔑' },
  ],
}

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pinned, setPinned] = useState(true)
  const [navOpen, setNavOpen] = useState(false)
  const items = NAV[profile.rol] ?? NAV.cliente

  // Estado de anclado: recordado entre visitas; en pantallas chicas arranca como panel.
  useEffect(() => {
    let ini = true
    try { const s = localStorage.getItem('cc-nav-pinned'); if (s !== null) ini = s === '1' } catch {}
    if (typeof window !== 'undefined' && window.matchMedia('(max-width:860px)').matches) ini = false
    setPinned(ini)
  }, [])

  useEffect(() => { document.body.classList.toggle('cc-pinned', pinned) }, [pinned])
  useEffect(() => { document.body.classList.toggle('cc-navopen', navOpen) }, [navOpen])
  useEffect(() => { setNavOpen(false) }, [pathname])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  // El botón hamburguesa lo pinta la topbar del layout (server); acá lo cableamos.
  useEffect(() => {
    const btn = document.getElementById('cc-hamb')
    if (!btn) return
    const h = () => setNavOpen(v => !v)
    btn.addEventListener('click', h)
    return () => btn.removeEventListener('click', h)
  }, [])

  function togglePin() {
    const next = !pinned
    setPinned(next)
    setNavOpen(false)
    try { localStorage.setItem('cc-nav-pinned', next ? '1' : '0') } catch {}
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const inicial = (profile.nombre || profile.email || '?').trim().charAt(0).toUpperCase()

  return (
    <>
      <div className="cc-scrim" onClick={() => setNavOpen(false)} />

      <aside className="cc-side">
        <div className="cc-side-head">
          <div className="cc-logo">CC</div>
          <div style={{ overflow: 'hidden' }}>
            <div className="t">Casa de Cambio</div>
            <div className="r">{profile.rol}</div>
          </div>
          <button className="cc-pin" onClick={togglePin} aria-pressed={pinned}
            title={pinned ? 'Desanclar el menú' : 'Anclar el menú'}>📌</button>
        </div>

        <nav className="cc-nav">
          {items.map((it, i) => {
            if (it.section) return <div key={`s${i}`} className="cc-nav-sec">{it.section}</div>
            if (it.off) return (
              <span key={`o${i}`} className="cc-nav-item off">
                <span className="ic">{it.icon}</span>{it.label}<span className="soon">pronto</span>
              </span>
            )
            const active = it.href === '/dashboard/inicio'
              ? (pathname === '/dashboard/inicio' || pathname === '/dashboard')
              : !!it.href && pathname.startsWith(it.href)
            return (
              <Link key={it.href} href={it.href!} className={`cc-nav-item ${active ? 'on' : ''}`}>
                <span className="ic">{it.icon}</span>{it.label}
              </Link>
            )
          })}
        </nav>

        <div className="cc-side-foot">
          <div className="cc-user">
            <div className="cc-av">{inicial}</div>
            <div style={{ overflow: 'hidden' }}>
              <div className="nm" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{profile.nombre}</div>
              <div className="em" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{profile.email}</div>
            </div>
          </div>
          <button className="cc-logout" onClick={handleLogout}><span>🚪</span>Salir</button>
        </div>
      </aside>
    </>
  )
}
