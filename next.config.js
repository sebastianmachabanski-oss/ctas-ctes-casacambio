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

  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }]
    return config
  },
}
module.exports = nextConfig
