'use client'
import { usePathname } from 'next/navigation'

// Título de la pantalla en la barra superior (como el mockup). Se deriva de la ruta.
const TITLES: [string, string][] = [
  ['/dashboard/inicio', 'Inicio'],
  ['/dashboard/cuenta-corriente', 'Cuentas Corrientes'],
  ['/dashboard/nueva-transaccion', 'Nueva transacción'],
  ['/dashboard/transacciones', 'Transacciones'],
  ['/dashboard/calle', 'Dinero en calle'],
  ['/dashboard/deudores', 'Saldos Pendientes'],
  ['/dashboard/ganancias', 'Ganancias'],
  ['/dashboard/admin/usuarios', 'Usuarios'],
  ['/dashboard/admin/sync', 'Sincronizar'],
  ['/dashboard/mi-cuenta', 'Mi cuenta'],
]

export default function Topbar() {
  const pathname = usePathname()
  const match = TITLES.find(([href]) => pathname.startsWith(href))
  const title = match ? match[1] : 'Casa de Cambio'
  return (
    <>
      <div>
        <div className="cc-crumb">Casa de Cambio</div>
        <div className="cc-ptitle">{title}</div>
      </div>
      <span className="cc-pill"><span className="d" /><span className="t">Sincronizado</span></span>
    </>
  )
}
