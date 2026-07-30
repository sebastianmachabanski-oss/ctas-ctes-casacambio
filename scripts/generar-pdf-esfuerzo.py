# Genera el PDF del reporte de esfuerzo con un ajuste del 15 % sobre cada valor.
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, KeepTogether)

from decimal import Decimal, ROUND_HALF_UP
AJUSTE = Decimal('1.15')
SALIDA = '/home/user/ctas-ctes-casacambio/docs/Esfuerzo-desarrollo-casacambio.pdf'

# Paleta sobria, alineada con la identidad de la app.
TINTA   = colors.HexColor('#1f2937')
SUAVE   = colors.HexColor('#6b7280')
MARCA   = colors.HexColor('#15607a')
LINEA   = colors.HexColor('#d7dee6')
CABEZA  = colors.HexColor('#eef3f7')
TOTALBG = colors.HexColor('#15607a')
CEBRA   = colors.HexColor('#f7f9fb')


def q(x):
    """A Decimal con 2 decimales, redondeo HALF_UP (el float redondea 0,575 a 0,57)."""
    return Decimal(str(x)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def ar(n):
    """Número en formato argentino: 1.234,56"""
    s = f'{q(n):,.2f}'
    return s.replace(',', '@').replace('.', ',').replace('@', '.')


def rango(lo, hi):
    """Aplica el ajuste y devuelve el rango ya formateado."""
    a, b = q(Decimal(str(lo)) * AJUSTE), q(Decimal(str(hi)) * AJUSTE)
    return ar(a) if a == b else f'{ar(a)} - {ar(b)}'


# ---------------------------------------------------------------- contenido
# (concepto, detalle, dato, horas_min, horas_max)
PANTALLAS = [
    ('Usuarios', 'Alta, edición, suspensión, borrado, claves iniciales, forzar cambio de clave, Admin API de Supabase, permiso individual de Ganancias', 'Mixto', 6, 8),
    ('Nueva transacción', 'Formulario, comboboxes, operación según tipo, cotización condicional, costo %/DEBE, alta operativa con escritura directa, confirmación de montos altos, umbral de alerta en USD', 'Mixto', 5.75, 6.75),
    ('Cuentas Corrientes', 'Portal, filtros, colores por signo, layout de saldos, saldo acumulado (extracto por cuenta con verificación de cierre exacto)', 'Mixto', 4, 5),
    ('Inicio (tablero)', 'KPIs, clientes, gráficos, filtros de período, períodos de calendario, Saldo en caja (arqueo físico), carrusel de monedas, banda de mercado', 'Mixto', 4, 4.5),
    ('Login, shell y navegación', 'Autenticación, sidebar por rol, topbar, responsive, loaders de transición', 'Estimado', 3, 3.5),
    ('Auditoría', 'Tabla inmutable append-only, registro de alta/edición/borrado/ingreso de calle, columna Registro en Transacciones, pantalla global filtrable con antes/después', 'Estimado', 2.5, 3),
    ('Transacciones', 'Listado con filtros por columna y paginación, editar, borrar', 'Medido', 1.5, 2),
    ('Saldos Pendientes', 'Listado de deudores con totales', 'Estimado', 1.5, 2),
    ('Ganancias', 'Réplica de COLO parametrizable, rango de fechas, configuración en drawer', 'Medido', 1.5, 1.5),
    ('Sincronizar (admin)', 'Sync manual, polling de confirmación, estado de la última corrida', 'Estimado', 1, 1.5),
    ('Dinero en calle', 'Listado de dinero en la calle, marcar ingreso', 'Medido', 0.5, 0.5),
    ('Mi cuenta', 'Cambio de contraseña', 'Estimado', 0.5, 0.5),
]

EXCEL_SHEET = [
    ('Reconciliación Sheet / Excel', 'Cuadrar ambos archivos hasta el último centavo. Causa raíz encontrada: 20 cotizaciones EUR/USD cargadas como 1', 'Estimado', 2, 2.5),
    ('Guía de migración a Sheets', 'Recrear las 6 tablas dinámicas, rango abierto A6:AO para que crezcan solas, formato de SEMANA/MES, controles de filtro, fila de encabezados', 'Estimado', 1.5, 2),
    ('Análisis de solapas del Excel', 'Script de relevamiento y documentación de qué es dato, qué es tabla dinámica y qué es residuo', 'Estimado', 1, 1.5),
    ('Conmutador de fuente', 'SYNC_SOURCE: el sync lee del .xlsx o del Sheet nativo, switch instantáneo y reversible por variable de entorno', 'Estimado', 1, 1.5),
]

SHEET_APP = [
    ('Motor de sincronización', 'Drive/Sheets API, JWT de cuenta de servicio, parser de números argentinos, formato contable con paréntesis, fechas en múltiples formatos, borrado de duplicados, modos full/incremental, funciones background', 'Estimado', 11.5, 14),
    ('Motor de cálculo', 'Réplica aislada de las fórmulas de la planilla (CUENTA, PESOS, DÓLARES, CC...), validada contra los datos reales', 'Estimado', 3, 4),
    ('Escritura de vuelta al Sheet', 'Alta desde la app que escribe en la planilla reemplazando la fila pre-armada sin romper fórmulas; manejo de timeouts', 'Estimado', 3, 3.5),
    ('USDT como moneda', 'Moneda solo-app que no existe en la planilla: motor, alta, marca de origen para que el sync no la borre, banda de mercado', 'Estimado', 1.5, 2),
    ('Borrado espejado', 'Eliminar en la app limpia la fila en la planilla, con identificación por contenido y avisos ante ambigüedad', 'Medido', 1.5, 1.5),
    ('Diagnóstico y arreglo del sync', 'Proyecto equivocado, migraciones faltantes, columna cot_efectiva (COTEXT vs COT)', 'Medido', 1.5, 1.5),
    ('Espejo completo de CAJA', 'Tabla movimientos_caja con las 33.528 filas y validación automática por corrida', 'Medido', 1, 1),
    ('Validación motor vs planilla', 'Recálculo en paralelo de cada fila: 100,00 % de coincidencia exacta', 'Medido', 0.5, 0.5),
    ('Runbook de puesta en producción', 'Backups, carga de la solapa CAJA, precisión de cotizaciones, full sync, verificación y rollback', 'Estimado', 0.5, 0.5),
]

TRANSVERSAL = [
    ('Rediseño de todas las pantallas', 'Reconstrucción a rajatabla del mockup validado con el cliente', 'Medido', 6.75, 6.75),
    ('Mockups y rondas con el cliente', 'Tablero, ganancia y app completa, con sus rondas de ajuste', 'Medido', 4, 4),
    ('Detalles de validación', 'Columna Cot., loaders, login, leyenda de contraseña, Ganancias en mes en curso, fix de paginación RPC', 'Medido', 1.5, 1.5),
    ('Documentación', 'Sincronización, backups, motor de cálculo, roadmap de mejoras', 'Estimado', 1, 1.5),
    ('Menú y fixes varios', 'Habilitar pantallas, filtro Tipo en Cuentas Corrientes', 'Estimado', 0.5, 0.5),
]

BACKLOG = [
    ('1', 'CAJA completa en la base (sync + migración + validación)', 6, 8, 1, 1),
    ('2', 'Validación en paralelo motor vs planilla', 3, 4, 0.5, 0.5),
    ('3', 'Visualizar transacciones', 5, 7, 0.75, 0.75),
    ('4', 'Editar transacción', 4, 6, 0.75, 0.75),
    ('5', 'Dinero en calle', 4, 6, 0.5, 0.5),
    ('6', 'Tablero de Inicio', 12, 15, 2.5, 2.5),
    ('7', 'Ganancias (réplica COLO)', 5, 7, 1.5, 1.5),
    ('8', 'Permiso individual de Ganancias', 2, 3, 0.5, 0.5),
]

# ---------------------------------------------------------------- estilos
ss = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=ss['Title'], fontName='Helvetica-Bold',
                    fontSize=19, textColor=MARCA, spaceAfter=2, alignment=0, leading=23)
sub = ParagraphStyle('sub', parent=ss['Normal'], fontSize=10, textColor=SUAVE, spaceAfter=14)
h2 = ParagraphStyle('h2', parent=ss['Heading2'], fontName='Helvetica-Bold',
                    fontSize=12.5, textColor=MARCA, spaceBefore=15, spaceAfter=7)
body = ParagraphStyle('body', parent=ss['Normal'], fontSize=9.3, textColor=TINTA,
                      leading=13.5, alignment=TA_JUSTIFY, spaceAfter=7)
nota = ParagraphStyle('nota', parent=body, fontSize=8.7, textColor=SUAVE, leading=12)
celda = ParagraphStyle('celda', parent=ss['Normal'], fontSize=8, textColor=TINTA, leading=10.2)
celdaB = ParagraphStyle('celdaB', parent=celda, fontName='Helvetica-Bold', fontSize=8.4)
celdaD = ParagraphStyle('celdaD', parent=celda, fontSize=7.4, textColor=SUAVE, leading=9.4)

ANCHOS = [42*mm, 82*mm, 18*mm, 28*mm]


def tabla_bloque(filas, titulo_sub, total_lo, total_hi):
    data = [[Paragraph('<b>Concepto</b>', celdaB), Paragraph('<b>Alcance</b>', celdaB),
             Paragraph('<b>Dato</b>', celdaB), Paragraph('<b>Horas</b>', celdaB)]]
    for concepto, detalle, dato, lo, hi in filas:
        data.append([
            Paragraph(concepto, celdaB),
            Paragraph(detalle, celdaD),
            Paragraph(dato, celdaD),
            Paragraph(f'<b>{rango(lo, hi)}</b>', celda),
        ])
    data.append([Paragraph(f'<b>{titulo_sub}</b>', celdaB), '', '',
                 Paragraph(f'<b>{rango(total_lo, total_hi)}</b>', celda)])

    t = Table(data, colWidths=ANCHOS, repeatRows=1)
    estilo = [
        ('BACKGROUND', (0, 0), (-1, 0), CABEZA),
        ('LINEBELOW', (0, 0), (-1, 0), 0.8, MARCA),
        ('GRID', (0, 0), (-1, -1), 0.3, LINEA),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
        ('ALIGN', (2, 0), (2, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('BACKGROUND', (0, -1), (-1, -1), CABEZA),
        ('SPAN', (0, -1), (2, -1)),
        ('LINEABOVE', (0, -1), (-1, -1), 0.8, MARCA),
    ]
    for i in range(1, len(data) - 1):
        if i % 2 == 0:
            estilo.append(('BACKGROUND', (0, i), (-1, i), CEBRA))
    t.setStyle(TableStyle(estilo))
    return t


def suma(filas):
    return sum(f[3] for f in filas), sum(f[4] for f in filas)


# ---------------------------------------------------------------- documento
doc = SimpleDocTemplate(SALIDA, pagesize=A4,
                        leftMargin=17*mm, rightMargin=17*mm,
                        topMargin=16*mm, bottomMargin=16*mm,
                        title='Esfuerzo de desarrollo - App Casa de Cambio',
                        author='Reporte de esfuerzo')

story = []
story.append(Paragraph('Esfuerzo de desarrollo', h1))
story.append(Paragraph('Aplicación de gestión para casa de cambio &nbsp;|&nbsp; '
                       'Período 14/05/2026 - 30/07/2026', sub))

story.append(Paragraph(
    'Detalle del esfuerzo invertido en el proyecto, desagregado por pantalla y funcionalidad. '
    'Los tiempos están expresados en <b>horas de esfuerzo activo</b> (desarrollo y validación), '
    'sin tiempos muertos ni esperas.', body))
story.append(Paragraph(
    '<b>Todos los valores de este documento incluyen un ajuste del 15 % sobre el esfuerzo relevado.</b>', body))
story.append(Paragraph(
    '<b>Calidad del dato.</b> El registro formal de tiempo comenzó el 05/07/2026. Las semanas previas '
    'se reconstruyeron a partir del historial de commits del repositorio. Cada fila indica su caso: '
    '<b>Medido</b> (registrado al cerrar el ítem, dato firme), <b>Estimado</b> (reconstruido del historial, '
    'aproximación razonada) o <b>Mixto</b> (parte medida, parte estimada).', nota))

story.append(Paragraph('1. Pantallas de la aplicación', h2))
lo, hi = suma(PANTALLAS)
story.append(tabla_bloque(PANTALLAS, 'Subtotal pantallas', lo, hi))
tot_pant = (lo, hi)

lo, hi = suma(EXCEL_SHEET)
story.append(KeepTogether([
    Paragraph('2. Transformación Excel a Google Sheet', h2),
    Paragraph('Llevar la planilla original (.xlsx con tablas dinámicas rotas) a un Google Sheet '
              'nativo y funcional, que es la fuente que hoy lee la aplicación.', body),
    tabla_bloque(EXCEL_SHEET, 'Subtotal Excel a Sheet', lo, hi)]))
tot_es = (lo, hi)

lo, hi = suma(SHEET_APP)
story.append(KeepTogether([
    Paragraph('3. Transformación Google Sheet a Aplicación', h2),
    Paragraph('El puente entre la planilla y la base de datos. Es el bloque más grande del proyecto.', body),
    tabla_bloque(SHEET_APP, 'Subtotal Sheet a App', lo, hi)]))
tot_sa = (lo, hi)

lo, hi = suma(TRANSVERSAL)
story.append(KeepTogether([
    Paragraph('4. Transversal a todas las pantallas', h2),
    tabla_bloque(TRANSVERSAL, 'Subtotal transversal', lo, hi)]))
tot_tr = (lo, hi)

# ------------------------------------------------------------------ total
_total_head = Paragraph('Total', h2)
bloques = [('1. Pantallas de la aplicación', tot_pant),
           ('2. Transformación Excel a Google Sheet', tot_es),
           ('3. Transformación Google Sheet a Aplicación', tot_sa),
           ('4. Transversal', tot_tr)]
data = [[Paragraph('<b>Bloque</b>', celdaB), Paragraph('<b>Horas</b>', celdaB)]]
for nombre, (a, b) in bloques:
    data.append([Paragraph(nombre, celda), Paragraph(f'<b>{rango(a, b)}</b>', celda)])
TLO = sum(b[1][0] for b in bloques)
THI = sum(b[1][1] for b in bloques)
blanco = ParagraphStyle('blanco', parent=celda, textColor=colors.white,
                        fontName='Helvetica-Bold', fontSize=10)
data.append([Paragraph('TOTAL', blanco), Paragraph(rango(TLO, THI), blanco)])

tt = Table(data, colWidths=[142*mm, 28*mm])
tt.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), CABEZA),
    ('LINEBELOW', (0, 0), (-1, 0), 0.8, MARCA),
    ('GRID', (0, 0), (-1, -1), 0.3, LINEA),
    ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('BACKGROUND', (0, -1), (-1, -1), TOTALBG),
]))
story.append(KeepTogether([_total_head, tt]))

# ------------------------------------------------------- lecturas de negocio
lect = []
lect.append(Paragraph('Lecturas para presupuestar', h2))
t_lo, t_hi = tot_es[0] + tot_sa[0], tot_es[1] + tot_sa[1]
lect.append(Paragraph(
    f'<b>Las dos transformaciones se llevan casi el 40 % del proyecto.</b> Sumando los bloques 2 y 3 '
    f'son {rango(t_lo, t_hi)} horas, contra {rango(*tot_pant)} horas de todas las pantallas juntas. '
    'Dicho de otro modo: construir el puente con la planilla costó casi lo mismo que construir la '
    'aplicación entera.', body))
lect.append(Paragraph(
    '<b>Ese esfuerzo desaparece cuando se retire la planilla.</b> La sincronización, la escritura de '
    'vuelta al Sheet, el borrado espejado y el conmutador de fuente se eliminan por completo. El motor '
    'de cálculo permanece, ya que pasa a ser el cálculo propio de la aplicación. Es el argumento más '
    'concreto para abandonar el Excel: hoy se sostiene un puente que existe únicamente porque hay dos '
    'fuentes de verdad.', body))
lect.append(Paragraph(
    '<b>Ratio contra presupuesto tradicional.</b> En la parte medida, los 8 ítems del backlog para '
    'abandonar la planilla se presupuestaron en 41 a 56 horas y se ejecutaron en 8 horas (relación '
    'aproximada de 1 a 6). Ese ratio aplica a construcción sobre una base ya establecida y no conviene '
    'extrapolarlo al bloque 3, donde la depuración iterativa contra datos reales acota la ventaja.', body))
story.append(KeepTogether(lect))

# ------------------------------------------------------------------ anexo
_anexo = [Paragraph('Anexo: los 8 ítems del backlog original', h2),
Paragraph(
    'Trazabilidad del presupuesto acordado oportunamente con el cliente. Todos cerrados y ya '
    'distribuidos en las tablas anteriores. La columna de presupuesto conserva el valor original '
    'acordado (sin ajuste); la de esfuerzo real incluye el ajuste del 15 %.', nota)]

data = [[Paragraph('<b>#</b>', celdaB), Paragraph('<b>Ítem</b>', celdaB),
         Paragraph('<b>Presupuesto original</b>', celdaB), Paragraph('<b>Real ajustado</b>', celdaB)]]
for n, ítem, plo, phi, rlo, rhi in BACKLOG:
    pres = f'{ar(plo)} - {ar(phi)}'
    data.append([Paragraph(n, celda), Paragraph(ítem, celda),
                 Paragraph(pres, celda), Paragraph(f'<b>{rango(rlo, rhi)}</b>', celda)])
bl_p = (sum(b[2] for b in BACKLOG), sum(b[3] for b in BACKLOG))
bl_r = (sum(b[4] for b in BACKLOG), sum(b[5] for b in BACKLOG))
data.append([Paragraph('', celda), Paragraph('<b>Total backlog</b>', celdaB),
             Paragraph(f'<b>{ar(bl_p[0])} - {ar(bl_p[1])}</b>', celda),
             Paragraph(f'<b>{rango(*bl_r)}</b>', celda)])

ta = Table(data, colWidths=[8*mm, 96*mm, 34*mm, 32*mm], repeatRows=1)
est = [
    ('BACKGROUND', (0, 0), (-1, 0), CABEZA),
    ('LINEBELOW', (0, 0), (-1, 0), 0.8, MARCA),
    ('GRID', (0, 0), (-1, -1), 0.3, LINEA),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('ALIGN', (2, 0), (3, -1), 'RIGHT'),
    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ('BACKGROUND', (0, -1), (-1, -1), CABEZA),
    ('LINEABOVE', (0, -1), (-1, -1), 0.8, MARCA),
]
for i in range(1, len(data) - 1):
    if i % 2 == 0:
        est.append(('BACKGROUND', (0, i), (-1, i), CEBRA))
ta.setStyle(TableStyle(est))
story.append(KeepTogether(_anexo + [ta]))


def pie(canvas, doc_):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(SUAVE)
    canvas.drawString(17*mm, 10*mm,
                      'Esfuerzo de desarrollo - App Casa de Cambio | Valores con ajuste del 15 %')
    canvas.drawRightString(A4[0] - 17*mm, 10*mm, f'Página {doc_.page}')
    canvas.setStrokeColor(LINEA)
    canvas.setLineWidth(0.4)
    canvas.line(17*mm, 13.5*mm, A4[0] - 17*mm, 13.5*mm)
    canvas.restoreState()


doc.build(story, onFirstPage=pie, onLaterPages=pie)
print(f'OK -> {SALIDA}')
print(f'TOTAL ajustado: {rango(TLO, THI)} h   (base sin ajuste: {ar(TLO)} - {ar(THI)})')
