# Plan vs Real — módulos pendientes para abandonar la planilla

Seguimiento por ítem: la columna **Esfuerzo (presupuesto)** son horas-desarrollador
tradicionales (base para presupuestar al cliente); **Tiempo activo real** es lo
efectivamente consumido en sesión (desarrollo + validación), sin tiempos muertos.
Se actualiza al cerrar cada ítem.

| # | Ítem | Esfuerzo (presupuesto) | Tiempo activo real | Estado |
|---|---|---|---|---|
| 1 | CAJA completa en la base (sync + migración + validación) | 6–8 h | ~1 h (5-6/7/2026) | ✅ En main |
| 2 | Validación en paralelo motor vs planilla | 3–4 h | ~0,5 h (6/7/2026) | ✅ En main — 100,00 % de coincidencia s/ 33.528 filas |
| 3 | Visualizar transacciones | 5–7 h | ~0,75 h (6/7/2026) | ✅ En main |
| 4 | Editar transacción (sin escritura al Sheet) | 4–6 h | ~0,75 h (6/7/2026) | ✅ En main |
| 5 | Dinero en calle | 4–6 h | ~0,5 h (6/7/2026) | ✅ En main |
| 6 | Tablero (situación de caja + clientes + histórico) | 12–15 h | ~2,5 h (9/7/2026) | ✅ En main — con datos reales (KPIs, clientes, gráficos, mercado) |
| 7 | Ganancias (réplica COLO parametrizable) | 5–7 h | ~1,5 h (10/7/2026) | ✅ En main — fórmula validada vs planilla (23/6 = $ 2.330.502), config en drawer |
| 8 | Rol superadmin para Ganancias | 2–3 h | ~0,5 h (6/7/2026) | ✅ En main — permiso individual ve_ganancias |

**Subtotal backlog original (1-8, todos cerrados): ~7,5 h reales** (presupuesto ~41–56 h).

## Alcance agregado (fuera del backlog original)

| Bloque | Esfuerzo (presupuesto) | Tiempo activo real | Estado |
|---|---|---|---|
| Mockups (tablero, ganancia, app completa) + rondas de ajuste con el cliente | — | ~4 h | ✅ Validados |
| Rediseño de la app a rajatabla del mockup (todas las pantallas: shell + Inicio con filtros globales, login, Cuentas Ctes, Nueva, Transacciones con filtros por columna, Calle, Deudores, Usuarios, Sync, Mi cuenta) | 6–8 h | ~6,75 h | ✅ Completado |
| Diagnóstico y arreglo del sync/datos (proyecto equivocado, migraciones faltantes, columna `cot_efectiva`) | — | ~1,5 h | ✅ Resuelto — no estaba previsto pero bloqueaba los datos |
| Saldo acumulado en Cuentas Corrientes (extracto por cuenta, con verificación de cierre exacto) | — | ~1 h | ✅ En main |
| Alta operativa desde la app: Guardar habilitado + escritura directa en movimientos_caja (visible al instante) + cliente según tipo (CTA CTE solo cuentas reales / CAJA texto libre) | — | ~2 h | ✅ En main — validado por el cliente |
| Borrado espejado: eliminar en la app limpia la fila en la planilla copiando una fila pre-armada (fórmulas intactas), con loader y avisos | — | ~1,5 h | ✅ En main — validado por el cliente |
| Detalles de validación (columna Cot., loaders, login, leyenda contraseña, Ganancias default mes, fix paginación RPC clientes) | — | ~1,5 h | ✅ En main |

## Total acumulado

**≈ 27,5 h de tiempo activo real** al 11/7/2026.

| Umbral de alerta configurable en USD (app_config + editor inline superusuario; la alerta evalúa siempre el valor en dólares de la operación, convirtiendo pesos/euros/reales con cotización de referencia) | — | ~0,75 h | ✅ En main |

Pendientes:
- Decidir si se vuelven a deshabilitar las 5 opciones del menú (Transacciones,
  Calle, Saldos Pendientes, Ganancias, Sincronizar) o quedan habilitadas — todos
  los módulos ya están completos y validados.

Hitos previos ya completados (fuera de estas tablas): motor de cálculo aislado y
validado, relevamiento y réplica exacta de COLO, reconciliación Sheet↔Excel
(causa raíz: 20 cotizaciones EUR/USD cargadas como 1).
