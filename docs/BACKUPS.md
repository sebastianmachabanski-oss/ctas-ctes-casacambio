# Backups de la base de datos (Supabase)

Qué se respalda, cómo exportar a un medio físico y qué cambia el día que la app
reemplace definitivamente a la planilla.

## Qué cubre Supabase según el plan

| Plan | Backups automáticos |
|---|---|
| Free | **Ninguno** — todo respaldo corre por cuenta nuestra |
| Pro | Diarios, 7 días de retención, descargables desde el dashboard |
| Team+ | Point-in-time recovery (restaurar a cualquier minuto) |

Verificar el plan actual en *Dashboard → Settings → Billing*.

## Export manual/programado a medio físico

Supabase es PostgreSQL estándar: el backup completo (esquema + datos) se hace con
`pg_dump` contra la cadena de conexión del proyecto
(*Dashboard → Settings → Database → Connection string*):

```bash
pg_dump "postgresql://postgres:CONTRASEÑA@db.PROYECTO.supabase.co:5432/postgres" \
  --format=custom --file="backup-casacambio-$(date +%Y-%m-%d).dump"
```

- **En Windows hay un script que hace esto solo: `scripts/backup-db.bat`.** Pide la
  cadena de conexión, verifica que `pg_dump` esté en el PATH y deja el `.dump` con
  la fecha en el nombre. Es la forma recomendada de correr el backup a mano; el
  comando de arriba queda como referencia de qué hace por dentro.
- El `.dump` se restaura con `pg_restore` en cualquier Postgres (incluso otro
  proyecto de Supabase): `pg_restore --dbname="postgresql://..." archivo.dump`.
- `pg_dump`/`pg_restore` vienen con el instalador estándar de PostgreSQL
  (en Windows también con pgAdmin). Alternativa: `supabase db dump` con la CLI oficial.
- El dump **no filtra tablas**: cubre todo el esquema `public`, incluidas las tablas
  que se agreguen en el futuro sin tocar este documento.
- Programarlo (tarea semanal en la máquina del negocio) y copiar el archivo a un
  disco externo. Para tablas sueltas alcanza el export CSV del SQL Editor, pero
  como estrategia de backup vale el dump completo.
- **Un backup no probado no es un backup**: hacer al menos una restauración de
  prueba a un proyecto vacío.

## Qué es recuperable hoy (convivencia con la planilla)

Mientras el Google Sheet siga siendo la fuente de verdad:

- `movimientos_caja` y `diario` son **reconstruibles al 100%** con una corrida
  *full* del sync (y el Sheet tiene además el historial de versiones de Google).
- Lo único no reconstruible son las tablas propias de la app: `profiles`
  (usuarios), `clientes`, `cuentas_corrientes`, `tipos_operacion`, `app_config`,
  `auditoria`, `sync_state`, y cualquier transacción cargada desde la app que
  todavía no haya llegado al Sheet. Son chicas: un dump semanal las cubre de sobra.
- ⚠️ **`auditoria` merece atención aparte.** Es el registro append-only de quién
  hizo qué (migración `2026-07-29_auditoria.sql`). Vive en su propia tabla
  justamente porque el sync full no la toca, así que **ninguna corrida del sync la
  reconstruye**: si se pierde, se pierde. Un dump anterior al 29/7/2026 no la
  contiene, porque la tabla todavía no existía.

## Cuando la app sea la única fuente de verdad

En ese momento el backup deja de ser opcional. Esquema recomendado:

1. **Plan Pro** (backups automáticos diarios) como primera línea.
2. **`pg_dump` periódico a disco físico** como segunda copia fuera de la nube.
3. Opcional a desarrollar: función programada que suba el dump a una carpeta de
   Drive del negocio con la misma cuenta de servicio que ya usa el sync — tercera
   copia sin intervención manual.
