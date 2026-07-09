/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta de marca azul (según el mockup de la app). El sidebar usa su propio
        // navy definido en globals.css; acá vive el azul de acciones y acentos.
        brand: {
          50: '#eff4ff', 100: '#dbe6fe', 200: '#bfd3fe', 300: '#93b4fd', 400: '#5a8cf9',
          500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
        },
        // Tonos del sidebar navy (para usarlos con clases utilitarias si hace falta).
        side: {
          900: '#0e1626', 800: '#141d30', 700: '#1e2a44', 600: '#2a3b61', 500: '#33436a',
          ink: '#c3cee3', dim: '#7787a5',
        },
      },
    },
  },
  plugins: [],
}
