# Guía de trabajo — ctas-ctes-casacambio

App Next.js 14 + Supabase + Netlify para una casa de cambio, en migración gradual
desde un Google Sheet (solapa CAJA) que hoy sigue siendo la fuente de verdad.
Documentación clave: `docs/SINCRONIZACION.md` (sync Sheet→DB), `docs/MOTOR-CALCULO.md`
(réplica de la lógica de la planilla), `docs/BACKUPS.md`, `schema.sql` + `migrations/`.

## Preferencias de colaboración

- **Idioma**: todo en español (código comentado en español, respuestas en español).
  Registro profesional, sin voseo coloquial excesivo ni interjecciones tipo "che".
- **Migraciones SQL**: además de commitear el archivo en `migrations/`, SIEMPRE pegar
  el SQL completo en el chat listo para copiar y pegar en el SQL Editor de Supabase
  (el usuario las corre a mano), aclarando si es seguro correrla dos veces.
- **Scripts en general**: misma regla — todo lo que el usuario deba ejecutar por su
  cuenta se pega completo en el chat, no solo se referencia el archivo.
- **Números**: formato argentino (punto de miles, coma decimal) en toda comunicación.
- **Estimaciones**: en horas de esfuerzo activo, nunca en días. Los tiempos muertos
  (esperas entre respuestas) no cuentan.

## Reglas del dominio (no romper)

- Los importes deben coincidir EXACTO con la planilla — sin tolerancias "aceptables".
  Al leer el Sheet para cálculos usar `UNFORMATTED_VALUE` (los valores formateados
  acumulan deriva de redondeo).
- `movimientos_caja.cliente` es texto libre NO normalizado (clientes eventuales) —
  decisión de negocio del 5/7/2026, no "arreglarlo" sin pedido explícito.
- GASTOS solo existe en PESOS. El campo DEBE cargado = dinero "en la calle".
- El motor de cálculo (`src/lib/motor-calculo`) está validado contra la planilla:
  ante cualquier cambio correr `npx tsx scripts/validar-motor-calculo.mts`.
- Editar transacciones en la app NO escribe al Sheet (definido 5/7/2026): mientras
  dure la convivencia, el sync puede pisar esos cambios y es un comportamiento asumido.
- USDT: moneda SOLO-app, NO existe en la planilla — no hay ni una transacción cargada allá
  y no la va a haber. Desde el 25/8/2026 opera en CAJA **y en CUENTA CORRIENTE** (antes era
  solo caja); sigue sin contemplarse en TT/SWITCH. Los saldos USDT de cta cte viven solo en
  la app: si hay que reconstruir desde el Sheet, no están.
  Se cotiza como el dólar (pesos por USDT; ~1:1 contra dólar físico con spread). Las filas
  USDT se marcan `movimientos_caja.origen='app'` y el sync NO las toca (si no, se perderían).
  El alta USDT no se escribe al Sheet (evita duplicar la pata en pesos vía sync). Cuando se
  retire la planilla, `origen` deja de ser necesario pero no molesta.
- ROLES (definido 11/8/2026, ver `docs/ROLES.md`): cliente / operador / administrador /
  superadmin. El rol es la ÚNICA fuente de verdad de permisos — `ve_ganancias` ya no existe.
  NUNCA comparar roles a mano: usar los predicados de `src/lib/roles.ts` (app) y
  `es_admin()` / `es_staff()` / `ve_ganancias()` (policies de RLS). La diferencia entre
  administrador y superadmin es solo Ganancias, y las reglas de contención (nadie cambia
  su propio rol, nadie asigna un rol al que no llega, un administrador no toca la cuenta
  de un superadmin) se validan EN EL SERVIDOR, no en el navegador.
- BORRAR transacciones en la app SÍ limpia la fila en la planilla (definido 11/7/2026):
  se identifica por contenido y solo se limpia si la coincidencia es única — con cero o
  varias coincidencias se borra solo de la base y se avisa para el borrado manual.
  Este circuito (junto con excel-write y el sync) se elimina cuando se retire la planilla.
