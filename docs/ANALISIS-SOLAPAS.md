# Análisis de solapas del Excel CAJA — para migración a Google Sheets

> Generado analizando el archivo `1tuURACcfs09rRkynmVLqLD90Je5r-u58` (CAJA.xlsx, 8.4 MB).
> Script reproducible: `scripts/analizar-excel.mjs` y `scripts/analizar-pivots.mjs`.

## Hallazgo principal ⚠️

**El archivo ya NO contiene tablas dinámicas nativas de Excel.** Al abrir el `.xlsx`
como ZIP no existen las carpetas `xl/pivotTables/` ni `xl/pivotCache/` — solo
`xl/tables/` (tablas estructuradas, que es otra cosa).

Esto significa que en algún momento el archivo pasó por un round-trip (probablemente
Google Sheets o LibreOffice) que **destruyó las definiciones de las tablas dinámicas**.
Quedaron únicamente:

- El **resultado visual** congelado de cada TD (valores + algunas fórmulas).
- Las solapas ocultas **`Detalle1`…`Detalle7`**, que son los "ver detalle" que Excel
  autogenera al hacer doble clic sobre un valor de una TD.
- Fórmulas **`GETPIVOTDATA`** en `HISTORICO CLIENTE` y `RESULTADO TT` que hoy
  devuelven **`#REF!`** porque la TD que referenciaban ya no existe.

**Consecuencia para la migración:** no se pueden "importar y que las TD viajen solas"
—ya no están—. Pero el *intent* de cada una es claro y se puede reconstruir como TD
nativa de Google Sheets. Abajo está la especificación de cada una (filtros / filas /
columnas / valores).

## Origen de datos común

Todas las (ex) tablas dinámicas se alimentan de los movimientos del **DIARIO** (solapa
`CAJA`). Las columnas fuente, visibles en las solapas `Detalle`, son:

`AÑO · MES · SEMANA · FECHA · CLIENTE · OP · CAJA · OPERACIÓN · PROPIO · EXTERNO · MONTO · COT`

(MES y SEMANA aparecen como números de serie de fecha de Excel; FECHA también.)

---

## Solapas que SON (ex) tablas dinámicas

### 1. `COLO` — Resumen de caja "COLO"
Reporte tipo TD con totales COMPRA / VENTA / GASTOS arriba.

| Rol | Campos |
|-----|--------|
| **Filtros (página)** | `MES`, `SEMANA`, `OPERACIÓN` (=Varios elementos), `CAJA` |
| **Filas** | `NRO`, `OPERACION PROPIA`, `CLIENTE`, `PROPIO`, `EXTERNO`, `COT` |
| **Valores** (suma) | `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`, `BANCO` |

### 2. `CLIENTES CAJA` — Saldos por cliente (caja)
| Rol | Campos |
|-----|--------|
| **Filtros** | `FECHA`, `OPERACIÓN`, `CUENTA`, `CAJA` |
| **Filas** | `CLIENTE` |
| **Valores** (suma) | `CC PESOS`, `CC DOLARES`, `CC EUROS`, `CC REALES`, `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`, `BANCO` |

### 3. `CLIENTES CTA CTE` — Saldos por caja, filtrado a cta cte
| Rol | Campos |
|-----|--------|
| **Filtros** | `FECHA`, `OPERACIÓN`, `CUENTA`, `CLIENTE` |
| **Filas** | `CAJA` (acá la etiqueta de fila lista las cuentas corrientes) |
| **Valores** (suma) | `CC PESOS`, `CC DOLARES`, `CC EUROS`, `CC REALES`, `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`, `BANCO` |

### 4. `R CTAS CTES` — Idéntica estructura a `CLIENTES CTA CTE`
| Rol | Campos |
|-----|--------|
| **Filtros** | `FECHA`, `CLIENTE`, `OPERACIÓN`, `CUENTA` |
| **Filas** | `CAJA` |
| **Valores** (suma) | `CC PESOS`, `CC DOLARES`, `CC EUROS`, `CC REALES`, `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`, `BANCO` |

### 5. `HISTORICO CLIENTE` — Movimientos históricos de un cliente
Tiene `GETPIVOTDATA` (hoy `#REF!`). Es la vista "extracto" de un cliente.

| Rol | Campos |
|-----|--------|
| **Filtros** | `CLIENTE`, `MES`, `CAJA` |
| **Filas** | `FECHA`, `NRO`, `OPERACIÓN`, `OPERACION EXTERNA`, `COT`, `COSTO %`, `NOTAS` |
| **Valores** (suma) | `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES` |

### 6. `RESULTADO TT` — Resultado de operaciones "TT" con subtotales
Tiene `GETPIVOTDATA` (hoy `#REF!`). Muestra subtotales por par (ej. `Total BOH - GRA`).

| Rol | Campos |
|-----|--------|
| **Filtros** | `CLIENTE`, `OP` (=T), `MES`, `CAJA` |
| **Filas** | `NOTAS` (agrupador con subtotal), `NRO`, `FECHA`, `OPERACIÓN`, `OPERACION EXTERNA`, `COT`, `COSTO %` |
| **Valores** (suma) | `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES` |

### 7. `Detalle1` … `Detalle7` (ocultas) — Drill-downs autogenerados
No son TD: son los "ver detalle" de Excel. Cada una tiene un encabezado
`Detalles para …` que describe el filtro con el que se generó, y debajo las columnas
fuente del DIARIO (`AÑO · MES · SEMANA · FECHA · CLIENTE · OP · CAJA · OPERACIÓN ·
PROPIO · EXTERNO · MONTO · COT`).

| Solapa | Contexto del drill-down (encabezado) |
|--------|--------------------------------------|
| `Detalle1` | PESOS – CTA CTE RETIRA PESOS A CC PESOS / EGRESAN / CAJA EDY |
| `Detalle2` | DOLARES – CTA CTE RETIRA DOLARES A CC DOLARES / EGRESAN / CAJA EDY |
| `Detalle3` | PESOS – CTA CTE RETIRA PESOS A CC PESOS / EGRESAN / CAJA EDY |
| `Detalle4` | DOLARES – CTA CTE ENTREGA DOLARES A CC DOLARES / INGRESAN / CAJA EDY |
| `Detalle5` | PESOS – CTA CTE ENTREGA PESOS A CC PESOS / INGRESAN / CAJA EDY |
| `Detalle6` | PESOS – CAJA EDY |
| `Detalle7` | CC DOLARES – CTA CTE ENTREGA DOLARES A CC DOLARES / INGRESAN / CLIENTE JULIO / MES 6-2026 |

> **Estas 7 solapas son descartables en la migración**: son basura residual de los
> doble-clics. No hay que recrearlas.

---

## Solapas de apoyo (NO son tablas dinámicas)

| Solapa | Qué es | Notas para migración |
|--------|--------|----------------------|
| `CLIENTES` | Dashboard de saldos por cliente (CC PESOS/DOLARES/REALES) + sección `DEBE`. 201 fórmulas que leían las TD. | Se reconstruye con `QUERY`/`SUMIF` sobre el DIARIO. |
| `OPERACIONES` | Tabla de configuración: mapea cada código de operación (`CODOP`) a su operación propia/externa, signos y monedas. Datos + fórmulas. | **Conservar tal cual** — es lógica de negocio. |
| `R CAJA` | Reporte "Resultado Caja": SALDO INICIAL, ENTREGAS, RETIROS, MOV. DIARIO, SALDO FINAL, CHECK. | Recalcular con fórmulas sobre el DIARIO. |
| `SIGNOS` | Tabla de configuración de signos (+1/-1) por operación y combinaciones de moneda. | **Conservar tal cual** — lógica de negocio. |
| `COLUMNAS` | Documentación de qué significa cada columna del DIARIO. | Informativa. Útil de referencia. |
| `COT` | Cotizaciones históricas por fecha (`Fecha · Venta · Compra`), desde 2015. | **Conservar** — datos puros. |

---

## Recomendaciones para la migración a Google Sheets

1. **Las TD hay que rehacerlas desde cero** en Google Sheets (Insertar → Tabla
   dinámica) usando las especificaciones de filtros/filas/valores de arriba. No hay
   nada que "importar".
2. **Borrar** las 7 solapas `Detalle*` antes de migrar — son residuo.
3. **Conservar** las solapas de configuración (`OPERACIONES`, `SIGNOS`, `COT`,
   `COLUMNAS`) tal cual.
4. Las solapas-reporte (`CLIENTES`, `R CAJA`, `CLIENTES CAJA`, etc.) conviene
   rehacerlas como **TD nativas de Sheets** o con `QUERY()` apuntando al DIARIO, en
   lugar de las miles de fórmulas `GETPIVOTDATA`/`SUMIF` actuales (frágiles y lentas).
5. Las columnas `MES`/`SEMANA`/`FECHA` que hoy son números de serie deberían quedar
   como fechas reales en Sheets para poder agrupar por mes/semana en las TD.
