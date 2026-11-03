/**
 * Pasa el folleto a PDF, en dos versiones: con precios y sin precios.
 *
 *   cd marketing && node a-pdf.mjs
 *
 * ── POR QUÉ ESTO Y NO "GUARDAR COMO PDF" ───────────────────────────────────
 * El folleto es una página web. Imprimirla desde el navegador sale distinta en cada
 * máquina —márgenes, escala, dónde cortan las hojas— y encima hay que acordarse de sacar
 * la sección de precios a mano para la otra versión. Acá sale siempre igual y las dos
 * versiones salen del MISMO archivo: mantener dos copias del texto termina siempre igual,
 * se corrige una frase en una y la otra sigue diciendo lo viejo.
 *
 * ── QUÉ SE EDITA ───────────────────────────────────────────────────────────
 * `brochure.html`. Es la misma página que se publica en la web, así que no lleva las
 * etiquetas <html>, <head> ni <body>: se las agrega este programa para el PDF.
 * La captura es `captura-inicio.webp`, que se saca con `cd ../demo && npm run captura`.
 *
 * El reparto en hojas se controla en ESTILOS DE IMPRESIÓN, más abajo. Está ajustado para
 * que cada versión entre en dos hojas con la última bien llena; si se agrega o se saca
 * texto, hay que volver a mirarlo.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Las rutas cuelgan de la carpeta de este archivo: si colgaran del directorio desde el que
// se lo llama, correrlo desde la raíz del repositorio no encontraría nada.
const AQUI = dirname(fileURLToPath(import.meta.url))
/**
 * Playwright es el que dibuja el PDF. No se instala acá: ya está en `demo/`, y son
 * cientos de megas que no tiene sentido tener dos veces.
 */
async function traerChromium() {
  for (const d of ['playwright', '../demo/node_modules/playwright/index.js']) {
    try {
      const m = await import(d)
      return m.chromium ?? m.default?.chromium
    } catch {}
  }
  console.error('\n❌ No se encuentra Playwright. Se instala una vez:\n'
    + '     cd ../demo\n     npm install\n')
  process.exit(1)
}
const chromium = await traerChromium()

const fuente = readFileSync(join(AQUI, 'brochure.html'), 'utf8')

// La hoja de Google Fonts se deja; el resto de la cabecera del artefacto no va.
const linkFuentes = fuente.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis[^>]*>/)?.[0] ?? ''
const cuerpo = fuente
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>\s*/, '')
  .replace(/<title>[\s\S]*?<\/title>\s*/, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis[^>]*>\s*/, '')

// Impresión: una sola apariencia (la clara), fondos que SÍ se imprimen, y nada de cortar
// un bloque por la mitad entre dos páginas.
const estilosImpresion = `
<style>
  @page { size: A4; margin: 0 }
  html, body { background: var(--papel) }
  /* Los márgenes de página van en cero para que las bandas oscuras lleguen al borde;
     el aire lateral lo pone el contenido. */
  .envoltura { max-width: none; padding-left: 15mm; padding-right: 15mm }
  /* Sin esto Chromium imprime los paneles oscuros en blanco. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact }

  /* Ritmo más apretado que en pantalla: en papel el aire se paga en hojas. */
  body { font-size: 10.6pt; line-height: 1.5 }
  h1 { font-size: 27pt }
  h2 { font-size: 15pt }
  .lede { font-size: 11.6pt }
  .portada { padding-block: 11mm }
  .pizarra { padding-block: 0 2mm }
  .aviso-ejemplo { font-size: 7.4pt; margin-top: 1.4mm }
  .pie-texto { padding-block: 4mm }
  .contacto .quien { font-size: 9.6pt }
  .contacto .tel { font-size: 10.4pt }
  /* La captura va de borde a borde del papel: es lo que la hace grande. Dentro de la
     columna de texto quedaba al 40% y las filas del listado no se leían. */
  .captura { max-width: none }
  .bloque { padding-block: 5mm }
  .cierre { padding-block: 8mm 10mm }
  .bloque .envoltura, .portada .envoltura, .pizarra .envoltura, .cierre .envoltura { gap: 2.5mm }

  /* Tres y tres: con "auto-fit" entraban cuatro y la segunda fila quedaba con un hueco. */
  .monedas { grid-template-columns: repeat(3, 1fr) }
  .moneda { padding: 9px 11px 10px }
  .moneda .monto { font-size: 14pt }

  /* El contenedor de los grupos pintaba su fondo gris en el alto que le sobraba al final
     de la hoja, y los grupos saltaban enteros a la siguiente: media página en blanco con
     una banda gris. Sin fondo propio y con la línea en cada grupo, el corte no se ve. */
  /* Bloque, no flex. Chromium no sabe partir un contenedor flex entre dos hojas: lo mueve
     entero a la siguiente, y con eso una hoja quedaba a menos de la mitad y el folleto se
     iba a tres. Apilado como bloque, el corte cae donde tiene que caer. */
  .grupos { display: block; background: none; border: none }
  /* Esta sección abre hoja. Sin esto su título quedaba solo al pie de la primera, con el
     contenido en la siguiente: el lector da vuelta la hoja para encontrar de qué hablaba
     el título que acaba de leer. Forzar el corte acá también deja el reparto parejo:
     portada y pantalla en una hoja, funcionalidades y precios en la otra. */
  /* El sobrante de la primera hoja se reparte DENTRO de la sección, no se deja al pie:
     aire entre el título y las cajas, y más adentro de cada caja. La hoja queda llena sin
     agregar texto y sin que la sección deje de parecerse a la de la hoja siguiente. */
  #lo-que-cambia .envoltura { gap: 8mm }
  #lo-que-cambia .grupo { padding-block: 6.5mm }
  #lo-que-cambia .grupo:first-child { padding-top: 4mm }

  /* Abre hoja, y con aire arriba: pegado al borde el título parece cortado. */
  #que-hace { break-before: page; padding-top: 14mm }
  .grupo { border-top: 1px solid var(--borde); padding: 1.8mm 0 }
  .grupo:first-child { border-top: none; padding-top: 1mm }
  .grupo ul { gap: 4px }
  .grupo h3 { font-size: 12.5pt }
  .grupo li, .precio li { font-size: 9.6pt; line-height: 1.38 }
  .grupo li b { font-size: 9.6pt }
  .grupo > p { font-size: 9.6pt; line-height: 1.42 }

  /* Nada de estos bloques se parte entre dos hojas. */
  .grupo, .precio, .pizarra, .cierre, .tres, .precios { break-inside: avoid }
  /* El h2 NO lleva break-after: avoid.
     Debería evitar que un título quede solo al pie de una hoja, pero combinado con las
     cajas que no se parten hace que Chromium adelante el corte: la hoja 1 quedaba con la
     portada sola y el folleto se iba a tres hojas. Con las cajas indivisibles, un título
     huérfano no puede pasar de todos modos: lo que sigue siempre viaja con él o sin él
     entero, y el resultado se controla mirando el PDF. */
  h1, h3 { break-after: avoid }
  .monto-grande { font-size: 22pt }
  .precio { padding: 3.2mm 4mm 3.6mm; gap: 2.4mm }
  .precio ul { gap: 5px }
  .precios { gap: 4mm }
  .extra { padding-top: 3mm }
  /* El cierre va compacto: es una sola frase y una invitación, no una sección más. */
  .cierre { padding-block: 3.5mm 4.5mm }
  .cierre h2 { font-size: 13.5pt }
  .cierre p { font-size: 10.4pt }
  .nota { font-size: 9.8pt }
</style>`

const documento = (contenido, extra = '') => `<!doctype html><html lang="es"><head>
<meta charset="utf-8">
<title>Sistema para casas de cambio</title>
${linkFuentes}
</head><body>
${contenido}
${estilosImpresion}
${extra}
</body></html>`

/**
 * La versión SIN PRECIOS sale del mismo archivo, sacándole la sección.
 *
 * No es un segundo folleto: es el mismo. Mantener dos copias del texto termina siempre
 * igual — se corrige una frase en una y la otra sigue diciendo lo viejo, y nadie se entera
 * hasta que las dos están en manos de dos personas distintas.
 */
function sinPrecios(html) {
  const desde = html.indexOf('<section class="bloque">', html.indexOf('Propuesta económica') - 900)
  const hasta = html.indexOf('</section>', html.indexOf('Propuesta económica')) + '</section>'.length
  if (desde < 0 || hasta < desde) throw new Error('No se encontró la sección de precios para sacarla')
  return html.slice(0, desde) + html.slice(hasta)
}

const navegador = await chromium.launch()

async function aPdf(contenido, archivo, extra = '') {
  const temporal = join(AQUI, archivo.replace(/\.pdf$/, '.html'))
  writeFileSync(temporal, documento(contenido, extra))
  const pagina = await navegador.newPage()
  // 'light' a la fuerza: un PDF tiene una sola apariencia y la clara es la que se imprime.
  await pagina.emulateMedia({ colorScheme: 'light', media: 'print' })
  await pagina.goto(`file://${temporal}`, { waitUntil: 'networkidle' })
  await pagina.pdf({
    path: join(AQUI, archivo),
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  })
  await pagina.close()
  console.log(`  ${archivo}`)
}

/**
 * Aire extra para la versión sin precios.
 *
 * Es el mismo folleto con una sección menos, así que con el mismo ritmo la última hoja le
 * queda a dos tercios y se lee como si faltara algo. No es un problema de contenido sino de
 * reparto: el mismo texto, repartido más holgado, llena la hoja.
 */
const AIRE = `
<style>
  /* Solo lo que cae en la ÚLTIMA hoja. Aplicado a todo, ensanchaba también la sección de
     la primera y la empujaba a una hoja de más, que es lo contrario de lo que se busca. */
  #que-hace { padding-top: 15mm }
  #que-hace .grupo { padding-block: 6.5mm }
  #que-hace .grupo:first-child { padding-top: 5mm }
  #que-hace .grupo ul { gap: 10px }
  #que-hace .grupo li { font-size: 10.6pt; line-height: 1.48 }
  #que-hace .grupo li b { font-size: 10.6pt }
  #que-hace .grupo h3 { font-size: 13.5pt }
  .cierre { padding-block: 8mm 10mm }
</style>`

console.log('PDF:')
await aPdf(cuerpo, 'Sistema-para-casas-de-cambio.pdf')
await aPdf(sinPrecios(cuerpo), 'Sistema-para-casas-de-cambio-sin-precios.pdf', AIRE)
await navegador.close()
