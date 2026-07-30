# Plan vs Real — esfuerzo de desarrollo

Seguimiento del esfuerzo invertido en la app, desagregado por pantalla y funcionalidad.

## Cómo leer este documento

- **Esfuerzo (presupuesto)**: horas-desarrollador tradicionales, base para presupuestar
  al cliente.
- **Tiempo activo real**: lo efectivamente consumido en sesión (desarrollo + validación),
  sin tiempos muertos ni esperas entre respuestas.

⚠️ **Dos calidades de dato.** El registro de tiempo arrancó el 5/7/2026. Todo lo anterior
(14/5 al 3/7, 169 commits) nunca se cronometró:

| Marca | Significado |
|---|---|
| ✅ **Medido** | Registrado al cerrar cada ítem. Dato firme. |
| 📊 **Estimado** | Reconstruido el 30/7/2026 a partir del historial de commits (volumen, densidad de iteración y alcance de cada fase). Es una aproximación razonada, no una medición. |

---

## 1. Fase inicial — portal, usuarios y sincronización (14/5 → 3/7/2026) 📊

Sin registro de tiempo. Estimación reconstruida del historial.

| Funcionalidad | Commits | Tiempo activo estimado |
|---|---|---|
| **Sincronización con la planilla** — Drive → Sheets API, JWT de cuenta de servicio, parser de números argentinos, formato contable con paréntesis, fechas en múltiples formatos, borrado de duplicados, cron/background de Netlify, polling de confirmación | ~56 | **14 – 18 h** |
| **Gestión de usuarios** — alta, edición, suspensión, borrado, claves iniciales, forzar cambio, Admin API de Supabase | ~40 | **6 – 8 h** |
| **Nueva transacción + escritura al Sheet** — formulario, comboboxes, fila pre-armada (`OPERACION?`), timeouts de Netlify | ~15 | **6 – 8 h** |
| **Motor de cálculo aislado** + réplica exacta de COLO + reconciliación Sheet↔Excel | ~4 | **4 – 6 h** |
| **Setup, login, shell y responsive** | ~12 | **3 – 4 h** |
| **Cuentas Corrientes** — portal original, filtros, colores por signo | ~8 | **3 – 4 h** |
| **Saldos Pendientes / Deudores** | ~6 | **1,5 – 2 h** |
| **Documentación** — análisis de solapas, guía de migración a Sheets, sincronización, backups | ~12 | **2 – 3 h** |

**Subtotal fase inicial: ≈ 40 – 53 h** 📊

> La sincronización se lleva la porción más grande, y es coherente con el historial: es
> la fase con más ciclos de depuración (decenas de commits `fix:`/`debug:` consecutivos),
> porque el parseo de números y fechas de la planilla exigió mucha iteración contra datos
> reales. Causa raíz encontrada al final: 20 cotizaciones EUR/USD cargadas como 1.

---

## 2. Backlog para abandonar la planilla (5/7 → 10/7/2026) ✅

| # | Ítem | Presupuesto | Real | Estado |
|---|---|---|---|---|
| 1 | CAJA completa en la base (sync + migración + validación) | 6–8 h | ~1 h (5-6/7) | ✅ En main |
| 2 | Validación en paralelo motor vs planilla | 3–4 h | ~0,5 h (6/7) | ✅ 100,00 % de coincidencia s/ 33.528 filas |
| 3 | Visualizar transacciones | 5–7 h | ~0,75 h (6/7) | ✅ En main |
| 4 | Editar transacción (sin escritura al Sheet) | 4–6 h | ~0,75 h (6/7) | ✅ En main |
| 5 | Dinero en calle | 4–6 h | ~0,5 h (6/7) | ✅ En main |
| 6 | Tablero de Inicio (situación de caja + clientes + histórico) | 12–15 h | ~2,5 h (9/7) | ✅ Con datos reales |
| 7 | Ganancias (réplica COLO parametrizable) | 5–7 h | ~1,5 h (10/7) | ✅ Validado vs planilla (23/6 = $ 2.330.502) |
| 8 | Rol superadmin para Ganancias | 2–3 h | ~0,5 h (6/7) | ✅ Permiso individual `ve_ganancias` |

**Subtotal backlog: ~7,5 h reales** contra un presupuesto de **41 – 56 h**.

---

## 3. Alcance agregado durante la validación (9/7 → 14/7/2026) ✅

| Bloque | Presupuesto | Real |
|---|---|---|
| Rediseño de **todas** las pantallas a rajatabla del mockup (shell, Inicio con filtros globales, login, Cuentas Ctes, Nueva, Transacciones con filtros por columna, Calle, Deudores, Usuarios, Sync, Mi cuenta) | 6–8 h | ~6,75 h |
| Mockups (tablero, ganancia, app completa) + rondas de ajuste con el cliente | — | ~4 h |
| Alta operativa desde la app: Guardar habilitado + escritura directa en `movimientos_caja` (visible al instante) + cliente según tipo | — | ~2 h |
| Diagnóstico y arreglo del sync/datos (proyecto equivocado, migraciones faltantes, columna `cot_efectiva`) | — | ~1,5 h |
| Borrado espejado: eliminar en la app limpia la fila en la planilla copiando una fila pre-armada | — | ~1,5 h |
| Detalles de validación (columna Cot., loaders, login, leyenda de contraseña, Ganancias en mes en curso, fix paginación RPC clientes) | — | ~1,5 h |
| Saldo acumulado en Cuentas Corrientes (extracto por cuenta, con verificación de cierre exacto) | — | ~1 h |
| Umbral de alerta configurable en USD (`app_config` + editor inline; evalúa siempre el valor en dólares de la operación) | — | ~0,75 h |

**Subtotal alcance agregado: ≈ 19 h**

---

## 4. Cierre de desarrollo (16/7 → 30/7/2026) 📊

Sin registro formal. Estimación reconstruida del historial.

| Funcionalidad | Tiempo activo estimado |
|---|---|
| **Módulo de auditoría** — tabla inmutable append-only, registro de alta/edición/borrado/ingreso de calle, columna "Registró" en Transacciones, pantalla global filtrable con antes/después | **2,5 – 3 h** |
| **USDT como moneda** — motor, alta, sync, banda de mercado (solo app, no existe en la planilla) | **1,5 – 2 h** |
| **Inicio** — períodos de calendario, "Saldo en caja" (arqueo físico), carrusel de monedas, banda de mercado compacta | **1,5 – 2 h** |
| Runbook de puesta en producción (`PUESTA-EN-PRODUCCION.md`) | **0,5 h** |
| Roadmap de mejoras ofrecibles por separado (`ROADMAP-MEJORAS.md`) | **0,5 h** |
| Menú (habilitar las 5 pantallas) y fix del filtro Tipo en Cuentas Corrientes | **0,5 h** |

**Subtotal cierre: ≈ 7 – 8,5 h** 📊

---

## Total acumulado al 30/7/2026

| Tramo | Calidad | Tiempo activo |
|---|---|---|
| 1. Fase inicial (14/5 → 3/7) | 📊 Estimado | 40 – 53 h |
| 2. Backlog para abandonar la planilla (5/7 → 10/7) | ✅ Medido | ~7,5 h |
| 3. Alcance agregado (9/7 → 14/7) | ✅ Medido | ~19 h |
| 4. Cierre de desarrollo (16/7 → 30/7) | 📊 Estimado | 7 – 8,5 h |
| **TOTAL** | | **≈ 74 – 89 h** |

De ese total, **≈ 26,5 a 27,5 h están medidas** y el resto es reconstrucción.

---

## Lecturas útiles para presupuestar

**El grueso del esfuerzo no está en las pantallas, está en la convivencia con la planilla.**
Sumando sincronización, motor de cálculo, escritura al Sheet y borrado espejado, la
integración con el Excel se lleva del orden de **25 a 35 h** — cerca de un tercio del
total. Es trabajo que **desaparece** cuando se retire la planilla: el sync, `excel-write`
y el circuito de borrado espejado se eliminan por completo.

**Ratio contra presupuesto tradicional.** En la parte medida, los 8 ítems del backlog se
presupuestaron en 41–56 h y se ejecutaron en 7,5 h (≈ 1:6). Ese ratio aplica a trabajo de
construcción sobre una base ya establecida; **no conviene extrapolarlo a ciegas** a fases
como la del sync, donde la depuración iterativa contra datos reales acota mucho la ventaja.

---

## Estado

Desarrollo del objetivo inicial (digitalizar, modernizar y securizar la operatoria del
Excel) **finalizado al 29/7/2026**. Pendiente: UAT del cliente, que puede derivar en
correcciones.

Mejoras futuras ofrecibles por separado: ver `docs/ROADMAP-MEJORAS.md`.
Puesta en producción y migración de datos: ver `docs/PUESTA-EN-PRODUCCION.md`.

Hitos previos ya completados: motor de cálculo aislado y validado, relevamiento y réplica
exacta de COLO, reconciliación Sheet↔Excel (causa raíz: 20 cotizaciones EUR/USD cargadas
como 1).
