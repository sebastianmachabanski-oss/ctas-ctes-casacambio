# Plan vs Real — esfuerzo de desarrollo

Esfuerzo invertido en el proyecto (14/5 → 30/7/2026), desagregado por pantalla y
funcionalidad. Los tiempos son **horas de esfuerzo activo** (desarrollo + validación en
sesión), sin tiempos muertos ni esperas.

**Calidad del dato.** El registro formal de tiempo arrancó el 5/7/2026; las siete semanas
previas no se cronometraron y se reconstruyeron el 30/7 a partir del historial de commits.
Cada fila indica cuál es su caso:

| | |
|---|---|
| ✅ | **Medido** — registrado al cerrar el ítem. Dato firme. |
| 📊 | **Estimado** — reconstruido del historial (volumen de commits, densidad de iteración y alcance). Aproximación razonada. |
| ✅📊 | **Mixto** — parte medida, parte estimada. |

---

## 1. Pantallas de la app

| Pantalla | Qué incluye | Dato | Horas |
|---|---|---|---|
| **Nueva transacción** | Formulario, comboboxes, operación según tipo, cotización condicional, costo %/DEBE, alta operativa con escritura directa (visible al instante), confirmación de montos altos, umbral de alerta configurable en USD | ✅📊 | **5,75 – 6,75** |
| **Usuarios** | Alta, edición, suspensión, borrado, claves iniciales, forzar cambio de clave, Admin API de Supabase, permiso individual de Ganancias | ✅📊 | **6 – 8** |
| **Cuentas Corrientes** | Portal original, filtros, colores por signo, layout de saldos, saldo acumulado (extracto por cuenta con verificación de cierre exacto) | ✅📊 | **4 – 5** |
| **Inicio (tablero)** | KPIs, clientes, gráficos, filtros de período, períodos de calendario, "Saldo en caja" (arqueo físico), carrusel de monedas, banda de mercado | ✅📊 | **4 – 4,5** |
| **Login, shell y navegación** | Autenticación, sidebar por rol, topbar, responsive, loaders de transición | 📊 | **3 – 3,5** |
| **Auditoría** | Tabla inmutable append-only, registro de alta/edición/borrado/ingreso de calle, columna "Registró" en Transacciones, pantalla global filtrable con antes/después | 📊 | **2,5 – 3** |
| **Transacciones** | Listado con filtros por columna y paginación, editar, borrar | ✅ | **1,5 – 2** |
| **Saldos Pendientes** | Listado de deudores con totales | 📊 | **1,5 – 2** |
| **Ganancias** | Réplica de COLO parametrizable, rango de fechas, configuración en drawer | ✅ | **1,5** |
| **Sincronizar (admin)** | Botón de sync manual, polling de confirmación, estado de última corrida | 📊 | **1 – 1,5** |
| **Dinero en calle** | Listado de dinero en la calle, marcar ingreso | ✅ | **0,5** |
| **Mi cuenta** | Cambio de contraseña | 📊 | **0,5** |

**Subtotal pantallas: ≈ 32 – 39 h**

---

## 2. Transformación Excel → Google Sheet

Llevar la planilla original (`.xlsx` con tablas dinámicas rotas) a un Google Sheet nativo
y funcional, que es lo que hoy lee la app.

| Trabajo | Qué incluye | Dato | Horas |
|---|---|---|---|
| **Reconciliación Sheet ↔ Excel** | Cuadrar los dos archivos hasta el último centavo. Causa raíz encontrada: 20 cotizaciones EUR/USD cargadas como 1 | 📊 | **2 – 2,5** |
| **Guía de migración a Sheets** | Recrear las 6 tablas dinámicas, rango abierto `A6:AO` para que crezcan solas, formato de SEMANA/MES, controles de filtro, fila de encabezados | 📊 | **1,5 – 2** |
| **Análisis de solapas del Excel** | Script de relevamiento + documentación de qué es dato, qué es TD y qué es basura residual | 📊 | **1 – 1,5** |
| **Conmutador de fuente** | `SYNC_SOURCE`: el sync lee del `.xlsx` o del Sheet nativo, switch instantáneo y reversible por variable de entorno | 📊 | **1 – 1,5** |

**Subtotal Excel → Sheet: ≈ 5,5 – 7,5 h**

---

## 3. Transformación Google Sheet → App

El puente entre la planilla y la base de datos. Es el bloque más grande del proyecto.

| Trabajo | Qué incluye | Dato | Horas |
|---|---|---|---|
| **Motor de sincronización** | Drive/Sheets API, JWT de cuenta de servicio, parser de números argentinos, formato contable con paréntesis, fechas en múltiples formatos, borrado de duplicados, modos full/incremental, funciones background de Netlify | 📊 | **11,5 – 14** |
| **Motor de cálculo** | Réplica aislada de las fórmulas de la planilla (CUENTA, PESOS, DÓLARES, CC…), validada contra los datos reales | 📊 | **3 – 4** |
| **Escritura de vuelta al Sheet** | Alta desde la app que escribe en la planilla reemplazando la fila pre-armada (`OPERACION?`) sin romper fórmulas; manejo de timeouts de Netlify | 📊 | **3 – 3,5** |
| **USDT como moneda** | Moneda solo-app que no existe en la planilla: motor, alta, marca `origen` para que el sync no la borre, banda de mercado | 📊 | **1,5 – 2** |
| **Borrado espejado** | Eliminar en la app limpia la fila en la planilla copiando una fila pre-armada, con identificación por contenido y avisos ante ambigüedad | ✅ | **1,5** |
| **Diagnóstico y arreglo del sync/datos** | Proyecto equivocado, migraciones faltantes, columna `cot_efectiva` (COTEXT vs COT) | ✅ | **1,5** |
| **Espejo completo de CAJA** | Tabla `movimientos_caja` con las 33.528 filas y validación automática por corrida | ✅ | **1** |
| **Validación motor vs planilla** | Recálculo en paralelo de cada fila: 100,00 % de coincidencia exacta | ✅ | **0,5** |
| **Runbook de puesta en producción** | Backups, carga de la solapa CAJA, precisión de cotizaciones, full sync, verificación y rollback | 📊 | **0,5** |

**Subtotal Sheet → App: ≈ 24 – 28,5 h**

---

## 4. Transversal a todas las pantallas

| Trabajo | Dato | Horas |
|---|---|---|
| **Rediseño de todas las pantallas** a rajatabla del mockup validado | ✅ | **6,75** |
| **Mockups** (tablero, ganancia, app completa) + rondas de ajuste con el cliente | ✅ | **4** |
| **Detalles de validación** (columna Cot., loaders, login, leyenda de contraseña, Ganancias en mes en curso, fix de paginación RPC) | ✅ | **1,5** |
| **Documentación** técnica y comercial (sincronización, backups, motor de cálculo, roadmap de mejoras) | 📊 | **1 – 1,5** |
| **Menú y fixes varios** (habilitar pantallas, filtro Tipo en Cuentas Corrientes) | 📊 | **0,5** |

**Subtotal transversal: ≈ 13,75 – 14,25 h**

---

## Total

| Bloque | Horas |
|---|---|
| 1. Pantallas de la app | 32 – 39 |
| 2. Transformación Excel → Google Sheet | 5,5 – 7,5 |
| 3. Transformación Google Sheet → App | 24 – 28,5 |
| 4. Transversal | 13,75 – 14,25 |
| **TOTAL** | **≈ 75 – 89 h** |

De ese total, **≈ 27 h están medidas** y el resto es reconstrucción.

---

## Lecturas útiles para presupuestar

**Las dos transformaciones se llevan casi el 40 % del proyecto.** Sumando los bloques 2 y
3 son **29,5 a 36 h** contra 32 a 39 h de todas las pantallas juntas. Dicho de otro modo:
construir el puente con la planilla costó casi lo mismo que construir la aplicación
entera.

**Ese esfuerzo desaparece cuando se retire la planilla.** El sync, `excel-write`, el
borrado espejado y el conmutador de fuente se eliminan por completo; el motor de cálculo
queda (pasa a ser el cálculo propio de la app). Es el argumento más concreto para
convencer al cliente de abandonar el Excel: hoy se paga mantenimiento de un puente que
existe solo porque hay dos fuentes de verdad.

**Ratio contra presupuesto tradicional.** En la parte medida, los 8 ítems del backlog para
abandonar la planilla se presupuestaron en 41–56 h y se ejecutaron en 7,5 h (≈ 1:6). Ese
ratio aplica a construcción sobre una base ya establecida; **no conviene extrapolarlo a
ciegas** al bloque 3, donde la depuración iterativa contra datos reales acota mucho la
ventaja.

---

## Detalle de los 8 ítems del backlog original

Para trazabilidad del presupuesto acordado con el cliente. Todos cerrados y ya
distribuidos en las tablas de arriba.

| # | Ítem | Presupuesto | Real |
|---|---|---|---|
| 1 | CAJA completa en la base (sync + migración + validación) | 6–8 h | ~1 h |
| 2 | Validación en paralelo motor vs planilla | 3–4 h | ~0,5 h |
| 3 | Visualizar transacciones | 5–7 h | ~0,75 h |
| 4 | Editar transacción | 4–6 h | ~0,75 h |
| 5 | Dinero en calle | 4–6 h | ~0,5 h |
| 6 | Tablero de Inicio | 12–15 h | ~2,5 h |
| 7 | Ganancias (réplica COLO) | 5–7 h | ~1,5 h |
| 8 | Permiso individual de Ganancias | 2–3 h | ~0,5 h |
| | **Total backlog** | **41–56 h** | **~7,5 h** |

---

## Estado

Desarrollo del objetivo inicial (digitalizar, modernizar y securizar la operatoria del
Excel) **finalizado al 29/7/2026**. Pendiente: UAT del cliente, que puede derivar en
correcciones.

- Mejoras futuras ofrecibles por separado: `docs/ROADMAP-MEJORAS.md`
- Puesta en producción y migración de datos: `docs/PUESTA-EN-PRODUCCION.md`
