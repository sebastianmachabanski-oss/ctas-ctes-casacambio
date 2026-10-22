# Manual: dar de alta un cliente nuevo

Guía paso a paso para instalar el sistema para una casa de cambio nueva.

**No hace falta saber programar.** Alcanza con copiar y pegar, seguir instrucciones y leer
lo que la pantalla devuelve. Donde algo pueda salir mal, está escrito qué hacer.

Cada cliente tiene **su propia base de datos y su propio sitio web**, pero todos usan el
**mismo código**. Nunca se copia el proyecto para modificarlo por cliente: una corrección
tiene que llegarles a todos con un solo cambio.

---

## Antes de empezar: qué vas a necesitar

| | Para qué | Cómo conseguirlo |
|---|---|---|
| Cuenta en **Supabase** | Ahí vive la base de datos del cliente | supabase.com, gratis para empezar |
| Cuenta en **Netlify** | Ahí vive la página web | netlify.com, conectada a GitHub |
| Acceso al repositorio | Es el código del sistema | Ya lo tenés |
| **Node.js** instalado | Para correr dos comandos | nodejs.org, versión 20 o superior |

### Preparar tu computadora (una sola vez)

Abrí una terminal y corré estos comandos, uno por vez:

```bash
git clone https://github.com/sebastianmachabanski-oss/ctas-ctes-casacambio.git
cd ctas-ctes-casacambio
npm install
```

El último tarda unos minutos y descarga lo que el proyecto necesita. Si termina sin decir
"error", está listo.

> **Qué es la terminal.** Es la ventana donde se escriben comandos en vez de hacer clic.
> En Windows se llama "Símbolo del sistema" o "PowerShell"; en Mac, "Terminal".

---

## Paso 0 · Mirar la planilla del cliente

**Objetivo:** saber qué estás vendiendo antes de venderlo. Todos los demás pasos duran lo
mismo siempre. Éste es el único que puede variar entre 8 y 40 horas, así que sin mirar sus
datos, cualquier precio que des es una apuesta.

**Tiempo: 1 a 2 horas.**

Pedile la planilla que usa hoy y revisala con estas preguntas:

1. ¿Tiene una hoja donde cada fila es una operación, con fecha, cliente, monto y moneda?
2. ¿Se entiende qué tipo de operación es cada fila? (compra, venta, ingreso, egreso, gasto)
3. ¿Los montos están cargados como números, o hay celdas con texto tipo "1.500 dólares"?
4. ¿Lleva cuentas corrientes de clientes, o solo opera al contado?

**Cómo interpretarlo:**

- **Planilla ordenada y parecida a la que ya usamos** → la migración son unas 8 horas.
- **Planilla propia pero consistente** → 15 a 25 horas.
- **Datos sueltos, columnas que cambian, montos como texto** → 40 horas o más. Conviene
  decirlo antes y no después.
- **Arranca de cero, sin historia** → no hay migración. Salteás el paso 5.

---

## Paso 1 · Crear la base de datos

**Objetivo:** armar la estructura donde van a vivir los datos del cliente: las tablas, los
cálculos y las reglas que deciden quién ve qué. Es el cimiento — si queda mal, todo lo que
se apoye encima queda mal.

**Tiempo: 30 minutos.**

### 1.1 Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y hacé clic en **New project**.
2. Ponele un nombre que identifique al cliente (ej. `cambio-fulano`).
3. Elegí una contraseña para la base y **anotala en un lugar seguro**. No se vuelve a
   mostrar.
4. Elegí la región más cercana al cliente.
5. Esperá a que termine de crearse (unos 2 minutos).

### 1.2 Generar el archivo de instalación

En la terminal, parado en la carpeta del proyecto:

```bash
npx tsx scripts/generar-bootstrap.mts
```

Tiene que responder algo así:

```
✅ migrations/BOOTSTRAP.sql — 23 archivos, 1947 líneas, 81.3 KB
```

> **Si dice que hay una migración sin clasificar**, significa que alguien agregó un cambio
> a la base y no lo registró. Avisale a quien desarrolla: no sigas, porque la instalación
> quedaría incompleta.

### 1.3 Instalar la estructura

1. En Supabase, en el menú de la izquierda, entrá a **SQL Editor**.
2. Hacé clic en **New query**.
3. Abrí el archivo `migrations/BOOTSTRAP.sql` con cualquier editor de texto,
   **seleccioná todo** (Ctrl+A / Cmd+A) y copiá.
4. Pegalo en el SQL Editor y hacé clic en **Run**.
5. Esperá. Tiene que terminar sin errores en rojo.

> **Si da error**, no pasa nada grave: este archivo se puede volver a correr las veces que
> haga falta sin romper lo que ya se creó. Copiá el mensaje de error y pasáselo a quien
> desarrolla.

### 1.4 Verificar

En el mismo SQL Editor, pegá esto y hacé **Run**:

```sql
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE') as tablas,
  (select count(*) from information_schema.views
    where table_schema = 'public') as vistas,
  (select count(*) from information_schema.routines
    where routine_schema = 'public') as funciones,
  (select count(*) from pg_policies where schemaname = 'public') as policies;
```

Tiene que devolver: **9 tablas, 2 vistas, 18 funciones, 23 policies**.

Si los números no coinciden, la instalación quedó incompleta. Volvé a correr el paso 1.3.

---

## Paso 2 · Crear el primer usuario

**Objetivo:** abrir la puerta. La base recién creada está completa pero vacía: no hay ni un
usuario, así que nadie puede entrar. Y la pantalla de Usuarios del sistema no sirve para
salir del paso, porque para usarla hay que estar adentro. Este paso rompe ese círculo, una
sola vez.

**Tiempo: 15 minutos.**

### 2.1 Buscar las credenciales

En Supabase: **Project Settings** (el engranaje) → **API**. Vas a necesitar dos datos:

- **Project URL** — algo como `https://abcdefgh.supabase.co`
- **service_role** (en la sección *Project API keys*) — un texto largo que empieza con `eyJ`

> ⚠️ **La clave `service_role` da acceso total a la base.** No la pegues en un chat, no la
> mandes por mail y no la guardes en un archivo del proyecto. Usala y cerrá la ventana.

### 2.2 Crear el administrador

En la terminal, reemplazando los valores por los del cliente:

```bash
SUPABASE_URL=https://abcdefgh.supabase.co \
SERVICE_ROLE_KEY=eyJhbGciOi... \
npx tsx scripts/crear-primer-admin.mts admin@cliente.com "Juan Pérez"
```

> **En Windows (PowerShell)** las variables se ponen antes, en líneas separadas:
> ```powershell
> $env:SUPABASE_URL="https://abcdefgh.supabase.co"
> $env:SERVICE_ROLE_KEY="eyJhbGciOi..."
> npx tsx scripts/crear-primer-admin.mts admin@cliente.com "Juan Pérez"
> ```

Si salió bien, vas a ver:

```
✅ Superadministrador creado.

   Usuario: admin@cliente.com
   Clave:   Kp3mXqRtVbNwZyLd7!

   Esta clave se muestra UNA SOLA VEZ y no queda guardada en ningún lado.
```

**Anotá la clave ahora.** En el primer ingreso el sistema va a pedir cambiarla.

> **Si dice "Esta base ya tiene usuarios de staff"**, es que alguien ya corrió este paso.
> No lo repitas: entrá al sistema y creá los usuarios desde la pantalla de Usuarios.

---

## Paso 3 · Publicar el sitio web

**Objetivo:** darle al cliente su propia dirección web, conectada a **su** base, con **su**
nombre y solo los módulos que contrató. El código es el mismo que el de todos los clientes;
lo único distinto es esta configuración.

**Tiempo: 15 minutos.**

### 3.1 Crear el sitio

1. Entrá a [netlify.com](https://netlify.com) → **Add new site** → **Import an existing project**.
2. Elegí GitHub y seleccioná el repositorio **ctas-ctes-casacambio**.
3. Rama: `main`. El resto de las opciones de build ya vienen configuradas en el proyecto —
   no las toques.
4. **Antes de hacer Deploy**, entrá a *Show advanced* → **New variable** y cargá las del
   punto siguiente.

### 3.2 Las variables

| Variable | Qué poner | ¿Obligatoria? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | El *Project URL* de Supabase | **Sí** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La clave **anon** (no la service_role) | **Sí** |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave **service_role** | **Sí** |
| `NEXT_PUBLIC_APP_NOMBRE` | Cómo se llama el sistema para este cliente | No |
| `NEXT_PUBLIC_MODULOS_OFF` | Módulos que no contrató, separados por coma | No |

Las tres claves salen de **Project Settings → API** en Supabase.

**Módulos que se pueden apagar:**

| Nombre | Qué deja de verse |
|---|---|
| `transferencias` | Nueva transferencia y su listado |
| `gastos` | Gastos |
| `calle` | Dinero en calle |
| `posicion` | Posición Ctas Ctes |
| `ganancias` | Ganancias |
| `auditoria` | Auditoría |

Por ejemplo, un cliente que no reparte dinero ni lleva gastos:

```
NEXT_PUBLIC_MODULOS_OFF=calle,gastos
```

Lo que no está en esa lista no se puede apagar: Inicio, Cuentas Corrientes, Nueva
operación, Usuarios y Mi cuenta. Sin eso no hay sistema.

> **Si no ponés ninguna de las dos últimas variables**, el cliente ve todo el sistema y se
> llama "Mi Cuenta Corriente". Es un punto de partida válido.

### 3.3 Publicar y probar

1. Hacé clic en **Deploy**. Tarda unos 3 minutos.
2. Cuando termine, abrí la dirección que te da Netlify.
3. Entrá con el usuario y la clave del paso 2.
4. El sistema va a pedirte cambiar la clave. Cambiala.

**Si llegaste hasta acá, el sistema está funcionando.**

> **Si la página da error**, casi siempre es una variable mal copiada. Revisá que no haya
> espacios de más al principio o al final, y que la clave *anon* no esté donde va la
> *service_role*. Después de corregir, en Netlify hacé **Deploys → Trigger deploy**.

---

## Paso 4 · Cambiar las variables más adelante

**Objetivo:** saber qué se cambia desde la app y qué necesita volver a publicar el sitio.
Confundirlos hace perder tiempo buscando un botón que no existe.

| Qué | Dónde se cambia | ¿Hay que republicar? |
|---|---|---|
| Nombre del sistema | Variable en Netlify | **Sí** |
| Qué módulos se ven | Variable en Netlify | **Sí** |
| Umbral de alerta por monto grande | Dentro de la app, en Nueva operación | No |
| Cuántos dólares vale una libra | Ídem | No |
| Usuarios y permisos | Dentro de la app, en Usuarios | No |

Para republicar: en Netlify, **Deploys → Trigger deploy → Deploy site**.

---

## Paso 5 · Migrar los datos del cliente

**Objetivo:** que el cliente arranque con su historia adentro y no con una pantalla en
blanco. Es la diferencia entre "probar un sistema nuevo" y "seguir trabajando con mis datos
de siempre". Y es donde se juega la confianza: si los saldos no coinciden con lo que él ya
conoce, no lo va a usar.

**Tiempo: entre 8 y 40 horas, según lo que viste en el paso 0.**

> **Si el cliente arranca de cero, salteá este paso.** Ya terminaste.

### 5.1 Adaptar la planilla

**Acá está el 90% del trabajo de este paso.** El sistema puede leer una planilla de Google
e importar todo, pero espera un formato preciso. Hay que llevar la planilla del cliente a
ese formato:

1. Los nombres de las columnas tienen que coincidir con los que espera el sistema.
2. Cada operación tiene que usar una de estas palabras: **COMPRA, VENTA, INGRESAN,
   EGRESAN, GASTOS, SWITCH, ENTRA TT, SALE TT**.
3. Los montos y las cotizaciones tienen que ser números, no texto.

El detalle del formato está en `docs/SINCRONIZACION.md`. Esta parte normalmente la hace
quien desarrolla, junto con el cliente.

### 5.2 Dar acceso a la planilla

Compartí la planilla de Google con la dirección de la cuenta de servicio (termina en
`.iam.gserviceaccount.com`), con permiso de **lector**.

### 5.3 Encender la importación

En Netlify, agregá estas tres variables y volvé a publicar:

```
GOOGLE_SERVICE_ACCOUNT_JSON=...        (lo provee quien desarrolla)
SYNC_SECRET=...                        (una clave inventada, larga)
NEXT_PUBLIC_PLANILLA_ACTIVA=true
```

La última hace aparecer la opción **Sincronizar** en el menú, que normalmente está oculta.

### 5.4 Importar

1. Entrá al sistema y andá a **Sincronizar**.
2. Corré una importación **completa**.
3. Esperá: con muchos movimientos puede tardar varios minutos.
4. El sistema informa si encontró diferencias entre lo que dice la planilla y lo que
   calcula por su cuenta.

### 5.5 Controlar

**Este control no se saltea.** Compará contra la planilla del cliente:

- El saldo de caja de cada moneda.
- El saldo de 5 o 6 cuentas corrientes, eligiendo las de más movimiento.
- El total de un mes cualquiera.

**Tienen que dar exacto, no parecido.** Si hay diferencias, no sigas: avisá a quien
desarrolla. Un sistema que arranca con los saldos mal no se recupera.

### 5.6 Apagar la importación

Cuando los números estén confirmados:

1. En Netlify, **borrá** `NEXT_PUBLIC_PLANILLA_ACTIVA` y `GOOGLE_SERVICE_ACCOUNT_JSON`.
2. Volvé a publicar.

> ⚠️ **Esto es importante.** Si la importación queda encendida y el cliente sigue usando su
> planilla vieja, en la próxima corrida **le pisa todo lo que haya cargado en el sistema**.
> Es un problema real que ya pasó. Apagala.

---

## Paso 6 · Capacitación y arranque

**Objetivo:** que lo usen. Un sistema instalado y no adoptado es trabajo tirado. El período
en paralelo existe para que el cliente compruebe por su cuenta que los números coinciden —
es lo que le da permiso a soltar la planilla.

**Tiempo: 2 a 3 horas.**

1. Mostrale **Nueva operación**: cargar una compra, una venta, un ingreso.
2. Mostrale **Cuentas Corrientes**: buscar un cliente, ver su saldo, exportar el extracto.
3. Mostrale **Inicio**: los saldos del día y el listado de operaciones.
4. Si contrató Ganancias, explicale que el resultado es **del período**, no de cada
   operación: una compra no genera ganancia hasta que se vende.
5. Creá los usuarios del personal desde **Usuarios**, con el rol que corresponda.

**Dejalo cargar en paralelo con lo que usaba antes durante una o dos semanas.** Es la única
forma de que confíe en los números.

---

## Resumen de tiempos

| Paso | Horas |
|---|---|
| 0 · Relevar la planilla | 1 a 2 |
| 1 · Base de datos | 0,5 |
| 2 · Primer usuario | 0,25 |
| 3 · Sitio web | 0,25 |
| 5 · Migrar los datos | **8 a 40** |
| 6 · Capacitación | 2 a 3 |

**Sin migración: unas 4 horas.** Con migración, lo que haya salido del paso 0.

---

## Los cuatro roles del sistema

Conviene tenerlos claros antes de crear los usuarios del cliente:

| Rol | Qué puede hacer |
|---|---|
| **Cliente** | Solo su propia cuenta corriente y su contraseña |
| **Operador** | Cuentas corrientes y operaciones. Carga, pero **no edita ni borra** |
| **Administrador** | Todo, **menos** Ganancias |
| **Superadministrador** | Todo, **incluido** Ganancias |

La única diferencia entre los dos últimos es Ganancias. El detalle está en `docs/ROLES.md`.

---

## Qué hacer si algo sale mal

| Síntoma | Causa habitual | Qué hacer |
|---|---|---|
| La página no carga | Variable mal copiada en Netlify | Revisá espacios de más; republicá |
| "Credenciales inválidas" al entrar | Clave cambiada o usuario inactivo | Reseteá la clave desde Supabase → Authentication |
| Una pantalla da error de columna | Falta correr una actualización de la base | Avisá a quien desarrolla |
| Falta una opción en el menú | Está en `NEXT_PUBLIC_MODULOS_OFF` | Sacala de la lista y republicá |
| Los saldos no coinciden | Problema de migración | **No sigas.** Avisá antes de que carguen más |

---

## Pendientes conocidos

Cosas que todavía no están resueltas y conviene tener presentes:

- **No hay registro de qué actualización de base corrió cada cliente.** Con un solo
  cliente no molesta; a partir del segundo hace falta llevarlo.
- **La escritura hacia la planilla sigue activa** mientras `GOOGLE_SERVICE_ACCOUNT_JSON`
  esté cargada. Para un cliente nuevo, sacá esa variable al terminar la migración.
