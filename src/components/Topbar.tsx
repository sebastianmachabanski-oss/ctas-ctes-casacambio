'use client'
import { usePathname } from 'next/navigation'
import { APP_NOMBRE } from '@/lib/marca'

// Título de la pantalla en la barra superior (como el mockup). Se deriva de la ruta.
const TITLES: [string, string][] = [
  ['/dashboard/inicio', 'Inicio'],
  ['/dashboard/cuenta-corriente', 'Cuentas Corrientes'],
  ['/dashboard/nueva-transaccion', 'Nueva transacción'],
  ['/dashboard/transacciones', 'Transacciones'],
  ['/dashboard/transferencias', 'Transferencias'],
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
  const title = match ? match[1] : APP_NOMBRE
  return (
    <>
      <div>
        <div className="cc-crumb">{APP_NOMBRE}</div>
        <div className="cc-ptitle">{title}</div>
      </div>
      {/* Acá iba una chapita verde que decía "Sincronizado". No era un estado real: era
          texto fijo, y encima nombraba la planilla en todas las pantallas. Se retiró el
          25/8/2026 junto con el resto de las menciones. */}
    </>
  )
}
