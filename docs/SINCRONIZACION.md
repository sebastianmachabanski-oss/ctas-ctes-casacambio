# Sincronización planilla CAJA → base de datos

Cómo se mantiene actualizada la tabla `diario` (movimientos CTA CTE) a partir del
archivo **Excel `CAJA`** en Google Drive.

## Idea general

- La **planilla** es donde se cargan/editan los datos a mano.
- La **base de datos** (Supabase) es lo que consulta la app (saldos, filtros, deudores).
- La sincronización copia planilla → base, en dos modos: **incremental** y **full**.

## Fuente de datos: Excel o Google Sheet (conmutable)

La función de sync puede leer de dos orígenes, según la env var **`SYNC_SOURCE`**:

| `SYNC_SOURCE` | Origen | Cómo lee |
|---|---|---|
| *(sin definir)* o `excel` | **Excel `.xlsx`** en Drive (`EXCEL_FILE_ID`) | Descarga el binario por `?alt=media` y lo parsea con `xlsx`. Comportamiento histórico. |
| `sheets` | **Google Sheet nativo** (`SHEET_ID`) | Lee con la **Google Sheets API** (`spreadsheets.values.get`). Más rápido y simple. |

- **Default seguro:** mientras `SYNC_SOURCE` no sea `sheets`, todo funciona como siempre
  (Excel). El switch es instantáneo y reversible: se cambia la env var en Netlify y se
  redeploya; para volver atrás, se saca la var.
- En ambos casos la **pestaña** debe llamarse exactamente **`CAJA`** y la lógica de
  parseo (buscar encabezados, filtrar `CTA CTE`, mapear columnas) es idéntica.
- Para la fuente `sheets`: la **Google Sheets API** debe estar habilitada en el proyecto
  y el Sheet debe estar **compartido con la cuenta de servicio** (Lector alcanza).
- La marca `last_run` en `sync_state` incluye `source` para saber con qué origen corrió.

## Modos

| Modo | Qué hace |
|---|---|
| **incremental** | Procesa solo los **últimos 30 días** (borra/reinserta esa ventana). Rápido. Incluye chequeo de `modifiedTime`: si la planilla no cambió, no hace nada. |
| **full** | **Reconciliación total**: borra todo CTA CTE y reinserta. Cubre ediciones a filas viejas. |

## Quién dispara la sincronización

- **Automático: [cron-job.org](https://cron-job.org)** — es el disparador principal (más
  confiable y puntual que los schedulers de Netlify/GitHub). Tiene dos jobs que pegan
  (GET) al endpoint de la función:
  - **incremental** cada 15 min
  - **full** una vez al día (horario no laboral)
- **Manual (app):** botón "Sincronizar ahora" en `/dashboard/admin/sync` → llama a
  `/api/sync`, que hace un **incremental** (últimos 30 días).
- **Manual (respaldo):** GitHub Actions → workflow *Sincronizar CAJA* → Run workflow.

## Cómo funciona la función

`netlify/functions/sync-background.mts` — **función background** de Netlify (hasta 15 min).
Hace el sync real en modo `full` o `incremental`. Se invoca por URL con un secreto:

```
https://<sitio>/.netlify/functions/sync-background?mode=incremental&secret=<SYNC_SECRET>
```

(El secreto también se acepta por header `x-sync-secret`.)

### Archivos

- `netlify/functions/sync-background.mts` — la función que hace el sync (full / incremental).
- `src/app/api/sync/route.ts` — botón "Sincronizar" de la app (incremental, síncrono, devuelve conteo).
- `src/app/api/excel-write/route.ts` — escribe nuevas transacciones de vuelta al Excel.
- `src/middleware.ts` — bypass de rutas `/.netlify/` (si no, redirige las llamadas a `/login`).
- `migrations/2026-06-24_sync_state.sql` — tabla `sync_state` (guarda el `modifiedTime`).
- `.github/workflows/sync-caja.yml` — disparo manual de respaldo (solo `workflow_dispatch`).

## Configuración requerida

1. **Env vars en Netlify:** `SYNC_SECRET` (protege el endpoint), más las existentes
   `GOOGLE_SERVICE_ACCOUNT_JSON`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
2. **Migración** `migrations/2026-06-24_sync_state.sql` corrida en Supabase.
3. El service account del JSON debe tener acceso al archivo: **Editor** al `.xlsx`
   (fuente `excel`), o al menos **Lector** al Google Sheet (fuente `sheets`).
4. Los IDs (`EXCEL_FILE_ID` y `SHEET_ID`) están hardcodeados en `sync-background.mts`.
   Si cambia algún archivo, actualizar ahí.
5. **cron-job.org:** dos jobs apuntando a la URL del endpoint con `&secret=<SYNC_SECRET>`
   (uno `mode=incremental` cada 15 min, otro `mode=full` diario).
6. **Para usar la fuente `sheets`:** habilitar la Google Sheets API en el proyecto,
   compartir el Sheet con la cuenta de servicio, y poner `SYNC_SOURCE=sheets` en Netlify.

## Verificación

- En cron-job.org: el historial del job debe mostrar **HTTP 202**.
- En Supabase: `select * from sync_state;` → `value` = última modificación vista del
  archivo; `updated_at` = última corrida que escribió en base.
- Conteo: `select count(*) from diario where tipo = 'CTA CTE';`

## Errores comunes

| Síntoma | Causa probable |
|---|---|
| Respuesta `307 → /login` | El middleware está interceptando la ruta (ver bypass en `src/middleware.ts`). |
| `Unauthorized` (401) | Falta o no coincide `SYNC_SECRET`. |
| `307 → otra URL` / no corre | Falta seguir el redirect, o método equivocado. La función responde a **GET**. |
| `Error descargando archivo: 403` (fuente `excel`) | El archivo se convirtió a Google Sheet nativo, o el service account perdió acceso. |
| `Error leyendo Google Sheet: 403` (fuente `sheets`) | El Sheet no está compartido con la cuenta de servicio, o la Sheets API no está habilitada. |
| `Error leyendo Google Sheet: 404` (fuente `sheets`) | `SHEET_ID` incorrecto. |
| `Pestaña "CAJA" no encontrada` | La pestaña no se llama `CAJA`. |

## Limitaciones conocidas

- El **incremental** solo ve los últimos 30 días; una edición a una fila más vieja se
  refleja recién con el **full** diario (o disparando un full a mano).
- Con Excel binario, el incremental igual **descarga el archivo entero** (no se puede
  bajar por partes); el `modifiedTime` evita descargarlo cuando no hubo cambios.

## Espejo completo de CAJA (`movimientos_caja`)

Desde julio 2026 el sync también llena `movimientos_caja`: **todas** las filas de la
solapa CAJA (compras, ventas, gastos, saldos iniciales, cta cte, etc.), no solo CTA CTE.
Es la base sobre la que se construyen los reportes de la app (situación de caja,
clientes, histórico, ganancias). Requiere la migración
`migrations/2026-07-05_movimientos_caja.sql`; hasta que se corra, el sync la saltea con
un warning y todo lo demás sigue funcionando igual.

Puntos de diseño:

- **Valores sin formato**: para el espejo se lee el Sheet con `UNFORMATTED_VALUE`
  (la fuente `excel` ya viene cruda por `raw:true`). Leyendo valores formateados las
  sumas acumulan deriva de redondeo — medida en la reconciliación de julio 2026:
  ~7 dólares sobre 34.000 filas. Con crudos, la suma de `dolares` hasta el 1/7/2026
  coincide EXACTO con el SALDO INICIAL de R CAJA (445.565,43).
- **`cliente` es texto libre, no normalizado**: en filas de tipo CAJA son clientes
  eventuales tal como se tipearon (decisión de negocio 5/7/2026). En filas CTA CTE
  guarda el nombre de la cuenta corriente (tomado de la columna CAJA de la planilla).
- **Columnas calculadas de la planilla** (`pesos`…`cc_reales`): se importan tal cual;
  durante la convivencia son la fuente de verdad. El motor de cálculo de la app
  (`src/lib/motor-calculo`) las recalculará en paralelo para validar antes de reemplazarlas.
- **Validación automática por corrida**: tras insertar, el sync compara conteo y suma
  de cada columna contra lo parseado (función SQL `caja_totales`) y registra el
  resultado en `sync_state.last_run` (campo `caja.validado`).
- **Validación local del parser**: `npx tsx scripts/validar-sync-caja.mts <dump.json>`
  con un dump UNFORMATTED de la solapa — chequea contra los valores confirmados en la
  reconciliación (4.078 filas y −98.251,73 en 17/4–19/6; saldo 445.565,43 al 1/7).
