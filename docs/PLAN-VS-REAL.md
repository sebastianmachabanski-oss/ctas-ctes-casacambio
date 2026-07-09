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
| 7 | Ganancias (réplica COLO parametrizable) | 5–7 h | — | Pendiente — se hace al final, con motor de cálculo |
| 8 | Rol superadmin para Ganancias | 2–3 h | ~0,5 h (6/7/2026) | ✅ En main — permiso individual ve_ganancias |

**Subtotal ítems del backlog original cerrados (1-6, 8): ~6 h reales** (presupuesto ~32–43 h).

## Alcance agregado (fuera del backlog original)

| Bloque | Esfuerzo (presupuesto) | Tiempo activo real | Estado |
|---|---|---|---|
| Mockups (tablero, ganancia, app completa) + rondas de ajuste con el cliente | — | ~4 h | ✅ Validados |
| Rediseño de la app a rajatabla del mockup (azul, sidebar anclable, etc.) | 6–8 h | ~2 h | 🔄 En curso — hechos Inicio, login, Cuentas Corrientes; faltan Nueva, Transacciones, Calle, Deudores, Usuarios, Sync, Mi cuenta |
| Diagnóstico y arreglo del sync/datos (proyecto equivocado, migraciones faltantes, columna `cot_efectiva`) | — | ~1,5 h | ✅ Resuelto — no estaba previsto pero bloqueaba los datos |

## Total acumulado

**≈ 15,5 h de tiempo activo real** al 9/7/2026.

Hitos previos ya completados (fuera de estas tablas): motor de cálculo aislado y
validado, relevamiento y réplica exacta de COLO, reconciliación Sheet↔Excel
(causa raíz: 20 cotizaciones EUR/USD cargadas como 1).
