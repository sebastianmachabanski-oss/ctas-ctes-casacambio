/**
 * Las dos láminas de texto del video: la de entrada y la de salida.
 *
 * POR QUÉ ESTÁN ACÁ Y NO EN EL GRABADOR
 * Las usan dos programas: el que graba el video y el que saca la vista previa. La vista
 * previa las tomaba RECORTANDO EL TEXTO del grabador entre dos marcas — una forma de no
 * duplicarlas que parecía prolija y era una trampa: una de las marcas tenía un salto de
 * línea adentro, y en Windows los renglones se separan de otra manera, así que la marca
 * no aparecía, el recorte se llevaba medio archivo y la vista previa moría con un error
 * que no se parecía en nada a la causa.
 *
 * Un módulo compartido no tiene ese problema: las dos lo importan y listo.
 *
 * Reciben `page` y `pausa` en lugar de tomarlos del entorno, que es lo que les permite
 * servir a los dos usos: el grabador espera de verdad, la vista previa no espera nada.
 */

export const FONDO_LAMINA = `
  radial-gradient(circle at 1px 1px, rgba(255,255,255,.11) 1.3px, transparent 0) 0 0 / 20px 20px,
  radial-gradient(900px 480px at 50% -6%, rgba(59,130,246,.38), transparent 62%),
  linear-gradient(180deg, #17213b, #0b1120)`

/**
 * La pantalla de cierre: el mensaje final, solo, en el centro.
 *
 * Antes era un cartel más, sobreimpreso sobre la última pantalla de la aplicación. El
 * video terminaba entonces mirando una tabla, con la frase de cierre encima como si fuera
 * una explicación más. Puesta sola y centrada, cierra: la última imagen es el mensaje y no
 * un listado cualquiera.
 *
 * Comparte el fondo y la tipografía con la portada, para que se lean como las dos tapas
 * de lo mismo.
 */
export async function mostrarCierre(page, GUION, pausa) {
  const c = GUION.cierre
  if (!c) return

  await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <style>
      @keyframes sube { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
      * { box-sizing: border-box; margin: 0; padding: 0 }
      body {
        height: 100vh; display: flex; flex-direction: column;
        align-items: center; justify-content: center; text-align: center;
        padding: 0 140px; gap: 26px; color: #eef2f8; overflow: hidden;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        background: ${FONDO_LAMINA};
      }
      h1 {
        font-size: 60px; font-weight: 800; letter-spacing: -.035em; line-height: 1.08;
        max-width: 1100px; animation: sube .8s ease both;
      }
      h1 b { color: #7dd3fc; font-weight: 800 }
      .linea {
        width: 86px; height: 5px; border-radius: 99px; background: #60a5fa; opacity: .7;
        animation: sube .8s ease .35s both;
      }
      p {
        font-size: 25px; line-height: 1.5; color: #9fb3cd; max-width: 900px;
        animation: sube .8s ease .55s both;
      }
    </style></head><body>
      <h1>${c.titulo ?? ''}</h1>
      <div class="linea"></div>
      ${c.texto ? `<p>${c.texto}</p>` : ''}
    </body></html>`)
  await pausa(c.espera ?? 6000)
}

export async function mostrarPortada(page, GUION, pausa) {
  const p = GUION.portada
  if (!p) return

  // Los puntos pueden venir agrupados o como una lista suelta. Lo segundo es la forma
  // vieja del guion y se sigue aceptando: una portada que deja de funcionar porque cambió
  // el formato es una portada que nadie va a querer tocar.
  const grupos = p.grupos ?? (p.puntos ? [{ puntos: p.puntos }] : [])

  const destacados = (p.destacados ?? []).map(d => `
    <div class="d">
      <div class="di">${d.icono ?? ''}</div>
      <div>
        <div class="dt">${d.titulo ?? ''}</div>
        <div class="dx">${d.texto ?? ''}</div>
      </div>
    </div>`).join('')

  const columnas = grupos.map(g => `
    <div class="g">
      ${g.titulo ? `<div class="gt">${g.titulo}</div>` : ''}
      <ul>${(g.puntos ?? []).map(t => `<li>${t}</li>`).join('')}</ul>
    </div>`).join('')

  await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <style>
      @keyframes sube { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
      * { box-sizing: border-box; margin: 0; padding: 0 }
      body {
        height: 100vh; display: flex; flex-direction: column; justify-content: center;
        padding: 0 96px; gap: 40px; color: #eef2f8; overflow: hidden;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        /* El mismo fondo que la pantalla de ingreso de la aplicación: así la portada y la
           primera pantalla del video se ven del mismo producto, no de dos. */
        background: ${FONDO_LAMINA};
      }
      /* Cada bloque entra un instante después del anterior: la vista sigue un orden en
         lugar de recibir todo de golpe. */
      .a1 { animation: sube .7s ease both }
      .a2 { animation: sube .7s ease .45s both }
      .a3 { animation: sube .7s ease .9s both }

      h1 { font-size: 64px; font-weight: 800; letter-spacing: -.035em; line-height: 1.02 }
      h1 b { color: #7dd3fc; font-weight: 800 }
      h2 { font-size: 24px; font-weight: 400; color: #9fb3cd; margin-top: 14px; letter-spacing: -.01em }

      /* Los tres mensajes que no son funcionalidades sino condiciones del producto. */
      .dd { display: flex; gap: 14px }
      .d {
        flex: 1; display: flex; gap: 14px; align-items: flex-start;
        background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1);
        border-radius: 14px; padding: 18px 20px;
      }
      .di { font-size: 26px; line-height: 1 }
      .dt { font-size: 17px; font-weight: 700; margin-bottom: 3px }
      .dx { font-size: 14.5px; color: #9fb3cd; line-height: 1.4 }

      .gg { display: flex; gap: 56px }
      .g { flex: 1 }
      .gt {
        font-size: 11.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
        color: #60a5fa; padding-bottom: 9px; margin-bottom: 11px;
        border-bottom: 1px solid rgba(255,255,255,.12);
      }
      ul { list-style: none; font-size: 16px; line-height: 1.95 }
      li { color: #cbd8e8; padding-left: 19px; position: relative }
      li::before {
        content: ''; position: absolute; left: 0; top: .78em;
        width: 6px; height: 6px; border-radius: 99px; background: #60a5fa; opacity: .75;
      }
    </style></head><body>
      <div class="a1">
        <h1>${p.titulo ?? ''}</h1>
        ${p.subtitulo ? `<h2>${p.subtitulo}</h2>` : ''}
      </div>
      ${destacados ? `<div class="dd a2">${destacados}</div>` : ''}
      ${columnas ? `<div class="gg a3">${columnas}</div>` : ''}
    </body></html>`)
  await pausa(p.espera ?? 11_000)
}

/**
 * Una lámina de sección: anuncia lo que viene antes de mostrarlo.
 *
 * POR QUÉ EXISTEN
 * El video recorría diecisiete pantallas seguidas, cada una con su explicación. Quien ya
 * conoce el sistema lo sigue; quien no lo vio nunca recibe diecisiete cosas sin saber
 * cuántas faltan ni cómo se relacionan, y se pierde. Es lo que pasó al mostrárselo a
 * alguien de afuera.
 *
 * Partido en secciones, cada una se anuncia primero —qué es y qué incluye— y después se
 * ve rápido. El que mira siempre sabe dónde está parado, y las pantallas pueden pasar
 * mucho más rápido porque ya le dijeron qué va a ver.
 */
export async function mostrarLamina(page, lamina, pausa) {
  const puntos = (lamina.puntos ?? []).map(t => `<li>${t}</li>`).join('')

  await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <style>
      @keyframes sube { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
      * { box-sizing: border-box; margin: 0; padding: 0 }
      body {
        height: 100vh; display: flex; flex-direction: column; justify-content: center;
        padding: 0 120px; gap: 22px; color: #eef2f8; overflow: hidden;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        background: ${FONDO_LAMINA};
      }
      .n {
        font-size: 13px; font-weight: 700; letter-spacing: .22em; color: #60a5fa;
        animation: sube .6s ease both;
      }
      h1 {
        font-size: 56px; font-weight: 800; letter-spacing: -.035em; line-height: 1.05;
        animation: sube .6s ease .18s both;
      }
      ul {
        list-style: none; display: flex; gap: 40px; flex-wrap: wrap;
        font-size: 19px; margin-top: 6px; animation: sube .6s ease .36s both;
      }
      li { color: #9fb3cd; padding-left: 18px; position: relative }
      li::before {
        content: ''; position: absolute; left: 0; top: .62em;
        width: 6px; height: 6px; border-radius: 99px; background: #60a5fa;
      }
    </style></head><body>
      ${lamina.seccion ? `<div class="n">${lamina.seccion}</div>` : ''}
      <h1>${lamina.titulo ?? ''}</h1>
      ${puntos ? `<ul>${puntos}</ul>` : ''}
    </body></html>`)
  await pausa(lamina.espera ?? 4500)
}

/**
 * Una etiqueta chica en un rincón, para las pantallas que pasan rápido.
 *
 * La sección ya explicó qué se va a ver, así que acá no hace falta un párrafo: alcanza
 * con nombrar la pantalla para que no haya dudas de qué se está mirando. Un cartel
 * grande, además, taparía justo lo que se quiere mostrar.
 */
export async function mostrarEtiqueta(page, texto) {
  await page.evaluate(t => {
    document.getElementById('demo-etiqueta')?.remove()
    if (!t) return
    const d = document.createElement('div')
    d.id = 'demo-etiqueta'
    d.textContent = t
    d.style.cssText = `
      position: fixed; top: 20px; right: 24px; z-index: 2147483647;
      background: rgba(8,13,24,.9); color: #fff; border: 1px solid rgba(255,255,255,.14);
      padding: 7px 16px; border-radius: 999px; pointer-events: none;
      font: 600 14px/1 system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: .01em;`
    document.body.appendChild(d)
  }, texto).catch(() => {})
}
