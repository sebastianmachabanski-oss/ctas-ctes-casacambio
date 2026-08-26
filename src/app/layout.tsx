import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { APP_NOMBRE } from '@/lib/marca'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: APP_NOMBRE,
  description: 'Consulta de cuentas corrientes y movimientos',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
