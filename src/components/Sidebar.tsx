'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PLANILLA_ACTIVA } from '@/lib/planilla'
import { rutaActiva } from '@/lib/configuracion'
import { APP_NOMBRE } from '@/lib/marca'
import { aUsuario } from '@/lib/usuarios'
import type { Profile } from '@/lib/supabase/types'

type Item = { href?: string; label: string; icon: string; off?: boolean; section?: string }

/**
 * El mismo corte que usa el CSS. Arriba de esto la barra se ANCLA y corre el contenido;
 * abajo es un PANEL que se abre encima, con fondo oscuro y se cierra tocando afuera.
 * Si se cambia acá hay que cambiarlo también en globals.css.
 */
const COMO_PANEL = '(max-width: 860px)'
const esPanel = () =>
  typeof window !== 'undefined' && window.matchMedia(COMO_PANEL).matches

// Menú por rol (ver src/lib/roles.ts para el modelo completo).
// Todas las opciones están habilitadas (16/7/2026, pedido del cliente).
//
// La diferencia entre superadmin y administrador es una sola línea: Ganancias. Se deja
// escrito el menú completo de cada uno en vez de derivarlo con condicionales, para que
// se pueda leer de un vistazo qué ve cada rol.
const NAV: Record<string, Item[]> = {
  // ── CÓMO ESTÁ ORGANIZADO (20/11/2026) ────────────────────────────────────
  // Antes había un solo bloque, "Operación", con todo adentro: el tablero, las dos altas
  // y cinco consultas. Nueve opciones sin jerarquía, donde cargar una operación y mirar
  // un listado pesaban lo mismo.
  //
  // Ahora son tres grupos según QUÉ SE VA A HACER, no según de qué habla la pantalla:
  //   Inicio         el tablero. Va suelto arriba de todo porque es donde se entra y
  //                  desde donde se mira: caja, últimas transacciones y cotizaciones.
  //   Transacciones  lo que CARGA datos. Solo las dos altas.
  //   Reportes       lo que solo CONSULTA. Ninguna de estas escribe nada.
  //   Gestión        la administración del sistema.
  //
  // "Cuentas Corrientes" pasó a "Movimientos cuentas corrientes": al lado de "Posición
  // cuentas corrientes" el nombre viejo no decía en qué se diferencian, y son las dos
  // preguntas distintas que el cliente hace todos los días —el detalle de una cuenta y
  // el saldo de todas—.
  superadmin: [
    { href: '/dashboard/inicio',            label: 'Inicio',            icon: '📊' },
    { section: 'Transacciones', label: '', icon: '' },
    { href: '/dashboard/nueva-transaccion', label: 'Nueva operación', icon: '➕' },
    { href: '/dashboard/nueva-transferencia', label: 'Nueva transferencia', icon: '🔀' },
    { section: 'Reportes', label: '', icon: '' },
    { href: '/dashboard/cuenta-corriente',  label: 'Movimientos cuentas corrientes', icon: '📋' },
    { href: '/dashboard/deudores',          label: 'Posición cuentas corrientes', icon: '📈' },
    { href: '/dashboard/transferencias',    label: 'Transferencias',  icon: '🔁' },
    { href: '/dashboard/calle',             label: 'Dinero en calle', icon: '🚚' },
    { href: '/dashboard/gastos',            label: 'Gastos',          icon: '🧾' },
    { section: 'Gestión', label: '', icon: '' },
    { href: '/dashboard/ganancias',      label: 'Ganancias', icon: '💰' },
    { href: '/dashboard/admin/usuarios', label: 'Usuarios',  icon: '👥' },
    { href: '/dashboard/admin/auditoria', label: 'Auditoría', icon: '🔎' },
    { href: '/dashboard/admin/sync',     label: 'Sincronizar', icon: '🔄' },
    { href: '/dashboard/mi-cuenta', label: 'Mi cuenta', icon: '🔑' },
  ],
  administrador: [
    { href: '/dashboard/inicio',            label: 'Inicio',            icon: '📊' },
    { section: 'Transacciones', label: '', icon: '' },
    { href: '/dashboard/nueva-transaccion', label: 'Nueva operación', icon: '➕' },
    { href: '/dashboard/nueva-transferencia', label: 'Nueva transferencia', icon: '🔀' },
    { section: 'Reportes', label: '', icon: '' },
    { href: '/dashboard/cuenta-corriente',  label: 'Movimientos cuentas corrientes', icon: '📋' },
    { href: '/dashboard/deudores',          label: 'Posición cuentas corrientes', icon: '📈' },
    { href: '/dashboard/transferencias',    label: 'Transferencias',  icon: '🔁' },
    { href: '/dashboard/calle',             label: 'Dinero en calle', icon: '🚚' },
    { href: '/dashboard/gastos',            label: 'Gastos',          icon: '🧾' },
    { section: 'Gestión', label: '', icon: '' },
    { href: '/dashboard/admin/usuarios', label: 'Usuarios',  icon: '👥' },
    { href: '/dashboard/admin/auditoria', label: 'Auditoría', icon: '🔎' },
    { href: '/dashboard/admin/sync',     label: 'Sincronizar', icon: '🔄' },
    { href: '/dashboard/mi-cuenta', label: 'Mi cuenta', icon: '🔑' },
  ],
  operador: [
    { href: '/dashboard/inicio',            label: 'Inicio',            icon: '📊' },
    { section: 'Transacciones', label: '', icon: '' },
    { href: '/dashboard/nueva-transaccion', label: 'Nueva operación', icon: '➕' },
    { href: '/dashboard/nueva-transferencia', label: 'Nueva transferencia', icon: '🔀' },
    { section: 'Reportes', label: '', icon: '' },
    { href: '/dashboard/cuenta-corriente',  label: 'Movimientos cuentas corrientes', icon: '📋' },
    { href: '/dashboard/deudores',          label: 'Posición cuentas corrientes', icon: '📈' },
    { href: '/dashboard/transferencias',    label: 'Transferencias',  icon: '🔁' },
    { href: '/dashboard/calle',             label: 'Dinero en calle', icon: '🚚' },
    { href: '/dashboard/gastos',            label: 'Gastos',          icon: '🧾' },
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
  // "Sincronizar" no se muestra: la app no menciona la planilla (25/8/2026). La pantalla
  // sigue existiendo y funcionando en /dashboard/admin/sync para quien la necesite.
  const items = (NAV[profile.rol] ?? NAV.cliente)
    .filter(it => PLANILLA_ACTIVA || it.href !== '/dashboard/admin/sync')
    // Módulos apagados en esta instalación (ver src/lib/configuracion.ts). El filtro va
    // sobre el menú ya armado por rol: un módulo apagado no se ve, y además su pantalla
    // rebota desde el layout — esconder la opción no alcanza, con la URL se entra igual.
    .filter(it => !it.href || rutaActiva(it.href))

  /** Ancla o desancla, y lo recuerda para la próxima visita. */
  const anclar = useCallback((v: boolean) => {
    setPinned(v)
    setNavOpen(false)
    try { localStorage.setItem('cc-nav-pinned', v ? '1' : '0') } catch {}
  }, [])

  // Estado de anclado: recordado entre visitas; en pantallas chicas arranca como panel.
  useEffect(() => {
    let ini = true
    try { const s = localStorage.getItem('cc-nav-pinned'); if (s !== null) ini = s === '1' } catch {}
    if (esPanel()) ini = false
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
  //
  // HACE DOS COSAS DISTINTAS SEGÚN EL TAMAÑO DE PANTALLA (18/11/2026).
  // En el teléfono abre y cierra el panel, que es lo que se espera de una hamburguesa.
  // En pantalla grande vuelve a ANCLAR la barra, que es lo único que corre el contenido.
  // Antes abría el panel también acá, así que la barra aparecía flotando por encima, la
  // pantalla no se ajustaba, y había que tocar el pin aparte para acomodarla — con el
  // agravante de que arriba de 861px el fondo oscuro está apagado y no se podía cerrar
  // tocando al costado. El modo panel no aporta nada en pantalla grande: se usa el ancho,
  // no se tapa el contenido.
  useEffect(() => {
    const btn = document.getElementById('cc-hamb')
    if (!btn) return
    const h = () => { if (esPanel()) setNavOpen(v => !v); else anclar(true) }
    btn.addEventListener('click', h)
    return () => btn.removeEventListener('click', h)
  }, [anclar])

  // Al pasar de teléfono a pantalla grande (girar el aparato, agrandar la ventana), el
  // panel que hubiera quedado abierto se cierra: ahí arriba no tiene fondo oscuro con el
  // que cerrarse y quedaría clavado encima del contenido.
  useEffect(() => {
    const mq = window.matchMedia(COMO_PANEL)
    const alCambiar = (e: MediaQueryListEvent) => { if (!e.matches) setNavOpen(false) }
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])

  function togglePin() { anclar(!pinned) }

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
            <div className="t">{APP_NOMBRE}</div>
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
                <span className="ic">{it.icon}</span>{it.label}
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
              <div className="em" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{aUsuario(profile.email)}</div>
            </div>
          </div>
          <button className="cc-logout" onClick={handleLogout}><span>🚪</span>Salir</button>
        </div>
      </aside>
    </>
  )
}
