# Video de demostración

Graba un recorrido por la aplicación, con datos ficticios y texto sobreimpreso, para
mostrarle el producto a un cliente potencial sin tener que hacer una demostración en vivo.

**Dura alrededor de 2 minutos y 20 segundos. No tiene voz**: el texto que explica cada
pantalla aparece abajo, sobre la imagen.

El recorrido entra **con dos usuarios distintos**: el administrador, y el cliente de la
casa de cambio mirando su propia cuenta. El cambio de usuario se ve en el video a
propósito, porque es parte de lo que se está mostrando.

---

## Lo que hay que tener antes de empezar

1. **Una base de demostración**, aparte de la del cliente. Se arma con los pasos 1 a 3 de
   `docs/NUEVO-CLIENTE.md` y se llena con tres scripts, en este orden:

   | Script | Qué deja |
   |---|---|
   | `scripts/sembrar-demo.mts` | 120 días de operaciones ficticias |
   | `scripts/crear-cliente-demo.mts` | el usuario con rol **cliente**, atado a una cuenta |
   | `scripts/sembrar-auditoria-demo.mts` | el registro de auditoría |

   Los tres exigen la bandera `--confirmo-que-es-una-base-de-demo` **y** comprueban que
   todas las cuentas de la base sean del elenco ficticio. Contra la base de un cliente
   real no escriben nada: abortan.

   El de auditoría hace falta porque ese registro lo escribe la app cuando una persona
   hace algo; sembrando directo contra la base queda vacío, y la pantalla de Auditoría
   —de las que más tranquilizan a quien evalúa el sistema— aparecería en blanco.

2. **La aplicación andando en esta computadora**, apuntando a esa base.
3. **Dos usuarios de esa base**: el administrador (`scripts/crear-primer-admin.mts`) y el
   cliente (`scripts/crear-cliente-demo.mts`).

> **Esto NO se graba contra la aplicación del cliente.** El programa solo acepta grabar
> contra `localhost` y se niega a hacerlo contra cualquier otra dirección. Es a propósito:
> evita que, por un descuido, termine circulando un video con los movimientos y los nombres
> de los clientes reales.

---

## Los cuatro pasos

### 1. Instalar lo que hace falta (una sola vez)

```bash
cd demo
npm install
npx playwright install chromium
```

`playwright install chromium` baja un navegador aparte, que es el que se graba. Pesa unos
cientos de megas y queda guardado; no hay que volver a bajarlo.

### 2. Levantar la aplicación con los datos de demostración

En **otra ventana de la terminal**, desde la carpeta del proyecto:

```bash
npm run dev
```

Queda andando en `http://localhost:3000`. Esa ventana no se cierra hasta terminar de grabar.

Antes de seguir, abrir esa dirección en el navegador y confirmar **que los datos que se ven
son los ficticios**. Si aparecen los del cliente, la aplicación está apuntando a la base
equivocada: cortar y revisar `.env.local`.

### 3. Grabar

En la primera ventana:

Las credenciales se escriben **una sola vez**, en un archivo:

```powershell
cd demo
copy credenciales.local.ejemplo credenciales.local
notepad credenciales.local
```

Se completan los cuatro valores y se guarda. Desde ahí, grabar es:

```powershell
npm run grabar
```

`credenciales.local` no se sube al repositorio.

Los dos primeros valores son el administrador; los dos últimos, el cliente. Si faltan los
del cliente, esas paradas se saltean con un aviso y el resto del video se graba igual.

También se pueden pasar como variables de entorno, y en ese caso **mandan sobre el
archivo** — útil para una prueba suelta sin tener que editarlo:

```powershell
$env:DEMO_ESPERA=5000
npm run grabar
```

Se abre una ventana de navegador que se maneja sola. **No hay que tocar nada ni mover el
mouse**: lo que se ve ahí es lo que queda grabado. Al terminar, se cierra sola y la terminal
dice dónde quedó el archivo:

```
✅ Listo: demo/salida/demo-2026-10-20.webm
```

### 4. Pasarlo a MP4 (y ponerle música)

```powershell
npm run mp4
```

Busca la última grabación, la convierte, y avisa dónde quedó. Necesita **ffmpeg**
instalado (`winget install Gyan.FFmpeg` en Windows, `brew install ffmpeg` en Mac; después
hay que cerrar y volver a abrir la terminal).

El archivo sale en WebM porque es lo único que sabe grabar el navegador. WebM se ve bien
en cualquier navegador, pero para mandarlo por WhatsApp o por correo conviene MP4.

#### La música

Poné un archivo llamado **`musica.mp3`** en la carpeta `demo` y volvé a correr
`npm run mp4`. Se mezcla sola: se recorta al largo del video —o se repite si es más
corta—, se baja de volumen para que no tape nada, y se desvanece en los últimos tres
segundos para que no termine de golpe.

Si quedó alta o baja:

```powershell
$env:DEMO_VOLUMEN=0.10
npm run mp4
```

El valor por defecto es `0.18`, o sea el 18% del volumen original.

La música se prepara antes de mezclarla: se le recortan los silencios de las dos puntas y
las vueltas se encadenan con un cruce de dos segundos. Sin eso, una pista más corta que el
video frena, hace un bache y vuelve a arrancar en cada vuelta — porque casi toda la música
empieza y termina con silencio, y al repetirla esos dos silencios quedan pegados.

⚠️ **La música no viene incluida, a propósito.** Tiene dueño: subir un archivo al
repositorio sería repartir algo cuya licencia no conocemos. Hay bibliotecas de música
libre de regalías con pistas pensadas para presentaciones; al elegir una hay que
verificar que la licencia permita **uso comercial**, porque un video de venta lo es
aunque no se cobre por el video. Algunas piden mencionar al autor.

## Cambiar lo que dice el video

Todo el guion está en **`demo/guion.json`**. Se abre con el Bloc de notas y se edita como
un texto: **no hace falta tocar nada de programación**.

Cada parada es un bloque como este:

```json
{
  "como": "staff",
  "ruta": "/dashboard/ganancias",
  "titulo": "Cuánto se ganó",
  "texto": "Por día, semana, mes o año. Y el detalle de cómo se llegó a ese número.",
  "espera": 5200
}
```

| Campo | Qué es |
|---|---|
| `titulo` | el renglón grande del cartel |
| `texto` | la explicación, abajo del título |
| `espera` | cuánto se queda ahí, en milésimas de segundo (1000 = 1 segundo) |
| `ruta` | qué pantalla mostrar. `null` = quedarse en la de antes, para decir dos cosas sobre la misma |
| `como` | con qué usuario: `"staff"` (el administrador) o `"cliente"` |
| `accion` | opcional: `"bajar"`, `"bajar-despacio"` o `"cargar-operacion"` |

### Dos clases de parada

**Lámina de sección** (`"tipo": "lamina"`) — anuncia lo que viene. No muestra la
aplicación:

```json
{
  "tipo": "lamina",
  "seccion": "01 · OPERACIÓN DIARIA",
  "titulo": "La caja, siempre al día",
  "puntos": ["Todas las monedas", "Carga en segundos", "Impacto a la vista"],
  "espera": 4200
}
```

**Pantalla** — muestra la aplicación. Con `etiqueta` aparece solo el nombre en un rincón,
para las que pasan rápido después de una lámina; con `texto`, el cartel grande de abajo,
para lo que hay que explicar.

```json
{ "ruta": "/dashboard/inicio", "etiqueta": "Inicio", "espera": 3000 }
```

Está armado así porque el video recorría diecisiete pantallas seguidas, cada una con su
explicación: quien ya conoce el sistema lo seguía, quien no lo había visto nunca se
perdía. Partido en secciones, cada una se anuncia primero y después se ve rápido — y las
pantallas pueden pasar mucho más rápido justamente porque ya le dijeron qué va a ver.

**Para cambiar un texto**, cambiá lo que está entre comillas y guardá. Listo.

**Para sacar una parada**, borrá su bloque entre llaves. **Para agregar una**, copiá uno
parecido y cambiale el contenido.

⚠️ El único cuidado: **todos los bloques llevan una coma al final menos el último**. Es el
error típico de este formato.

### Revisar antes de grabar

```bash
cd demo
npm run revisar
```

Responde en un segundo y **no necesita nada prendido**: ni la aplicación, ni el navegador.
Revisa el formato y además lo que el formato no puede —que cada parada tenga título y
texto, que el usuario sea uno de los dos que existen, que las acciones nombradas
existan—, lista el recorrido completo para leerlo de corrido y calcula cuánto va a durar
el video.

Leer el recorrido seguido ayuda a notar lo que parada por parada no se ve: dos carteles
que dicen casi lo mismo, o una transición que falta.

Si quedó un dedazo, cualquiera de los tres comandos te muestra **el renglón**, con los de
alrededor y una marca debajo del carácter exacto:

```
❌ El guion está mal escrito.
   Renglón 189, columna 7:

     187 |       "ruta": "/dashboard/transferencias",
     188 |       "titulo": "Transferencias"
   > 189 |       "texto": "Registro de las transferencias",
         |       ^
```

Ojo: **el problema suele estar en el renglón marcado o en el anterior.** Una coma que
falta se nota recién al leer el renglón siguiente — en el ejemplo, lo que falta es la coma
al final del 188.

Y no graba nada: el video anterior queda intacto.

### La pantalla de presentación

El video abre con una portada que dice de qué se trata y lista las funcionalidades, para
que el que mira tenga el mapa antes de que empiecen a pasar cosas. Está en `guion.json`,
en el bloque `portada`:

```json
"portada": {
  "titulo": "Sistema para Casa de Cambio",
  "subtitulo": "Toda la operatoria en un solo lugar",
  "puntos": ["Caja en todas las monedas, al instante", "…"],
  "espera": 9000
}
```

`puntos` se acomoda solo en dos columnas. Para que el video arranque directo en la
aplicación, se borra el bloque entero.

### El color del cartel

También en `guion.json`, en el bloque `estilo`:

```json
"estilo": {
  "fondo": "228,228,233"
}
```

`fondo` son los tres números del color (rojo, verde y azul, de 0 a 255), sin `#` y
separados por comas — va así porque el cartel usa ese mismo color opaco abajo y
transparente arriba.

| Números | Color |
|---|---|
| `205,206,213` | gris claro (el actual) |
| `228,228,233` | un poco más claro |
| `200,200,206` | gris claro un poco más apagado |
| `245,245,245` | casi blanco |
| `113,113,122` | gris medio |
| `32,32,36` | gris oscuro |

**El color del texto se elige solo** según lo claro que sea el fondo: sobre un fondo claro
sale oscuro y sobre uno oscuro sale blanco. Así se pueden probar tonos sin terminar con un
cartel ilegible, que de otro modo se descubre recién al mirar el video. Para imponerlo a
mano, se agrega `"texto": "#18181b"` al mismo bloque.

El gris claro está elegido a propósito. El azul original era casi el mismo de la barra
lateral de la aplicación y el cartel se confundía con ella. El gris oscuro que lo
reemplazó seguía siendo oscuro, y a la distancia leía igual: una franja oscura abajo de
una pantalla con otra franja oscura al costado. El claro se despega de las dos cosas, y de
cualquier color que tenga la app — que además cambia de un cliente a otro.

### Los tiempos

Cada parada tiene su `espera` en el guion. Para probar un ritmo **sin editar doce números
a mano**, hay una variable que se los pone a todas:

```powershell
$env:DEMO_ESPERA=8000
npm run grabar
```

Se graba, se mira, y si quedó corto se cambia ese número y se vuelve a grabar. Cuando el
ritmo está, los valores se escriben en el guion y se deja de usar la variable. Para volver
a los tiempos del guion, `$env:DEMO_ESPERA=""`.

`npm run revisar` también la toma, así que la duración que anuncia es la que va a durar el
video de verdad.

Los dos tiempos que no son por parada están en `grabar-demo.mjs`: `LEER` (cuánto queda un
cartel antes de que empiece el movimiento) y `RESPIRAR` (la pausa después de cada acción).

---

## Si algo sale mal

| Lo que dice | Qué pasa | Qué hacer |
|---|---|---|
| `Solo se graba contra localhost` | `DEMO_URL` apunta a una dirección publicada | Es la protección funcionando. Grabar contra la aplicación local. |
| `Faltan DEMO_USUARIO y DEMO_CLAVE` | No se pasaron los datos para entrar | Ponerlos adelante del comando, como en el paso 3. |
| `Please run: npx playwright install` | Falta bajar el navegador | Correr ese comando dentro de `demo/`. |
| `ERR_CONNECTION_REFUSED` | La aplicación no está levantada | Revisar la otra ventana: tiene que estar `npm run dev` andando. |
| `⚠️ 3 parada(s) se saltearon` | Alguna pantalla cambió de dirección | El video igual se generó, sin esas partes. Corregir la `ruta` en `RECORRIDO`. |
| `Video rendering requires ffmpeg` | Falta un complemento de la grabación | `npx playwright install ffmpeg` dentro de `demo/`. |

---

## Detalles para quien tenga que mantener esto

- **La versión de Playwright va clavada** en `package.json`, sin `^`. Cada versión trae su
  propio navegador y su propio ffmpeg: con un rango, un `npm install` de mañana puede traer
  una versión que pide un navegador que no está bajado, y la grabación falla con un mensaje
  que no se parece en nada a la causa.
- **El cartel se dibuja adentro de la página**, no por fuera: la grabación captura lo que
  muestra el navegador, así que un cartel puesto por fuera no saldría.
- Sus clases llevan prefijo propio (`demo-titulo`, `demo-texto`) y se resetean a mano. No es
  manía: una clase `.t` chocó con una clase `.t` de la aplicación y el título salió pintado
  como un rectángulo blanco durante una grabación entera.
- **Esta carpeta está aparte del proyecto a propósito.** Playwright pesa cientos de megas y
  no tiene por qué instalarse en cada despliegue de Netlify.
- `DEMO_HEADLESS=1` graba sin abrir ventana. Sirve para probar la máquina en un servidor sin
  pantalla; para el video que se muestra conviene con ventana.
- `DEMO_CHROMIUM=/ruta/al/chrome` usa un navegador ya instalado en vez de bajar otro.
