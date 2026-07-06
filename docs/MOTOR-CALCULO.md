# Motor de cálculo — `src/lib/motor-calculo/`

Replica en código las columnas que hoy calcula la planilla con fórmulas (`CUENTA`,
`PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`, `BANCO`, `CC PESOS`, `CC DOLARES`,
`CC EUROS`, `CC REALES`), para poder eventualmente prescindir del Google Sheet.

> ⚠️ **Estado: aislado, no conectado.** Este módulo no lo usa ningún flujo de la app
> (Nueva Transacción, reportes, sync) todavía. Es la base para cuando se decida dar el
> paso de mover el cálculo a la app.

## Cómo se relevó

Se extrajeron y analizaron las fórmulas reales de la planilla (`CAJA`, `SIGNOS`,
`OPERACIONES`, `R CAJA`) con la Sheets API, y se validó el algoritmo resultante contra
un caso real (cliente MACHA, COMPRA DOLARES con PESOS, monto 2000, cotización 1490)
antes de escribir el motor — coincidió exacto por dos caminos de cálculo distintos.

## El algoritmo

Para cada transacción (`tipo`, `operación`, `moneda propia`, `moneda externa`, `monto`,
`cotización`):

1. Buscar el **signo** de la operación en `SIGNOS` tabla 1 (`signos.ts` → `SIGNOS_OPERACION`),
   ej. `COMPRA → +1`, `VENTA → -1`, `GASTOS → -1`.
2. El signo de la moneda **externa** es siempre el opuesto al de la propia.
3. Formatear los nombres de columna:
   - **Moneda propia**: solo lleva prefijo `"CC "` si la operación es de cuenta
     corriente **con doble movimiento** (`OPCC≠0`, ej. `SWITCH`/`ENTRA TT`/`SALE TT`).
   - **Moneda externa**: lleva prefijo `"CC "` **siempre** que la operación sea CTA CTE
     (sin importar `OPCC`) — es asimétrico respecto de la propia. Este detalle no era
     evidente hasta ver la fórmula real (`MEX` no depende de `OPCC`, `MPR` sí).
4. Buscar el multiplicador de cotización en `SIGNOS` tabla 2 (`SIGNOS_MONEDA`), según el
   par de monedas **crudas** (sin el prefijo `"CC "`, aunque la operación sea CTA CTE).
   Da `POR` (multiplicar), `DIV` (dividir) o `NADA` (mismas monedas / sin externa).
5. Para cada una de las 10 columnas de salida: si coincide con la moneda propia
   formateada, vale `signo × monto`; si coincide con la externa, vale
   `signo × cotización(ajustada) × monto`; si no, vale `0`.
6. La columna `CUENTA` (agrupación para reportes) sale de un mapa `CODOP → CUENTA`
   relevado de la solapa `OPERACIONES` (`operaciones.ts`, 102 filas) — **no** participa
   del cálculo numérico, es puramente para reportes.

## Hallazgos relevantes

- **`OPERACIONES` (102 filas) no hace falta para el cálculo numérico** — solo para la
  columna `CUENTA`. El cálculo real usa únicamente las dos tablas chicas de `SIGNOS`
  (13 + 30 filas), mucho más simple y general de lo que se estimaba originalmente.
- **GASTOS solo existe en PESOS** en los datos reales: no hay fila `GASTOSDOLARES` (ni
  EUROS/REALES) en `OPERACIONES`. Es una restricción de negocio real, no un accidente
  — si se intentara en la planilla, la columna `CUENTA` daría error. El motor la valida
  explícitamente (`validarOperacion`).
- **`COSTO %` está dormido**: se relevaron ~34.000 filas reales y ninguna lo tiene
  cargado. Se implementó igual (factor `1 + costo% × signo_externo`) por completitud,
  pero hoy siempre da `factor = 1` en la práctica — no es un foco de riesgo.
- **"Dinero en la calle"** (`calcularCalle`): suma, por columna, los valores positivos
  de las filas donde `DEBE` (repartidor) está cargado. La fórmula original de la
  planilla tiene un error de arrastre en las columnas `CC *` (usa una columna de moneda
  equivocada como criterio) — el motor implementa la versión **consistente**, no ese bug.

## Validación

```bash
npx tsx scripts/validar-motor-calculo.mts
```

18 casos cubriendo: COMPRA/VENTA (con el caso real MACHA), INGRESAN/EGRESAN de CTA CTE
(con la contrapartida en la columna `CC *`), la restricción de GASTOS, y el cálculo de
"Calle".

## Próximos pasos (cuando se decida conectar)

- Exponer `OPERACIONES`/`SIGNOS` como tablas editables en un admin (hoy están
  hardcodeadas en TypeScript — suficiente mientras el motor esté aislado).
- Conectar `calcularMovimiento` a `Nueva Transacción` para mostrar una previsualización
  del impacto antes de guardar, y/o a los reportes (`R CAJA`, `COLO`, etc.) para que
  dejen de depender del Google Sheet.
- Correr el motor en paralelo contra la planilla real un tiempo, comparando resultados,
  antes de usarlo como fuente de verdad.
