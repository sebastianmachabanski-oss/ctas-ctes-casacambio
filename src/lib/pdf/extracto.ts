import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { esIngreso, ref, type DatosExtracto } from '@/lib/consultas/extracto'

/**
 * Extracto de cuenta corriente en PDF.
 *
 * POR QUÉ NO ES "IMPRIMIR LA PANTALLA"
 * Hasta el 10/9/2026 el botón abría una pestaña y disparaba el diálogo de impresión: el
 * usuario tenía que elegir "Guardar como PDF" a mano, y para mandarlo por WhatsApp eran
 * once pasos. Acá el archivo se genera de verdad, así que se puede descargar de un clic
 * y —en el teléfono— compartir directo.
 *
 * SE GENERA EN EL SERVIDOR, no en el navegador. La cuenta más grande tiene unos 7.700
 * movimientos y el tope es 20.000: en el navegador eso bloquea la pestaña varios segundos.
 * De paso, el navegador no carga la librería.
 *
 * FUENTE: la Helvetica que trae jsPDF codifica WinAnsi, que cubre acentos, ñ y €. No hace
 * falta empotrar una tipografía —serían cientos de KB en cada PDF— pero ojo si algún día
 * entra un símbolo fuera de ese juego: saldría mal en silencio.
 */

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (v: number) => (v < 0 ? `(${nf.format(-v)})` : nf.format(v))
const fechaAr = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR')

// A4 apaisado, como la vista de impresión: con cinco monedas más el acumulado, en vertical
// no entran las columnas.
const ANCHO = 297, ALTO = 210, MARGEN = 10
const GRIS = 110, TINTA = 17, ROJO: [number, number, number] = [176, 0, 32]

export function generarExtractoPdf(d: DatosExtracto): Uint8Array {
  // `compress` no es opcional acá: sin él, el extracto de 7.700 movimientos pesa casi
  // 14 MB. Comprimido baja a una fracción, que es la diferencia entre un archivo que se
  // manda por WhatsApp sin pensarlo y uno que hay que explicar.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })

  // ── Encabezado ──────────────────────────────────────────────────────────
  let y = MARGEN + 4
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(GRIS)
  doc.text('CUENTA CORRIENTE', MARGEN, y)

  y += 7
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(TINTA)
  doc.text(d.cuenta, MARGEN, y)

  y += 6
  const meta: [string, string][] = [
    ['Período', d.periodo],
    ...(d.filtroOp ? [['Filtro', d.filtroOp] as [string, string]] : []),
    ['Movimientos', d.total.toLocaleString('es-AR')],
    ['Emitido', new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })],
  ]
  let x = MARGEN
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(k.toUpperCase(), x, y)
    const anchoK = doc.getTextWidth(k.toUpperCase())
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(TINTA)
    doc.text(v, x + anchoK + 2, y)
    x += anchoK + 2 + doc.getTextWidth(v) + 9
  }

  y += 3
  doc.setDrawColor(TINTA).setLineWidth(0.4).line(MARGEN, y, ANCHO - MARGEN, y)
  y += 7

  // ── Saldo de la cuenta ──────────────────────────────────────────────────
  // Es el saldo HISTÓRICO completo, no el del período listado. La aclaración va debajo
  // porque sin ella el número se lee como el resultado del período y no lo es.
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(GRIS)
  doc.text('SALDO DE LA CUENTA', MARGEN, y)
  y += 4

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    tableWidth: 110,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1, bottom: 1, left: 0, right: 4 } },
    body: d.monedas.map(m => {
      const v = Number(d.saldos[m.saldo] ?? 0)
      return [
        { content: m.label, styles: { fontStyle: 'bold' as const, textColor: TINTA } },
        {
          content: `${m.sym} ${money(v)}`,
          styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: v < 0 ? ROJO : TINTA },
        },
        {
          content: v > 0 ? 'saldo pendiente' : v < 0 ? 'a favor del cliente' : 'sin saldo',
          styles: { textColor: GRIS, fontSize: 8 },
        },
      ]
    }),
  })
  y = (doc as any).lastAutoTable.finalY + 3

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text('El saldo corresponde a la totalidad de los movimientos de la cuenta, no al período listado.', MARGEN, y)
  y += 7

  // ── Movimientos ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(GRIS)
  doc.text('MOVIMIENTOS', MARGEN, y)
  y += 3

  if (d.movimientos.length === 0) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(GRIS)
    doc.text('No hay movimientos para el período seleccionado.', MARGEN, y + 5)
    pieDePagina(doc, d)
    return new Uint8Array(doc.output('arraybuffer'))
  }

  const cabecera = [
    'Fecha', 'Operación', 'Detalle', 'Ref.',
    ...d.monedas.map(m => m.label),
    ...(d.conAcumulado ? ['Saldo acumulado'] : []),
  ]

  const cuerpo = d.movimientos.map(m => {
    const ing = esIngreso(m.operacion)
    const fila: any[] = [
      fechaAr(m.fecha),
      m.operacion ?? '',
      m.concepto ?? '—',
      ref(m) ?? '—',
    ]
    for (const mo of d.monedas) {
      const v = Number(m[mo.cc] ?? 0)
      if (!v) {
        fila.push({ content: '—', styles: { halign: 'right' as const, textColor: 190 } })
      } else {
        // El signo se lee por la operación, no por el signo guardado: un EGRESAN va entre
        // paréntesis aunque en la base esté positivo. Es como lo lee la planilla.
        const txt = ing ? nf.format(Math.abs(v)) : `(${nf.format(Math.abs(v))})`
        fila.push({
          content: `${mo.sym} ${txt}`,
          styles: { halign: 'right' as const, textColor: ing ? TINTA : ROJO },
        })
      }
    }
    if (d.conAcumulado) {
      fila.push({
        content: d.monedas.map(mo => `${mo.sym} ${money(Number(m[mo.acum]) || 0)}`).join('  '),
        styles: { halign: 'right' as const, fontSize: 6.8, textColor: GRIS },
      })
    }
    return fila
  })

  const pie: any[] = [
    { content: 'Total del período', colSpan: 4, styles: { fontStyle: 'bold' as const } },
    ...d.monedas.map(mo => {
      const v = Number(d.totales[mo.cc]) || 0
      return {
        content: `${mo.sym} ${money(v)}`,
        styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: v < 0 ? ROJO : TINTA },
      }
    }),
    ...(d.conAcumulado ? [{ content: '' }] : []),
  ]

  // Anchos fijos para las columnas de texto y para el acumulado; las de moneda se reparten
  // lo que sobra. Están calibrados para el peor caso —cinco monedas más el acumulado—:
  // con menos margen, un importe como "U$S (3.890,08)" no entra y se parte en dos
  // renglones, que además estira todas las filas de la hoja.
  const fijas: Record<number, any> = {
    0: { cellWidth: 15 }, 1: { cellWidth: 20 }, 2: { cellWidth: 28 }, 3: { cellWidth: 22 },
  }
  if (d.conAcumulado) {
    fijas[4 + d.monedas.length] = { cellWidth: 46, fontSize: 6.2, halign: 'right' }
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN, bottom: 14 },
    head: [cabecera],
    body: cuerpo,
    foot: [pie],
    // 'striped' y no 'grid': la grilla completa dibuja cuatro líneas por celda y en un
    // extracto de miles de filas eso es la mayor parte del peso del archivo. Con el
    // sombreado alternado se sigue el renglón igual de bien.
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.4, overflow: 'linebreak' },
    alternateRowStyles: { fillColor: 247 },
    headStyles: { fillColor: 238, textColor: 60, fontStyle: 'bold', fontSize: 7 },
    footStyles: { fillColor: 238, textColor: TINTA, fontSize: 7.5, fontStyle: 'bold' },
    columnStyles: fijas,
    // El encabezado se repite en cada hoja: un extracto de 7.700 movimientos son decenas
    // de páginas y sin esto, de la segunda en adelante, no se sabe qué columna es cuál.
    showHead: 'everyPage',
    // Una fila NO se parte entre dos hojas. Por defecto autoTable la corta donde cae, y
    // en el extracto eso deja el arranque de la página siguiente con media fila suelta:
    // el saldo acumulado sin la fecha ni el importe que lo produjeron.
    rowPageBreak: 'avoid',
    showFoot: 'lastPage',
    didDrawPage: () => pieDePagina(doc, d),
  })

  if (d.recortado) {
    const yFin = (doc as any).lastAutoTable.finalY + 5
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...ROJO)
    doc.text(
      `El período contiene ${d.total.toLocaleString('es-AR')} movimientos y se imprimen los primeros ` +
      `${(20000).toLocaleString('es-AR')}. Acotá las fechas para incluirlos todos.`,
      MARGEN, yFin,
    )
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

/** Cuenta y número de página al pie: sin esto, hojas sueltas no se pueden reordenar. */
function pieDePagina(doc: jsPDF, d: DatosExtracto) {
  const n = (doc as any).internal.getNumberOfPages()
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
  doc.text(`${d.cuenta} · ${d.periodo}`, MARGEN, ALTO - 6)
  doc.text(`Página ${n}`, ANCHO - MARGEN, ALTO - 6, { align: 'right' })
}
