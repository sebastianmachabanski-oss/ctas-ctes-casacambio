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
