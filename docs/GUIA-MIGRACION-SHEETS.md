# Guía paso a paso: recrear la planilla CAJA en Google Sheets

Esta guía te lleva desde el Excel actual hasta un Google Sheet limpio y funcional,
con todas las tablas dinámicas reconstruidas. Está pensada para hacerla **una sola vez**.

> Contexto: el `.xlsx` actual perdió las tablas dinámicas nativas (ver
> `docs/ANALISIS-SOLAPAS.md`). Por eso no alcanza con "importar": hay que rehacer las
> TD. La buena noticia es que la app no depende de las TD —solo lee el **DIARIO**
> (solapa `CAJA`, filas con `TIPO = CTA CTE`)— así que las TD son para el uso humano,
> no para el sistema.

---

## 0. Resultado final esperado

Al terminar vas a tener un Google Sheet con estas solapas:

| Solapa | Tipo | Origen |
|--------|------|--------|
| `CAJA` | **Datos** (el DIARIO) | Se importa del Excel |
| `OPERACIONES` | Configuración | Se importa tal cual |
| `SIGNOS` | Configuración | Se importa tal cual |
| `COT` | Datos (cotizaciones) | Se importa tal cual |
| `COLUMNAS` | Documentación | Se importa tal cual |
| `CLIENTES CAJA` | **Tabla dinámica** | Se recrea (Paso 4.1) |
| `CLIENTES CTA CTE` | **Tabla dinámica** | Se recrea (Paso 4.2) |
| `R CTAS CTES` | **Tabla dinámica** | Se recrea (Paso 4.3) |
| `HISTORICO CLIENTE` | **Tabla dinámica** | Se recrea (Paso 4.4) |
| `RESULTADO TT` | **Tabla dinámica** | Se recrea (Paso 4.5) |
| `COLO` | **Tabla dinámica** | Se recrea (Paso 4.6) |
| `R CAJA` | Reporte con fórmulas | Se recrea (Paso 5) |
| `CLIENTES` | Reporte con fórmulas | Se recrea (Paso 5) |

**Se eliminan** (no se migran): `Detalle1` … `Detalle7` (eran basura residual de Excel).

---

## 1. Importar el Excel a Google Sheets

1. Entrá a [sheets.google.com](https://sheets.google.com) con la cuenta que va a ser dueña.
2. **Archivo → Importar → Subir** → elegí `CAJA.xlsx`.
3. En el diálogo elegí **"Reemplazar hoja de cálculo"** (o "Crear hoja nueva").
4. Esperá a que termine (es grande, ~8 MB; puede tardar).

> ⚠️ Al importar, Google va a traer las solapas como están: los valores congelados de
> las ex-TD y las solapas `Detalle*`. Eso es esperado; las limpiamos en el paso 2.

---

## 2. Limpieza inicial

1. **Eliminá las solapas `Detalle1` a `Detalle7`**: clic derecho en la pestaña →
   Eliminar. (Son drill-downs viejos, no sirven.)
2. **Eliminá las solapas que vas a recrear como TD** para no confundirte con los
   valores viejos congelados: `CLIENTES CAJA`, `CLIENTES CTA CTE`, `R CTAS CTES`,
   `HISTORICO CLIENTE`, `RESULTADO TT`, `COLO`, `R CAJA`, `CLIENTES`.
   - *(Alternativa más segura: en vez de borrarlas, renombralas a `OLD_CLIENTES`, etc.,
     para tener de referencia los números viejos mientras reconstruís, y borralas al
     final cuando verifiques que dan igual.)*
3. **Quedate con**: `CAJA`, `OPERACIONES`, `SIGNOS`, `COT`, `COLUMNAS`.

---

## 3. Preparar el DIARIO (solapa `CAJA`)

La solapa `CAJA` es la fuente de TODAS las tablas dinámicas. Las columnas del DIARIO
(según `COLUMNAS` y los encabezados detectados) son, como mínimo:

`FECHA · CLIENTE · OPERACIÓN · CAJA · PROPIO · EXTERNO · MONTO · COT · NOTAS`
más las columnas de importe por moneda que suman las TD:
`PESOS · CHEQUES · DOLARES · EUROS · REALES · BANCO · CC PESOS · CC DOLARES · CC EUROS · CC REALES`
y las columnas de agrupación temporal: `AÑO · MES · SEMANA`.

**Verificá / preparalo así:**

1. Confirmá que la **fila de encabezados** está completa y sin celdas combinadas
   (las TD de Sheets necesitan encabezados únicos y limpios).
2. Asegurate de que **`FECHA` sea fecha real** (no texto ni número de serie). Seleccioná
   la columna → Formato → Número → Fecha. Si quedó como número (ej. `46185`), convertila.
3. Las columnas **`AÑO`, `MES`, `SEMANA`**: en lugar de arrastrarlas como números de
   serie, conviene generarlas con fórmula a partir de `FECHA`. Si tu columna FECHA es,
   por ejemplo, la `D`:
   - `AÑO`  → `=YEAR(D2)`
   - `MES`  → `=EOMONTH(D2,0)` (último día del mes) **o** `=TEXT(D2,"yyyy-mm")` si lo
     querés como etiqueta. Para agrupar en TD por mes, lo más cómodo es dejar `FECHA`
     real y agrupar dentro de la TD (Sheets agrupa por año/mes/trimestre solo).
   - `SEMANA` → `=ISOWEEKNUM(D2)` (o `=YEAR(D2)&"-"&TEXT(ISOWEEKNUM(D2),"00")`).
   - ⚠️ **Cuidado con el formato de `SEMANA`/`MES`.** En el Excel original, `SEMANA` es
     un código `AAAASS` (ej. `202448` = 2024, semana 48) y `MES` es un número de serie de
     fecha. Si la columna `SEMANA` queda con **formato de Fecha**, un control de filtros
     la muestra como una fecha disparatada (ej. `202448` → "domingo, abril 12, 2454"),
     porque interpreta el número como serie de fecha. Solución: seleccioná la columna
     `SEMANA` → **Formato → Número → Número** (o "Texto sin formato"). `MES`, en cambio,
     sí es fecha: dejalo como fecha o formatealo como `aaaa-mm`. Generarlas con las
     fórmulas de arriba evita el problema de raíz.
4. ⚠️ **La fila de encabezados debe ser la primera del rango.** En el Excel original,
   la solapa `CAJA` tiene un bloque de totales/resumen ARRIBA de los encabezados (por eso
   la sincronización busca la fila de títulos dentro de las primeras filas). Si armás una
   TD o un control de filtros sobre `CAJA!A1`, Google toma esa fila de totales como
   "encabezados" y el desplegable de columnas muestra **valores sueltos** (ej.
   `FALT 84000`, `MARIA 900`) en vez de los nombres `FECHA`, `CLIENTE`, `CAJA`…
   - Solución: identificá en qué fila están los títulos reales y hacé que el rango
     **arranque ahí** (ej. si los títulos están en la fila 4, usá `CAJA!A4:AO33011`).
   - Lo más limpio: borrá las filas de totales de arriba para que los títulos queden en
     la **fila 1**. La sincronización lo tolera (escanea las primeras filas igual).
5. **Tip clave — usá un rango ABIERTO para que las TD crezcan solas.** Como origen de las
   TD y los controles de filtro, usá un rango **sin tope de fila**, desde la fila de
   encabezados hasta el final de la columna:
   ```
   CAJA!A6:AO        (poné la fila de tus encabezados; acá, la 6)
   ```
   Al no tener número de fila al final, **incluye automáticamente todas las filas que se
   agreguen** después. No hay que tocar nada nunca más.
   - ⚠️ **Un rango con nombre NO se auto-expande.** Si definís `DIARIO` con un tope fijo
     (ej. `A6:AO33011` + unas filas), tarde o temprano lo tendrías que agrandar a mano.
     Si querés usar el nombre `DIARIO`, definilo igual como **abierto**: Datos → Rangos
     con nombre → `DIARIO` = `CAJA!A6:AO`. O directamente usá `A6:AO` como origen y
     olvidate del named range.
   - **Las TD de Google Sheets se recalculan solas** cuando cambian los datos (a
     diferencia de Excel). Con el rango abierto, las filas que agregue la sincronización
     aparecen automáticamente en las TD.
   - Costo del rango abierto: las filas vacías del final aparecen como **"(Vacío)"** en
     slicers y TD. Destildalo en el slicer o filtralo en la TD; es el único mantenimiento
     y es trivial.
   - Nota: el editor de TD acepta rangos con nombre, pero hay que **tipearlos exacto** en
     el campo de datos (no aparecen en el selector visual).

---

## 4. Recrear las tablas dinámicas

**Procedimiento general (igual para todas):**

1. Menú **Insertar → Tabla dinámica**.
2. En "Datos", escribí el rango con nombre `DIARIO` (o seleccioná el rango del DIARIO).
3. En "Insertar en" elegí **Hoja nueva** y después renombrala con el nombre indicado.
4. En el panel derecho **Editor de tabla dinámica**, agregá los campos a
   **Filas / Columnas / Valores / Filtros** según cada tabla de abajo.
5. Para cada campo de **Valores**: Sheets pone "SUMA de X" por defecto — dejalo en
   **SUMA** (es lo que hacían las TD originales).

> En las tablas de abajo, "Filtros" = los campos por los que el usuario va a poder
> filtrar (los "campos de página" de Excel). **Importante:** en Google Sheets NO los
> pongas en la sección "Filtros" del editor —ahí quedan ocultos en el panel—. Usá
> **Controles de filtro (slicers)**, que sí se ven sobre la hoja. Ver sección 4.7.

### 4.7 Filtros visibles en pantalla — Controles de filtro (slicers)

En Excel los filtros de la TD se muestran arriba de la tabla y el usuario elige desde
ahí. En Google Sheets, los "Filtros" del editor de TD **quedan escondidos en el panel
de diseño**, no en la hoja. El equivalente real, visible e interactivo, se llama
**Control de filtros** (slicer / segmentador).

**Cómo agregarlo (uno por cada campo de "Filtros" de las tablas 4.1–4.6):**

1. Hacé clic en la **tabla dinámica** (o en una celda de ella).
2. Menú **Insertar → Control de filtros** (o **Datos → Agregar control de filtros**).
3. En el panel derecho elegí la **columna** a filtrar (ej. `CLIENTE`).
4. Arrastrá el control flotante a la zona de **arriba de la TD**.
5. Repetí para cada filtro de esa solapa (ej. en `HISTORICO CLIENTE`: `CLIENTE`, `MES`,
   `CAJA` → tres controles).
6. El usuario hace clic en el control sobre la hoja y elige los valores; la TD se
   actualiza sola.

**Detalles:**

- **No** pongas esos campos también en la sección "Filtros" del editor: alcanza con el
  control de filtros.
- Un control de filtros filtra el **rango de datos de origen**, así que afecta a todas
  las TD y gráficos del mismo origen **en esa pestaña**. Por eso conviene **una TD
  principal por pestaña** con sus controles arriba (que es el layout original).
- En el menú de **tres puntos** del control podés fijar un **valor por defecto** y
  activar **"mostrar solo datos válidos"**.
### 4.8 Colapsar / expandir un campo de filas (ver solo subtotales)

Cuando una TD tiene varios campos en Filas (ej. `RESULTADO TT`: `NOTAS` arriba y después
`NRO`, `FECHA`, …), podés colapsar el campo de más arriba para ver **solo los subtotales**
(`Total ADRI - MZA`, etc.) sin el detalle.

- **Un grupo por vez:** usá los botones **`+` / `–`** que aparecen a la izquierda de cada
  grupo.
- **Todo el campo de una:** **clic derecho** sobre cualquier valor de ese campo (ej. una
  celda de `NOTAS`) → **"Contraer todos los elementos de NOTAS"**.
  Para reabrir: clic derecho → **"Expandir todos los elementos de NOTAS"**.

### 4.1 `CLIENTES CAJA` — saldo por cliente
- **Filtros:** `FECHA`, `OPERACIÓN`, `CUENTA`, `CAJA`
- **Filas:** `CLIENTE`
- **Columnas:** *(ninguna)*
- **Valores (SUMA):** `CC PESOS`, `CC DOLARES`, `CC EUROS`, `CC REALES`, `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`, `BANCO`

### 4.2 `CLIENTES CTA CTE` — saldo por caja (cuentas corrientes)
- **Filtros:** `FECHA`, `OPERACIÓN`, `CUENTA`, `CLIENTE`
- **Filas:** `CAJA`
- **Columnas:** *(ninguna)*
- **Valores (SUMA):** `CC PESOS`, `CC DOLARES`, `CC EUROS`, `CC REALES`, `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`, `BANCO`

### 4.3 `R CTAS CTES` — idéntica a 4.2 (otro orden de filtros)
- **Filtros:** `FECHA`, `CLIENTE`, `OPERACIÓN`, `CUENTA`
- **Filas:** `CAJA`
- **Columnas:** *(ninguna)*
- **Valores (SUMA):** `CC PESOS`, `CC DOLARES`, `CC EUROS`, `CC REALES`, `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`, `BANCO`

> 4.2 y 4.3 son casi la misma TD. Si no necesitás las dos, hacé una sola.

### 4.4 `HISTORICO CLIENTE` — extracto de un cliente
- **Filtros:** `CLIENTE`, `MES`, `CAJA`
- **Filas (en este orden):** `FECHA`, `NRO`, `OPERACIÓN`, `OPERACION EXTERNA`, `COT`, `COSTO %`, `NOTAS`
- **Columnas:** *(ninguna)*
- **Valores (SUMA):** `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`
- Uso: poné un cliente en el filtro `CLIENTE` y ves su movimiento histórico.

### 4.5 `RESULTADO TT` — resultado de operaciones "TT" con subtotales
- **Filtros:** `CLIENTE`, `OP` (poné `T`), `MES`, `CAJA`
- **Filas (en este orden):** `NOTAS`, `NRO`, `FECHA`, `OPERACIÓN`, `OPERACION EXTERNA`, `COT`, `COSTO %`
- **Columnas:** *(ninguna)*
- **Valores (SUMA):** `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`
- En el editor, activá **"Mostrar totales"** en la fila `NOTAS` para tener los subtotales
  tipo `Total BOH - GRA` que tenía la original.

### 4.6 `COLO` — resumen de caja "COLO"
- **Filtros:** `MES`, `SEMANA`, `OPERACIÓN`, `CAJA`
- **Filas:** `NRO`, `OPERACION PROPIA`, `CLIENTE`, `PROPIO`, `EXTERNO`, `COT`
- **Columnas:** *(ninguna)*
- **Valores (SUMA):** `PESOS`, `CHEQUES`, `DOLARES`, `EUROS`, `REALES`, `BANCO`
- Arriba de la original había totales COMPRA / VENTA / GASTOS: se obtienen filtrando
  `OPERACIÓN` o agregando `OPERACIÓN` como primer campo de Filas.

---

## 5. Recrear los reportes con fórmulas (`R CAJA` y `CLIENTES`)

Estos no eran TD sino reportes calculados. Tenés dos caminos:

**Opción A (recomendada): rehacerlos como TD** siguiendo el mismo patrón del paso 4.
Es más robusto que las miles de fórmulas originales.

**Opción B: rehacerlos con `QUERY()`** apuntando al `DIARIO`. Ejemplos:

- Saldo total por moneda (estilo `R CAJA`):
  ```
  =QUERY(DIARIO, "select sum(PESOS), sum(DOLARES), sum(EUROS), sum(REALES)
                  where CLIENTE = 'CTA CTE' label sum(PESOS) 'Pesos'", 1)
  ```
- Saldo por cliente (estilo `CLIENTES`):
  ```
  =QUERY(DIARIO, "select CLIENTE, sum(CC PESOS), sum(CC DOLARES), sum(CC REALES)
                  group by CLIENTE order by CLIENTE", 1)
  ```
  *(Ajustá los nombres de columna entre comillas a como queden tus encabezados; si tienen
  espacios, en QUERY hay que referirlas por letra de columna, ej. `sum(G)`.)*

`R CAJA` arma: SALDO INICIAL, ENTREGAS, RETIROS, MOV. DIARIO, SALDO FINAL y un CHECK.
Reconstruilo sumando el DIARIO con `SUMIFS` por concepto, o como TD filtrando por
`OPERACIÓN`.

---

## 6. Conservar las solapas de configuración (no tocar)

Estas vienen del Excel y son **lógica de negocio**: dejalas tal cual.

- **`OPERACIONES`** — mapea cada código de operación a su operación propia/externa,
  signos y monedas. La usan las fórmulas del DIARIO.
- **`SIGNOS`** — signos (+1/-1) por operación y combinaciones de moneda.
- **`COT`** — cotizaciones históricas por fecha (`Fecha · Venta · Compra`).
- **`COLUMNAS`** — documentación de qué significa cada columna del DIARIO.

> Verificá que las fórmulas que cruzan estas solapas (`VLOOKUP`/`BUSCARV`, `INDEX/MATCH`)
> sigan apuntando bien después de importar. Google a veces traduce nombres de función,
> pero las referencias entre solapas se mantienen.

---

## 7. Checklist final de verificación

- [ ] La solapa `CAJA` tiene `FECHA` como fecha real y encabezados limpios.
- [ ] Existe el rango con nombre `DIARIO` cubriendo todo el DIARIO + filas de sobra.
- [ ] Las 6 TD (4.1–4.6) están creadas y sus números coinciden con los de las solapas
      `OLD_*` viejas (si usaste la opción de renombrar en el paso 2).
- [ ] `R CAJA` y `CLIENTES` dan los mismos totales que antes.
- [ ] Las solapas `Detalle1…7` fueron eliminadas.
- [ ] `OPERACIONES`, `SIGNOS`, `COT`, `COLUMNAS` están intactas.
- [ ] Borraste las solapas `OLD_*` de referencia.

---

## 8. Impacto en la app (importante)

La app de la Casa de Cambio **solo lee el DIARIO** (solapa `CAJA`, filas `TIPO = CTA CTE`)
vía la sincronización. **No usa ninguna de las tablas dinámicas.** Por lo tanto:

- Mientras la solapa `CAJA` mantenga **el mismo nombre, los mismos encabezados y la misma
  estructura de columnas**, la sincronización sigue funcionando sin cambios.
- ⚠️ Hoy la app sincroniza desde un **archivo Excel** en Drive (`.xlsx`). Si pasás a un
  **Google Sheet nativo**, el `FILE_ID` cambia y el método de lectura también (un Google
  Sheet no se descarga con `?alt=media` como binario `.xlsx`). Hay que actualizar la
  función de sync para:
  1. Apuntar al nuevo `FILE_ID` del Google Sheet.
  2. Leer con la **API de Google Sheets** (`spreadsheets.values.get`) en vez de bajar el
     binario y parsearlo con `xlsx`. **Es más rápido y más confiable.**
- Cuando llegues a este punto, avisame y adapto la función `sync-background` para que lea
  el Google Sheet nativo (queda más simple que el código actual).

---

## Resumen de los campos de cada TD (tabla de referencia rápida)

| Solapa (TD) | Filtros | Filas | Valores (suma) |
|-------------|---------|-------|----------------|
| CLIENTES CAJA | FECHA, OPERACIÓN, CUENTA, CAJA | CLIENTE | CC PESOS, CC DOLARES, CC EUROS, CC REALES, PESOS, CHEQUES, DOLARES, EUROS, REALES, BANCO |
| CLIENTES CTA CTE | FECHA, OPERACIÓN, CUENTA, CLIENTE | CAJA | (idem) |
| R CTAS CTES | FECHA, CLIENTE, OPERACIÓN, CUENTA | CAJA | (idem) |
| HISTORICO CLIENTE | CLIENTE, MES, CAJA | FECHA, NRO, OPERACIÓN, OP EXTERNA, COT, COSTO %, NOTAS | PESOS, CHEQUES, DOLARES, EUROS, REALES |
| RESULTADO TT | CLIENTE, OP, MES, CAJA | NOTAS, NRO, FECHA, OPERACIÓN, OP EXTERNA, COT, COSTO % | PESOS, CHEQUES, DOLARES, EUROS, REALES |
| COLO | MES, SEMANA, OPERACIÓN, CAJA | NRO, OPERACION PROPIA, CLIENTE, PROPIO, EXTERNO, COT | PESOS, CHEQUES, DOLARES, EUROS, REALES, BANCO |
