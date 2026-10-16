# Instalar el sistema para un cliente nuevo

Pasos para dejar una instalación funcionando desde cero. Pensado para hacerse de una
sentada: son unas **2 horas** si no hay datos que migrar.

Cada cliente tiene **su propio proyecto de Supabase y su propio sitio de Netlify**, pero
todos salen del **mismo repositorio**. No se forkea: una corrección tiene que llegar a
todos con un solo cambio.

---

## 1. Base de datos (30 min)

1. Crear un proyecto nuevo en Supabase. Anotar la contraseña de la base: no se vuelve a
   mostrar.
2. Regenerar el SQL de instalación y pegarlo entero en el **SQL Editor**:

   ```bash
   npx tsx scripts/generar-bootstrap.mts   # escribe migrations/BOOTSTRAP.sql
   ```

   Se puede correr dos veces sin romper nada, por si queda a medias.
3. Verificar que haya quedado todo: **9 tablas, 2 vistas, 18 funciones, 23 policies,
   5 triggers**.

> **Cuando se agregue una migración nueva** hay que volver a generar el bootstrap. El
> generador obliga a clasificar cada archivo: si aparece uno sin clasificar, falla y avisa.
> Ver `scripts/generar-bootstrap.mts`.

---

## 2. Primer administrador (15 min)

La base quedó completa pero **vacía**: no hay ningún usuario y nadie puede entrar. La
pantalla de Usuarios no sirve para salir del paso, porque para usarla hay que estar
adentro.

```bash
SUPABASE_URL=https://xxxxx.supabase.co \
SERVICE_ROLE_KEY=eyJ... \
npx tsx scripts/crear-primer-admin.mts admin@cliente.com "Nombre Apellido"
```

Las dos credenciales salen de **Project Settings → API**.

La clave se genera al azar y **se muestra una sola vez**. Anotarla: en el primer ingreso
la app va a pedir cambiarla.

> La `service_role` key saltea RLS y da acceso total. No pegarla en un chat ni dejarla en
> un archivo versionado.

El script **aborta si ya hay usuarios de staff**. Es para el primer arranque y nada más.

---

## 3. Sitio en Netlify (15 min)

Sitio nuevo apuntando a este mismo repositorio, rama `main`. Variables de entorno:

| Variable | De dónde sale | Obligatoria |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ídem | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | ídem | Sí |
| `NEXT_PUBLIC_LABEL_INGRESO` | texto propio del cliente | No |
| `NEXT_PUBLIC_LABEL_EGRESO` | ídem | No |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | solo si migra desde una planilla | No |
| `SYNC_SECRET` | ídem | No |
| `NEXT_PUBLIC_APP_NOMBRE` | cómo se llama la app para este cliente | No |
| `NEXT_PUBLIC_MODULOS_OFF` | módulos que este cliente NO contrató | No |

### Marca y módulos

`NEXT_PUBLIC_APP_NOMBRE` reemplaza "Mi Cuenta Corriente" en las cinco pantallas que lo
muestran. Sin la variable, queda el nombre por defecto.

`NEXT_PUBLIC_MODULOS_OFF` es una lista separada por comas de lo que se apaga:

```
NEXT_PUBLIC_MODULOS_OFF=gastos,calle
```

| Módulo | Qué apaga |
|---|---|
| `transferencias` | El alta de transferencias y su listado |
| `gastos` | Gastos |
| `calle` | Dinero en calle |
| `posicion` | Posición Ctas Ctes |
| `ganancias` | Ganancias |
| `auditoria` | Auditoría |

Lo que no está en esa lista es el núcleo y no se puede apagar: Inicio, Cuentas Corrientes,
Nueva operación, Usuarios y Mi cuenta. Sin eso no hay producto.

**La lista es de lo que se APAGA, no de lo que se prende.** Es a propósito: casi todo el
producto le sirve a cualquier casa de cambio, así que una instalación nueva arranca con
todo y se recorta donde haga falta. Al revés, cada módulo nuevo obligaría a tocar la
configuración de todos los clientes para que lo vieran.

Apagar un módulo esconde su opción del menú **y bloquea sus pantallas**: con la URL en la
mano, redirige al panel. Esconder la opción sola no alcanza.

> Cambiar cualquiera de estas dos variables **requiere volver a desplegar**: se resuelven
> al compilar. Lo que el cliente ajusta por su cuenta —umbral de alerta, paridad de la
> libra— vive en `app_config` y se cambia desde la app, sin deploy.

---

## 4. Migrar los datos (variable)

Si el cliente viene de una planilla, el **sync sirve como herramienta de migración**: lee
la solapa CAJA y carga `movimientos_caja` y `diario`, validando contra el motor de cálculo
y reportando diferencias. Ver `docs/SINCRONIZACION.md`.

Para que funcione, la planilla tiene que cumplir tres cosas:

1. El layout de columnas de la solapa CAJA, con los mismos nombres.
2. El vocabulario de operaciones del motor: COMPRA, VENTA, INGRESAN, EGRESAN, GASTOS,
   SWITCH, ENTRA TT, SALE TT.
3. Montos y cotizaciones como números, no como texto.

**El trabajo real no es el sync: es llevar los datos del cliente a ese formato.** Eso
depende de cada caso y no se puede estimar sin ver la planilla. Con una planilla calcada
de la actual son unas 8 horas; con datos en formato libre, bastante más.

Si el cliente arranca de cero, no hay nada que hacer en este paso.

---

## Pendientes conocidos

- **Registro de qué migración corrió en cada cliente.** A partir del segundo despliegue
  hace falta saberlo; hoy no se lleva en ningún lado.
- **La maquinaria de la planilla** (sync, `excel-write`, borrado espejado) es peso muerto
  para un cliente que nunca tuvo Google Sheet. Falta verificar que degrade bien sin
  `GOOGLE_SERVICE_ACCOUNT_JSON`.
