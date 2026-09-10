'use client'
import { usePathname } from 'next/navigation'
import { APP_NOMBRE } from '@/lib/marca'
import BandaMercado from '@/components/BandaMercado'

// Título de la pantalla en la barra superior (como el mockup). Se deriva de la ruta.
const TITLES: [string, string][] = [
  ['/dashboard/inicio', 'Inicio'],
  ['/dashboard/cuenta-corriente', 'Cuentas Corrientes'],
  ['/dashboard/nueva-transaccion', 'Nueva transacción'],
  ['/dashboard/transferencias', 'Transferencias'],
  ['/dashboard/gastos', 'Gastos'],
  ['/dashboard/calle', 'Dinero en calle'],
  ['/dashboard/deudores', 'Posición Ctas Ctes'],
  ['/dashboard/ganancias', 'Ganancias'],
  // El listado se mudó a Inicio (10/9/2026) y esta ruta solo sirve a la pantalla de
  // edición; sin esta línea, editar mostraba el nombre de la app en vez de un título.
  ['/dashboard/transacciones', 'Editar transacción'],
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
      <div style={{ flex: '0 0 auto' }}>
        <div className="cc-crumb">{APP_NOMBRE}</div>
        <div className="cc-ptitle">{title}</div>
      </div>
      {/* Las cotizaciones van acá, a la derecha del título (10/9/2026). Solo en Inicio:
          en las demás pantallas no aportan y el título quedaría apretado. */}
      {pathname.startsWith('/dashboard/inicio') && <BandaMercado />}
      {/* Acá iba una chapita verde que decía "Sincronizado". No era un estado real: era
          texto fijo, y encima nombraba la planilla en todas las pantallas. Se retiró el
          25/8/2026 junto con el resto de las menciones. */}
    </>
  )
}
