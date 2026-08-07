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

> **Situación actual (7/8/2026): plan Free, y la decisión del negocio es no pasar a
> Pro.** Es decir: **no hay ningún backup automático**. Todo respaldo es manual y
> depende de que alguien lo corra. Ver la sección "Sin poder instalar software" más
> abajo, que es el escenario real de la máquina del negocio.

## Sin poder instalar software (export CSV desde el navegador)

En la máquina del negocio no se puede instalar PostgreSQL, así que `pg_dump` no está
disponible. La alternativa que **no requiere instalar nada** es el export CSV del
SQL Editor de Supabase.

Funciona porque **el esquema ya vive en el repositorio** (`schema.sql` +
`migrations/`): lo único que falta respaldar son los datos.

Correr cada query en *SQL Editor* y bajar el resultado con **Download CSV**:

```sql
select * from public.profiles;
select * from public.clientes;
select * from public.cuentas_corrientes;
select * from public.tipos_operacion;
select * from public.app_config;
select * from public.auditoria;
select * from public.sync_state;
select * from public.movimientos_caja where origen = 'app';
```

Son exactamente las tablas que ningún sync reconstruye. `diario` y el resto de
`movimientos_caja` no hacen falta: vuelven enteros con una corrida *full*.

Alternativa de una sola descarga: una query con `json_build_object` que arme un único
JSON con las ocho tablas. Si el editor trunca el resultado por tamaño, volver a las
queries sueltas.

**Qué se pierde respecto del dump**: restaurar es más manual — hay que recrear el
esquema desde `schema.sql` + `migrations/` y después importar los CSV. No se pierden
datos, que es lo que importa. Cuando haya una máquina donde se pueda instalar
PostgreSQL, hacer el `pg_dump` completo y guardarlo como línea de base.

> Para el dump completo no hace falta *instalar* PostgreSQL: alcanza con el ZIP de
> **binarios sueltos** de
> [enterprisedb.com/download-postgresql-binaries](https://www.enterprisedb.com/download-postgresql-binaries),
> que se descomprime en una carpeta (`C:\pgsql`) y se usa directo —
> `C:\pgsql\bin\pg_dump.exe ...`. No toca el sistema, no pide permisos de
> administrador y se puede borrar o llevar en un pendrive.

### Versión automatizada: script del proyecto

Bajar ocho CSV a mano cada vez es tedioso y fácil de olvidar. `scripts/backup-datos.mjs`
hace exactamente lo mismo, de una: usa `@supabase/supabase-js`, que **ya es dependencia
del proyecto**, así que no hay nada nuevo que instalar. Necesita el repositorio y Node
(no sirve en una máquina donde solo haya un navegador — para ese caso están los CSV de
arriba).

```
node scripts/backup-datos.mjs
```

En Windows, doble clic en **`scripts/backup-datos.bat`** (instala las dependencias si
faltan). Genera `backups/backup-AAAA-MM-DD_HH-mm/` con un `.ndjson` por tabla y un
`manifiesto.json`.

Dos cosas que el camino manual no da:

- **Verifica lo que baja.** Compara las filas escritas contra el conteo real de cada
  tabla y termina con error si no coinciden. Pagina de a 1.000 porque Postgrest corta
  ahí — el mismo motivo por el que hubo que paginar la RPC de clientes en Inicio.
- **Trae la vuelta.** `scripts/restaurar-datos.mjs` carga los datos respetando el orden
  de dependencias entre tablas:

```
node scripts/restaurar-datos.mjs backups/backup-AAAA-MM-DD_HH-mm             # prueba en seco
node scripts/restaurar-datos.mjs backups/backup-AAAA-MM-DD_HH-mm --confirmar
```

  Sin `--confirmar` no escribe nada: valida los archivos y muestra qué haría. El esquema
  tiene que existir antes (aplicar `schema.sql` y las `migrations/`).

A diferencia de la lista de ocho tablas de arriba, el script respalda **todas** las
tablas, incluidas `diario` y `movimientos_caja` completas. Hoy son reconstruibles con un
*full*, pero el día que se retire la planilla dejan de serlo, y así el backup ya las
cubre sin cambiar nada.

**Limitación de las dos vías sin `pg_dump`**: no respaldan `auth.users` (las
credenciales de acceso), solo los perfiles en `public.profiles`. Si se perdiera el
proyecto entero habría que recrear los usuarios a mano.

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
  (en Windows también con pgAdmin).
- El dump **no filtra tablas**: cubre todo el esquema `public`, incluidas las tablas
  que se agreguen en el futuro sin tocar este documento.

> ⚠️ **`supabase db dump` no sirve como atajo: exige Docker.** La CLI oficial parece
> una alternativa a instalar PostgreSQL, pero corre `pg_dump` dentro de un contenedor.
> Verificado ejecutándola: falla con `LegacyDockerRunError: failed to connect to the
> docker API`. En Windows implica Docker Desktop (WSL2, virtualización, varios GB) —
> más pesado que instalar PostgreSQL, no menos.
- Programarlo (tarea semanal en la máquina del negocio) y copiar el archivo a un
  disco externo.
- **Un backup no probado no es un backup**: hacer al menos una restauración de
  prueba a un proyecto vacío.

---

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

> ⚠️ Con la decisión actual de quedarse en Free, el punto 1 no existe. Mientras la
> planilla siga siendo la fuente de verdad no es grave: un *full* reconstruye casi
> todo. Pero el día que la planilla se retire, el único respaldo sería el manual —
> hay que resolver antes el punto 2 (una máquina con PostgreSQL) o el 3.
3. Opcional a desarrollar: función programada que suba el dump a una carpeta de
   Drive del negocio con la misma cuenta de servicio que ya usa el sync — tercera
   copia sin intervención manual.
