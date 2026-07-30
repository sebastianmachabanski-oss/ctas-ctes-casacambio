# Version resumida (1 pagina) del reporte de esfuerzo: solo concepto y horas.
from decimal import Decimal, ROUND_HALF_UP
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer

AJUSTE = Decimal('1.15')
SALIDA = '/home/user/ctas-ctes-casacambio/docs/Esfuerzo-desarrollo-resumen.pdf'

TINTA  = colors.HexColor('#1f2937')
SUAVE  = colors.HexColor('#6b7280')
MARCA  = colors.HexColor('#15607a')
LINEA  = colors.HexColor('#dde4ea')
SECCION = colors.HexColor('#eef3f7')


def q(x):
    return Decimal(str(x)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def ar(n):
    return f'{q(n):,.2f}'.replace(',', '@').replace('.', ',').replace('@', '.')


def rango(lo, hi):
    a, b = q(Decimal(str(lo)) * AJUSTE), q(Decimal(str(hi)) * AJUSTE)
    return ar(a) if a == b else f'{ar(a)} - {ar(b)}'


# (concepto, horas_min, horas_max)
BLOQUES = [
    ('PANTALLAS DE LA APLICACIÓN', [
        ('Usuarios', 6, 8),
        ('Nueva transacción', 5.75, 6.75),
        ('Cuentas Corrientes', 4, 5),
        ('Inicio (tablero)', 4, 4.5),
        ('Login, shell y navegación', 3, 3.5),
        ('Auditoría', 2.5, 3),
        ('Transacciones', 1.5, 2),
        ('Saldos Pendientes', 1.5, 2),
        ('Ganancias', 1.5, 1.5),
        ('Sincronizar (admin)', 1, 1.5),
        ('Dinero en calle', 0.5, 0.5),
        ('Mi cuenta', 0.5, 0.5),
    ]),
    ('TRANSFORMACIÓN EXCEL A GOOGLE SHEET', [
        ('Reconciliación Sheet / Excel', 2, 2.5),
        ('Guía de migración a Sheets', 1.5, 2),
        ('Análisis de solapas del Excel', 1, 1.5),
        ('Conmutador de fuente (Excel / Sheet)', 1, 1.5),
    ]),
    ('TRANSFORMACIÓN GOOGLE SHEET A APLICACIÓN', [
        ('Motor de sincronización', 11.5, 14),
        ('Motor de cálculo', 3, 4),
        ('Escritura de vuelta al Sheet', 3, 3.5),
        ('USDT como moneda', 1.5, 2),
        ('Borrado espejado', 1.5, 1.5),
        ('Diagnóstico y arreglo del sync', 1.5, 1.5),
        ('Espejo completo de CAJA', 1, 1),
        ('Validación motor vs planilla', 0.5, 0.5),
        ('Runbook de puesta en producción', 0.5, 0.5),
    ]),
    ('TRANSVERSAL A TODAS LAS PANTALLAS', [
        ('Rediseño de todas las pantallas', 6.75, 6.75),
        ('Mockups y rondas con el cliente', 4, 4),
        ('Detalles de validación', 1.5, 1.5),
        ('Documentación', 1, 1.5),
        ('Menú y fixes varios', 0.5, 0.5),
    ]),
]

ss = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=ss['Title'], fontName='Helvetica-Bold', fontSize=18,
                    textColor=MARCA, alignment=0, spaceAfter=1, leading=22)
sub = ParagraphStyle('sub', parent=ss['Normal'], fontSize=9.5, textColor=SUAVE, spaceAfter=3)
nota = ParagraphStyle('nota', parent=ss['Normal'], fontSize=8.6, textColor=SUAVE, spaceAfter=12)

cel = ParagraphStyle('cel', parent=ss['Normal'], fontSize=9, textColor=TINTA, leading=11)
celB = ParagraphStyle('celB', parent=cel, fontName='Helvetica-Bold')
celSec = ParagraphStyle('celSec', parent=cel, fontName='Helvetica-Bold', fontSize=8.2,
                        textColor=MARCA)
celTot = ParagraphStyle('celTot', parent=cel, fontName='Helvetica-Bold', fontSize=11,
                        textColor=colors.white)

data, estilo = [], []
estilo += [
    ('GRID', (0, 0), (-1, -1), 0.3, LINEA),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 2.3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 2.3),
]

data.append([Paragraph('<b>Concepto</b>', celB), Paragraph('<b>Horas</b>', celB)])
estilo += [('BACKGROUND', (0, 0), (-1, 0), MARCA),
           ('TEXTCOLOR', (0, 0), (-1, 0), colors.white)]
data[0] = [Paragraph('<font color="white"><b>Concepto</b></font>', celB),
           Paragraph('<font color="white"><b>Horas</b></font>', celB)]

TLO = THI = 0.0
for titulo, filas in BLOQUES:
    i = len(data)
    data.append([Paragraph(titulo, celSec), ''])
    estilo += [('BACKGROUND', (0, i), (-1, i), SECCION), ('SPAN', (0, i), (1, i))]
    for concepto, lo, hi in filas:
        data.append([Paragraph(concepto, cel), Paragraph(rango(lo, hi), cel)])
    slo, shi = sum(f[1] for f in filas), sum(f[2] for f in filas)
    TLO += slo
    THI += shi
    j = len(data)
    data.append([Paragraph('<b>Subtotal</b>', celB), Paragraph(f'<b>{rango(slo, shi)}</b>', celB)])
    estilo += [('LINEABOVE', (0, j), (-1, j), 0.7, MARCA)]

k = len(data)
data.append([Paragraph('TOTAL', celTot), Paragraph(rango(TLO, THI), celTot)])
estilo += [('BACKGROUND', (0, k), (-1, k), MARCA),
           ('TOPPADDING', (0, k), (-1, k), 7),
           ('BOTTOMPADDING', (0, k), (-1, k), 7)]

t = Table(data, colWidths=[128*mm, 42*mm])
t.setStyle(TableStyle(estilo))

doc = SimpleDocTemplate(SALIDA, pagesize=A4,
                        leftMargin=20*mm, rightMargin=20*mm,
                        topMargin=15*mm, bottomMargin=13*mm,
                        title='Esfuerzo de desarrollo - Resumen')

story = [
    Paragraph('Esfuerzo de desarrollo', h1),
    Paragraph('Aplicación de gestión para casa de cambio &nbsp;|&nbsp; 14/05/2026 - 30/07/2026', sub),
    Paragraph('Horas de esfuerzo activo (desarrollo y validación). Valores con ajuste del 15 %.', nota),
    t,
]
doc.build(story)
print(f'OK -> {SALIDA}')
print(f'TOTAL: {rango(TLO, THI)} h  (base {ar(TLO)} - {ar(THI)})')
