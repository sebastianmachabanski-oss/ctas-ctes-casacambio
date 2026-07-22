# Puesta en producción / migración de datos al día

Runbook para llevar la app a producción con los datos reales al día. Pensado para
correrse **una vez** el día del arranque (y sirve de referencia ante cualquier recarga
full posterior). Al 2/7/2026 la base tiene los movimientos hasta esa fecha; el objetivo
es reflejar el último Excel (movimientos del 2/7 a hoy + posibles ediciones retroactivas
anteriores al 2/7) sin perder nada y con forma de volver atrás si algo falla.

---

## 0. Conceptos que hay que tener claros antes de tocar nada

- **Fuente de verdad = la planilla** (solapa **`CAJA`**, que en el negocio llaman "el
  DIARIO"). La app NO inventa datos: el sync copia planilla → base.
- **El sync `full` es idempotente y reconciliador**: **borra y reinserta** todas las
  filas de origen planilla y las vuelve a traer del Excel/Sheet. Por eso captura también
  las ediciones a filas viejas (anteriores al 2/7). Es el modo correcto para la migración.
- **`movimientos_caja.origen`**: `'sheet'` = la maneja el sync (la borra y reinserta);
  `'app'` = cargada desde la app (hoy, solo **USDT**) — **el sync NO la toca**. Un full
  **conserva** las filas `'app'`.
- **La app lee las columnas CALCULADAS de la planilla tal cual** (PESOS, DOLARES, …,
  CC REALES). Durante la convivencia esas columnas son la fuente de verdad de los
  importes. ⇒ **La solapa CAJA que sincronices DEBE tener esas columnas calculadas con
  valor** (no solo las columnas de ingreso fecha→notas). Si faltan, los impactos entran
  en cero y Inicio / Transacciones / Ganancias muestran 0.

---

## 1. Backups OBLIGATORIOS antes de empezar

Hacer los tres. No saltear ninguno.

### 1.1. Dump completo de Supabase (esquema + datos)
Cubre lo NO reconstruible desde la planilla: `profiles`, `clientes`,
`cuentas_corrientes`, `tipos_operacion`, `app_config`, `sync_state` y **las filas USDT
(`origen='app'`)**.

```bash
pg_dump "postgresql://postgres.qsvjbafbjlexaeliqmfd:CONTRASEÑA@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
  --format=custom --file="backup-pre-migracion-$(date +%Y-%m-%d).dump"
```
(Usar el **Session pooler**, no `db.<ref>.supabase.co` que es IPv6. La contraseña es la
del usuario `postgres` del proyecto; si no la tenés, se resetea en Settings → Database.)

### 1.2. Export puntual de las filas cargadas en la app (USDT)
Aunque el full las conserva, por las dudas. En el SQL Editor de Supabase:
```sql
select * from public.movimientos_caja where origen = 'app';
```
→ botón **Download CSV**. Guardarlo junto al dump.

### 1.3. Copia de la planilla / Excel
- Si la fuente es el **Google Sheet**: `Archivo → Hacer una copia` (queda el historial de
  versiones de Google igual, pero la copia es explícita).
- Si la fuente es el **Excel `.xlsx`** de Drive: descargar una copia local con fecha.
- Guardar también el **Excel nuevo** que vas a migrar, sin tocar, como referencia.

---

## 2. Confirmar cuál es la fuente activa del sync

El paso 3 depende de esto. En el SQL Editor de Supabase:
```sql
select value from public.sync_state where key = 'last_run';
```
Mirá el campo `source`: `"excel"` = lee el `.xlsx` de Drive; `"sheets"` = lee el Google
Sheet nativo. (También lo define la env var `SYNC_SOURCE` en Netlify: sin definir o
`excel` → Excel; `sheets` → Sheet.)

---

## 3. Cargar los datos nuevos en la fuente

> **Recomendación transversal:** cargá la solapa CAJA **completa** (columnas de ingreso
> **+ columnas calculadas**) tomándolas **tal como las calculó el Excel** (valores, no
> fórmulas nuevas). Así los importes entran exactos y te evitás de raíz el problema de
> la cotización (ver sección 4). Traer solo fecha→notas y confiar en fórmulas del Sheet
> es más frágil.

### Camino A — la fuente es el Excel `.xlsx` (lo más simple y seguro)
El Excel ya tiene todo calculado. No hay que reconstruir nada.
1. En Drive, **reemplazá el contenido** del archivo que lee el sync **manteniendo el
   mismo file ID** (`EXCEL_FILE_ID = 1tuURACcfs09rRkynmVLqLD90Je5r-u58`):
   clic derecho sobre el archivo → **Gestionar versiones → Subir nueva versión** →
   elegí el Excel último. (Si en cambio subís un archivo nuevo, cambia el ID y hay que
   actualizarlo en `netlify/functions/sync-background.mts` y redeployar.)
2. Confirmá que la pestaña se sigue llamando exactamente **`CAJA`**.
3. Listo: el sync lo lee crudo (`raw:true`), con toda la precisión.

### Camino B — la fuente es el Google Sheet nativo
1. Abrí la solapa **`CAJA`** del Sheet que lee el sync
   (`SHEET_ID = 1BxW5TGUbi12LHATOIjnkBc71GY9JZARsy5_LP5Sl1CE`).
2. Traé los datos del Excel último. Para no perder precisión ni romper fórmulas:
   - Copiá el rango de datos del Excel (incluyendo las columnas calculadas
     **PESOS…CC REALES**, **COT**, **COTEXT**, **CUENTA**).
   - Pegá con **Pegado especial → Solo valores** (Ctrl+Shift+V). Así entran los números
     exactos que calculó el Excel, sin depender de que las fórmulas del Sheet recalculen.
   - Verificá que **FECHA** quede como fecha real y que **COT/COTEXT** queden como
     **número** (no texto): una celda numérica alineada a la derecha.
3. Requisitos que la sincronización necesita (no cambian):
   - La fila de **encabezados** con los nombres (`FECHA`, `CLIENTE`, `CAJA`, `OPERACIÓN`,
     `PROPIO`, `EXTERNO`, `MONTO`, `COT`, `COTEXT`, `COSTO`, `DEBE`, `NOTAS`, `CUENTA`,
     `PESOS`…`CC REALES`) debe estar dentro de las primeras filas (el sync la busca).
   - No dejar celdas combinadas en los encabezados.
   - El Sheet debe seguir **compartido con la cuenta de servicio** (Lector alcanza).

> Si NO vas a traer las columnas calculadas y preferís que las calcule el Sheet (variante
> del camino B): asegurate de que la solapa CAJA tenga las **fórmulas** de PESOS…CC REALES
> y COTEXT **extendidas hasta la última fila nueva**. Pegá solo fecha→notas en las filas
> nuevas y confirmá, fila por fila en una muestra, que las columnas calculadas se
> completaron. Es más trabajo y más propenso a error; por eso se recomienda traer valores.

---

## 4. El tema de la cotización (por qué "truncaba decimales")

Era un problema real y ya está resuelto en el sync; hay que respetarlo en la carga.

**Qué pasaba:**
1. **Lectura formateada**: leer el valor *mostrado* de la celda (con el formato de la
   planilla) truncaba decimales y las sumas acumulaban deriva (~7 USD sobre 34.000 filas).
2. **COT vs COTEXT**: la planilla calcula con **COTEXT** (la tasa efectiva, con
   decimales), no con **COT** (lo que tipeó el operador, a veces ya redondeado). En ~490
   filas históricas el operador pisó COTEXT con la tasa fina y COT quedó redondeada.
3. Redondear la cotización a 2 decimales rompía cruces como EUR/USD 1,23495.

**Cómo lo resuelve el sync (ya en producción):**
- Para el espejo `movimientos_caja` lee con **`UNFORMATTED_VALUE`** (Sheet) o crudo
  (`raw:true`, Excel): toma el número real, no el mostrado.
- Guarda **COT y COTEXT** por separado (`cot` y `cot_efectiva`) y el cálculo usa
  `cot_efectiva ?? cot`.
- Parsea las cotizaciones **sin redondear** (`parseNumeroPreciso`).

**Qué tenés que cuidar vos en la carga:**
- Que la columna **COTEXT** exista y venga poblada en la solapa CAJA (es la que manda).
- Que COT/COTEXT entren como **número con todos sus decimales**, no como texto ni
  pre-redondeados. Con el Camino A (Excel) esto sale solo. Con el Camino B, pegá **valores**
  y no reformatees a menos decimales (el formato de pantalla no afecta al sync, pero el
  valor subyacente sí: no lo pises con uno redondeado).

---

## 5. Correr la sincronización FULL

Con los datos ya cargados en la fuente:

- **Opción recomendada (GitHub Actions):** workflow *Sincronizar CAJA* → **Run workflow**
  con `mode=full`. Es el disparo de respaldo pensado para esto.
- **Opción por URL** (si tenés el `SYNC_SECRET` a mano):
  ```
  https://<sitio>/.netlify/functions/sync-background?mode=full&secret=<SYNC_SECRET>
  ```
- El botón "Sincronizar ahora" de la app hace un **incremental** (solo últimos 30 días):
  **no** sirve para la migración (no reconcilia lo viejo). Usá full.

El full es una función background (hasta 15 min): esperá a que termine antes de validar.

---

## 6. Verificación post-sync (que la app refleje lo mismo)

1. **La corrida validó sola** — en Supabase:
   ```sql
   select value from public.sync_state where key = 'last_run';
   ```
   Revisá:
   - `caja.validado` → conteo y sumas por columna coinciden con lo parseado.
   - `caja.motor.coincidencia` → debe dar **100 %** (o muy cerca; si baja, ver ejemplos).
2. **Totales contra la planilla**: compará el recuadro **R CAJA / "Saldo en moneda"**
   de la planilla contra Inicio → filtro **"Todo"**, moneda por moneda. Deben cerrar
   exacto. (Recordá que Inicio ya replica "Saldo en caja" = saldo en moneda − calle.)
3. **Conteo CTA CTE**:
   ```sql
   select count(*) from public.diario where tipo = 'CTA CTE';
   ```
4. **Una cuenta corriente de control**: abrí Cuentas Corrientes, elegí una cuenta con
   movimiento y confirmá que el cartel dice *"✓ El saldo acumulado cierra exacto…"*.
5. **USDT sigue vivo**: si cargaste USDT real,
   ```sql
   select count(*) from public.movimientos_caja where origen = 'app';
   ```
   debe seguir dando lo esperado (el full no las borra).

---

## 7. Limpiar datos de prueba de las UAT (antes del arranque real)

Durante las UAT podés haber cargado transacciones de prueba desde la app:
- Las que **NO** son USDT quedaron `origen='sheet'`: el full las **borra** solo (si no
  están en la planilla) — no hay que hacer nada.
- Las **USDT de prueba** son `origen='app'` y **sobreviven** al full. Hay que borrarlas a
  mano antes del arranque:
  ```sql
  -- Primero mirá cuáles son:
  select id, fecha, cliente, operacion, propio, externo, monto, usdt
  from public.movimientos_caja where origen = 'app' order by fecha;
  -- Borrá las de prueba por id (o todas si ninguna es real todavía):
  -- delete from public.movimientos_caja where id in ('...','...');
  ```

---

## 8. Rollback si algo sale mal

- **La app quedó con datos raros tras el full**: el estado de `movimientos_caja`/`diario`
  es **100 % reconstruible**: corregí la planilla y volvé a correr un **full**. No hay
  pérdida (la planilla es la fuente de verdad).
- **Se perdió algo NO reconstruible** (usuarios, config, USDT): restaurá del dump del
  paso 1.1:
  ```bash
  pg_restore --clean --if-exists --dbname="postgresql://postgres.<ref>:CLAVE@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
    backup-pre-migracion-AAAA-MM-DD.dump
  ```
  (Probá la restauración en un proyecto vacío ANTES si podés — "un backup no probado no
  es un backup".)
- **La planilla nueva quedó mal**: volvé a la copia del paso 1.3 y recargá.

---

## 9. Checklist del día del arranque

- [ ] Dump de Supabase hecho y guardado (1.1)
- [ ] CSV de filas `origen='app'` exportado (1.2)
- [ ] Copia de la planilla/Excel actual guardada (1.3)
- [ ] Confirmada la fuente activa del sync (2)
- [ ] Solapa CAJA cargada con el Excel último, **con columnas calculadas** (3)
- [ ] COT/COTEXT como número con decimales, COTEXT poblada (4)
- [ ] Full sync corrido y terminado (5)
- [ ] `caja.motor.coincidencia` ≈ 100 % y totales cierran contra R CAJA (6)
- [ ] Una cta cte de control cierra exacto (6)
- [ ] Datos de prueba USDT de las UAT borrados (7)
- [ ] Anotado cómo volver atrás (8)
