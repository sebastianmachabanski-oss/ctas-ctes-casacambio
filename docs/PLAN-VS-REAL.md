# Plan vs Real — módulos pendientes para abandonar la planilla

Seguimiento por ítem: la columna **Esfuerzo (presupuesto)** son horas-desarrollador
tradicionales (base para presupuestar al cliente); **Tiempo activo real** es lo
efectivamente consumido en sesión (desarrollo + validación), sin tiempos muertos.
Se actualiza al cerrar cada ítem.

| # | Ítem | Esfuerzo (presupuesto) | Tiempo activo real | Estado |
|---|---|---|---|---|
| 1 | CAJA completa en la base (sync + migración + validación) | 6–8 h | ~1 h (5-6/7/2026) | ✅ En main |
| 2 | Validación en paralelo motor vs planilla | 3–4 h | — | Pendiente |
| 3 | Visualizar transacciones | 5–7 h | — | Pendiente |
| 4 | Editar transacción (sin escritura al Sheet) | 4–6 h | — | Pendiente |
| 5 | Dinero en calle | 4–6 h | — | Pendiente |
| 6 | Tablero (situación de caja + clientes + histórico) | 12–15 h | — | Pendiente — mockup en validación con el cliente |
| 7 | Ganancias (réplica COLO parametrizable) | 5–7 h | — | Pendiente — mockup en validación con el cliente |
| 8 | Rol superadmin para Ganancias | 2–3 h | — | Pendiente |

Hitos previos ya completados (fuera de esta tabla): motor de cálculo aislado y
validado, relevamiento y réplica exacta de COLO, reconciliación Sheet↔Excel
(causa raíz: 20 cotizaciones EUR/USD cargadas como 1), mockups de tablero y ganancia.
