# Material de venta

El folleto del sistema, en dos versiones: **con precios** y **sin precios**.

| | |
|---|---|
| `brochure.html` | el folleto. Es lo único que se edita |
| `captura-inicio.webp` | la captura de la pantalla de Inicio que aparece arriba |
| `a-pdf.mjs` | saca las dos versiones en PDF |

## Cambiar un precio o un texto

Se edita `brochure.html` con cualquier editor de texto y se vuelven a sacar los PDF:

```powershell
cd marketing
node a-pdf.mjs
```

Quedan `Sistema-para-casas-de-cambio.pdf` y `Sistema-para-casas-de-cambio-sin-precios.pdf`,
de dos hojas A4 cada uno, listos para mandar por WhatsApp.

> La primera vez hace falta Playwright, que es lo que dibuja el PDF. No se instala acá: ya
> está en `demo/`. Si avisa que no lo encuentra, `cd ../demo && npm install`.

## Las dos versiones salen del MISMO archivo

El programa genera la versión sin precios sacándole esa sección al original. No son dos
folletos: mantener dos copias del mismo texto termina siempre igual — se corrige una frase
en una, la otra sigue diciendo lo viejo, y nadie se entera hasta que las dos están en manos
de dos personas distintas.

## Actualizar la captura

Cuando cambie la pantalla de Inicio:

```powershell
cd ..\demo
npm run captura
copy salida\inicio.png ..\marketing\
```

La captura se saca contra la base de DEMOSTRACIÓN, nunca contra la de un cliente: una
imagen con nombres y saldos verdaderos en un folleto es un problema del que no se vuelve.
Hay que recortarla dejando las tarjetas de saldos y algunas filas del listado, y cortar
entre dos filas para que no quede una fila a la mitad.

## El reparto en hojas

Está ajustado para que **cada versión entre en dos hojas con la última bien llena**. Es más
frágil de lo que parece: las cajas no se parten entre hojas, así que un párrafo de más
puede empujar una sección entera a una hoja nueva y dejar media hoja en blanco.

Si se agrega o se saca texto, hay que mirar el PDF y, si hace falta, retocar los tamaños en
el bloque de ESTILOS DE IMPRESIÓN de `a-pdf.mjs`. Ahí está explicado qué hace cada cosa y
por qué, incluidas dos trampas que costaron encontrar: por qué el título de una sección no
lleva `break-after: avoid` y por qué la versión sin precios necesita su propio aire.

## El folleto también es una página web

`brochure.html` está escrito en el formato de los artefactos de Claude, o sea **sin** las
etiquetas `<html>`, `<head>` ni `<body>` — se las agrega `a-pdf.mjs` para el PDF. Eso
permite publicarlo tal cual como página, que es lo que conviene cuando se lo quiere mandar
por link en vez de como archivo.

