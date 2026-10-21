import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { APP_NOMBRE } from '@/lib/marca'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: APP_NOMBRE,
  description: 'Consulta de cuentas corrientes y movimientos',
}

/**
 * Va en su propio `export`, no adentro de `metadata`.
 *
 * Desde Next 14 el viajero dentro de `metadata` quedó obsoleto: sigue funcionando, pero
 * cada pantalla imprime un aviso en la terminal —dos veces— y el indicador de Next lo
 * cuenta como un problema. En la grabación de la demostración eso se veía como un cartel
 * que decía "2 errores" arriba de la aplicación.
 *
 * El contenido es el mismo de antes, campo por campo. Solo cambia dónde se declara.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
