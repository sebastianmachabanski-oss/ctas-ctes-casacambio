/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Optimizador de imágenes APAGADO (23/11/2026).
   *
   * La app no usa `next/image` en ninguna pantalla, pero el endpoint que
   * procesa imágenes (`/_next/image`) se publica igual, y ahí están los dos
   * agujeros más graves que le quedan abiertos a Next 14: procesar un SVG o un
   * AVIF armado a propósito permite ejecutar código en el servidor. No tienen
   * arreglo en la línea 14.x — el parche sale recién en Next 15.5.24.
   *
   * Apagarlo no cambia nada de lo que se ve (no hay una sola imagen que pase
   * por ahí) y deja el endpoint sin nada que procesar. Si algún día se usa
   * `next/image`, hay que sacar esta línea Y actualizar a Next 15.
   */
  images: { unoptimized: true },

  /**
   * Encabezados de seguridad, segunda mitad (24/11/2026).
   *
   * Los mismos cinco están en `netlify.toml`, y ahí SÍ se aplican — pero solo a los
   * archivos estáticos. Verificado en producción: un `/_next/static/...` los devuelve
   * y `/login` no. El plugin de Next arma sus propias respuestas para todo lo que
   * renderiza el servidor (páginas y rutas de API) y esas no pasan por las reglas del
   * `netlify.toml`, que era justamente donde más hacían falta.
   *
   * Por eso van en los dos lados y no en uno solo:
   *   netlify.toml     → estáticos y páginas de error, que no pasan por Next.
   *   next.config.js   → todo lo que renderiza Next, que es casi toda la app.
   *
   * Si alguna vez se cambian, hay que cambiarlos en los dos archivos.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Un año de HTTPS obligatorio. `preload` habilita el alta en la lista que
          // los navegadores traen de fábrica, que cubre también la primera visita.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // Nadie puede meter la app dentro de un marco en otro sitio (clickjacking).
          { key: 'X-Frame-Options', value: 'DENY' },
          // El navegador respeta el tipo declarado y no lo adivina por el contenido.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Al salir del sitio viaja el dominio, no la URL completa: las direcciones
          // de la app llevan identificadores (la ficha de un cheque, por ejemplo).
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // La app no usa cámara, micrófono ni ubicación: quedan negados por si
          // mañana se cuela código ajeno en una pantalla.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },

  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }]
    return config
  },
}
module.exports = nextConfig
