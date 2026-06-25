# Sincronización planilla CAJA → base de datos

Cómo se mantiene actualizada la tabla `diario` (movimientos CTA CTE) a partir del
archivo **Excel `CAJA`** en Google Drive.

## Idea general

- La **planilla** (Excel `.xlsx` en Drive) es donde se cargan/editan los datos a mano.
- La **base de datos** (Supabase) es lo que consulta la app (saldos, filtros, deudores).
- La sincronización copia planilla → base. Se hace en **3 etapas** para ser rápida y
  no exceder los límites de Netlify.

> ⚠️ El archivo debe ser **Excel `.xlsx` binario** (no Hoja de Google nativa) y la
> **pestaña** debe llamarse exactamente **`CAJA`**. Si se convierte a Google Sheet
> nativo, la lectura por `?alt=media` deja de funcionar (habría que pasar a Sheets API).

## Las 3 etapas

| Etapa | Cuándo | Qué hace |
|---|---|---|
| **Incremental** | Cada 15 min | Revisa solo los **últimos 30 días**. Si la planilla no cambió (`modifiedTime`), no hace nada. |
| **Full diario** | 03:00 UTC (00:00 ART) | **Reconciliación total**: borra todo CTA CTE y reinserta. Cubre ediciones a filas viejas. |
| **Manual** | Botón "Sincronizar" (superusuario) | Reload total on-demand (`/api/sync`). Respaldo. |

## Arquitectura (patrón Netlify trigger + background)

Las funciones programadas de Netlify tienen un límite de **30 s**; el sync puede tardar
más. Por eso una función programada (rápida) **dispara** una función background (hasta 15 min)
que hace el trabajo pesado.

```
cron-sync-incremental.mts  (scheduled */15 * * * *) ─┐
                                                     ├─► sync-background.mts  (background, 15 min)
cron-sync-full.mts         (scheduled 0 3 * * *)    ─┘        ├─ mode=incremental → ventana 30 días
                                                              └─ mode=full        → recarga total
```

### Archivos

- `netlify/functions/sync-background.mts` — hace el sync real (modos `full` / `incremental`).
- `netlify/functions/cron-sync-incremental.mts` — cron 15 min, dispara `mode=incremental`.
- `netlify/functions/cron-sync-full.mts` — cron diario, dispara `mode=full`.
- `src/app/api/sync/route.ts` — sync manual (botón, reload total).
- `migrations/2026-06-24_sync_state.sql` — tabla `sync_state` (guarda el `modifiedTime`).

## Configuración requerida

1. **Env vars en Netlify** (Functions / production):
   - `SYNC_SECRET` — secreto compartido que protege el endpoint `sync-background`.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — ya existentes.
2. **Migración** `migrations/2026-06-24_sync_state.sql` corrida en Supabase.
3. El service account (`client_email` del JSON) debe tener acceso **Editor** al archivo en Drive.
4. El `FILE_ID` del archivo está hardcodeado en `sync-background.mts` y `src/app/api/sync/route.ts`.
   Si cambia el archivo, actualizar en ambos.

## Carga inicial (una vez) o disparo manual del full

```bash
curl -X POST "https://TU-SITIO.netlify.app/.netlify/functions/sync-background?mode=full" \
  -H "x-sync-secret: EL_SYNC_SECRET"
```

Responde `202` al instante (corre en background). Verificar en
**Netlify → Functions → sync-background → Logs**: `✅ Full OK: N movimientos`.

## Verificación

- Logs de `sync-background`: `✅ Full OK` / `✅ Incremental OK` / `⏭️ sin cambios`.
- En Supabase: `select count(*) from diario where tipo = 'CTA CTE';`

## Errores comunes

| Síntoma en logs | Causa probable |
|---|---|
| `Unauthorized` (401) | Falta o no coincide `SYNC_SECRET`. |
| `Error descargando archivo: 403` | El archivo se convirtió a Google Sheet nativo, o el service account perdió acceso. |
| `Pestaña "CAJA" no encontrada` | La pestaña del Excel no se llama `CAJA`. |
| `No se encontraron encabezados` | Cambió la estructura de columnas (falta `FECHA`, etc.). |

## Limitaciones conocidas

- Una edición a una **fila vieja** (fuera de los últimos 30 días) se refleja recién en
  el **full diario** o con el botón manual.
- Con Excel binario, el incremental igual **descarga el archivo entero** (no se puede bajar
  por partes); el `modifiedTime` evita descargarlo cuando no hubo cambios.
