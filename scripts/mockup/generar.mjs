// Genera la imagen de producto (docs/producto-telefono.png): un teléfono con la app.
//
// La app se renderiza DENTRO DE UN IFRAME de 390 px a propósito: las media queries
// responden al viewport, no al contenedor. Si se dibujara el teléfono en una página
// ancha, la app saldría con el layout de escritorio dentro del marco del teléfono.
//
// Usa el CSS realmente compilado (.next/static/css), así lo que se ve es el diseño
// vigente y no una maqueta que se despega del producto.
//
//   npm run build && node scripts/mockup/generar.mjs
import { chromium } from 'playwright'
import { readdirSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aca  = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aca, '../..')
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const dirCss = resolve(raiz, '.next/static/css')
let hojas
try {
  hojas = readdirSync(dirCss).filter(f => f.endsWith('.css'))
} catch {
  console.error('No se encontró .next/static/css — hay que correr `npm run build` antes.')
  process.exit(1)
}
copyFileSync(resolve(dirCss, hojas[0]), resolve(aca, 'app.css'))

const navegador = await chromium.launch({ executablePath: CHROME })
const pagina = await navegador.newPage({ viewport: { width: 1000, height: 1180 }, deviceScaleFactor: 3 })
await pagina.goto('file://' + resolve(aca, 'mockup.html'), { waitUntil: 'networkidle' })
await pagina.waitForTimeout(500)

mkdirSync(resolve(raiz, 'docs'), { recursive: true })
const salida = resolve(raiz, 'docs/producto-telefono.png')
await pagina.locator('.escena').screenshot({ path: salida })
await navegador.close()
console.log('OK ->', salida)
