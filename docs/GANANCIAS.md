# Ganancias — cómo se calcula, en pesos y en dólares

Documentación del módulo de Ganancias (`/dashboard/ganancias`). El mismo contenido, en
versión resumida, está visible en la pantalla dentro de **"¿Cómo se calcula este número?"**.

Archivos: `src/app/dashboard/ganancias/page.tsx` (agregación) y
`src/components/ganancias/GananciasView.tsx` (fórmula y presentación).

---

## Idea central: la ganancia es del período, no de la transacción

**Una transacción aislada no tiene ganancia.** Si comprás US$ 1.000 a $ 1.000, tu
ganancia es cero hasta que los vendas: lo único que hiciste fue cambiar pesos por
dólares. La ganancia aparece cuando ese stock se vende a un precio mayor.

Por eso el cálculo se hace sobre el **calce** entre lo comprado y lo vendido en el
período elegido, con tasas promedio, y no operación por operación.

> Consecuencia práctica: **la suma de las ganancias diarias no da la ganancia del mes.**
> Una compra del lunes puede calzar contra una venta del viernes. Al cambiar el período
> cambian las tasas promedio y por lo tanto el resultado.

---

## Paso 1 — Qué operaciones entran

El servidor trae de `movimientos_caja` las filas del período con operación **COMPRA**,
**VENTA** o **GASTOS**, y usa las **columnas de impacto ya calculadas** (`pesos`,
`dolares`, `euros`, `reales`, `usdt` y sus equivalentes `cc_*`). No recalcula importes.

Para cada fila mira dos patas a la vez —la de la moneda y la de pesos— y clasifica por
los signos:

| Operación | Volumen | Pesos | Interpretación |
|---|---|---|---|
| COMPRA | > 0 | < 0 | entró moneda, salieron pesos |
| VENTA | < 0 | > 0 | salió moneda, entraron pesos |

Acumula cuatro cantidades por par de monedas, separando la pata de caja de la de cuenta
corriente:

| Símbolo | Qué es |
|---|---|
| `vC` | volumen comprado |
| `aC` | pesos pagados por esas compras |
| `vV` | volumen vendido |
| `aV` | pesos recibidos por esas ventas |

Cada par (dólares, euros, reales, USDT, cheques) se acumula por separado y **nunca se
mezclan**: se elige uno en la configuración y ese es el resultado.

### Qué queda afuera: los canjes moneda contra moneda

La condición es que la fila tenga **volumen y pesos** en la misma pata. Una operación
que cambia una moneda por otra sin pasar por pesos —comprar dólares pagando con euros,
cambiar cheques por dólares— tiene la columna `pesos` en cero, así que **no entra en el
cálculo de ningún par**.

No es un olvido: la fórmula mide el margen *contra pesos* (`t2 − t1` está expresado en
pesos por unidad). En un canje no hay tasa en pesos que comparar, y forzar una la
inventaría. Es la misma limitación que tiene la solapa COLO de la planilla, que este
módulo replica. La contracara es que esas operaciones tampoco mueven el **stock** que ve
la pantalla (`stock = |vC − vV|`), porque el stock se deriva de las mismas cantidades
acumuladas.

Medición sobre un mes real de producción, para dimensionar el efecto:

| Moneda | Volumen que entra | Volumen excluido | % excluido |
|---|---:|---:|---:|
| Dólares | 4.844.586,25 | 75.373,53 | 1,5 % |
| Euros | 24.060,00 | 59.820,00 | 71,3 % |
| Reales | 2.340,00 | 15.315,00 | 86,7 % |

En dólares —que concentran más del 98 % del margen calzado— la exclusión es marginal y
el resultado de la pantalla es representativo. En euros y reales la mayor parte del
movimiento son canjes, así que **esos paneles muestran solo la porción operada contra
pesos**; los importes involucrados son chicos frente a los dólares, pero conviene tenerlo
presente antes de leer el panel de euros como "la ganancia en euros del mes".

### La cuenta corriente: por qué hoy no incide, y qué pasaría si incidiera

Los movimientos de cuenta corriente **no generan resultado** y no entran: el filtro por
operación (COMPRA / VENTA / GASTOS) ya deja afuera INGRESAN, EGRESAN, SWITCH y TT. Al
11/8/2026 la operatoria de cta cte es exclusivamente INGRESAN/EGRESAN, así que el módulo
está midiendo todo lo que hay que medir.

> **Corrección del 1/9/2026.** El párrafo de arriba se quedó corto en un punto: hablaba de
> las OPERACIONES llamadas TT (`ENTRA TT` / `SALE TT`), no del marcador `op = 'T'`, que son
> cosas distintas. Las transferencias del negocio se marcan con `op = 'T'` y su operación es
> INGRESAN o EGRESAN, así que quedaban afuera del cálculo — y su ganancia no se medía en
> ningún lado. Ver la sección siguiente.

## Transferencias (`op = 'T'`)

**La ganancia de una transferencia es lo que ENTRA menos lo que SALE de cada par de
movimientos** (criterio confirmado por el cliente el 1/9/2026).

No pasa por el calce de compras y ventas, y no es una omisión: **no tienen pata en pesos**.
Al 1/9/2026 las 1.683 filas con `op = 'T'` tienen `pesos = 0` y todo el movimiento en
dólares. Sin pata en pesos no hay tasa de compra ni de venta, y sin tasas no hay spread que
calcular. Aunque se les sacara el filtro de operación, la agregación las ignoraría igual:
exige que volumen e importe en pesos estén en la misma pata.

Cómo se calcula:

1. Se agrupan las filas con `op = 'T'` por **NOTAS**, que es donde el cliente anota los
   participantes. Un grupo está **CERRADO** cuando tiene sus dos puntas: al menos un
   INGRESAN y al menos un EGRESAN. Solo los grupos cerrados entran al resultado.
2. Se suman las **columnas de caja** de las filas cerradas del período. Ya traen el signo
   puesto —INGRESAN suma, EGRESAN resta—, así que la suma **es** la diferencia.
3. Ese neto nace en la moneda de la operación. Para sumarlo al total en pesos se convierte
   con la **cotización implícita del par en el período**, la misma que usa el panel de
   dólares. Las transferencias que ya son en pesos entran directo, sin convertir.
4. Si en el período no hubo compras ni ventas del par, no hay cotización: el resultado **no
   se suma** y la pantalla lo avisa en un cartel, en vez de sumar cero como si nada.

### Transferencias con una sola punta (1/9/2026)

Hay grupos con el ingreso cargado y sin el egreso, o al revés. Eso **no es ganancia**: es
plata que entró y todavía no se entregó. Contarla como resultado sería dar por ganado algo
que puede no volver nunca; esconderla sería peor, porque es plata real inmovilizada.

Se resolvió mostrándola aparte, como **posición abierta**: un panel propio, acumulado hasta
el cierre del período (no del período: es un saldo, no un flujo) y rotulado como posición.
Entra al resultado apenas se carga la punta que falta.

**Por qué no se imputa todo al movimiento que cierra el grupo.** Los grupos se REPITEN:
"JOACO SIZOKO" no es una transferencia, es una contraparte que aparece decenas de veces —
1.683 movimientos en pocas decenas de grupos. Llevar la ganancia de toda esa historia a la
fecha del último movimiento inventaría un pico enorme en un día y vaciaría todos los meses
anteriores. Por eso **cada movimiento cuenta en SU fecha**; lo único que decide el grupo es
si cuenta o no.

Para saber si un grupo está cerrado hay que mirar su historia completa, no solo el período:
una punta puede haberse cargado meses antes. Por eso la consulta de transferencias trae
todo hasta el fin del período (`lte('fecha', fin)`), no solo el rango.

Dos decisiones que conviene tener presentes:

- **Se suma la pata de CAJA, no la de cuenta corriente.** En una fila de cta cte las dos son
  la misma plata con signo opuesto; sumar ambas daría siempre cero.
- **La consulta principal excluye `op = 'T'`.** Hoy ninguna transferencia tiene operación
  COMPRA o VENTA, así que no cambia ningún número; es una guarda para que, si alguna vez se
  marcara una compra con T, no se cuente en los dos lados.

Se puede desactivar desde ⚙ Configuración, igual que los gastos.

Queda anotado, para cuando eso cambie, que **una COMPRA o VENTA con `tipo = 'CTA CTE'`
hoy quedaría afuera del cálculo**. El motor le da patas cruzadas —la moneda en la columna
de caja y la contrapartida en `cc_pesos`, o al revés— y la agregación exige que volumen y
pesos estén en la misma pata:

```
CTA CTE COMPRA dólares (propio DOLARES) →  DOLARES 1.000   CC PESOS -1.500.000
CTA CTE COMPRA dólares (propio PESOS)   →  PESOS 1.500.000   CC DOLARES -1.000
```

Ninguna de las dos formas coincide con los pares que busca la pantalla (`dolares`+`pesos`
o `cc_dolares`+`cc_pesos`). Como efecto colateral, los acumuladores `vCcc`/`vVcc` nunca
se llenan para COMPRA/VENTA y **el interruptor "incluir cuenta corriente" no modifica el
resultado**. Lo mismo aplica a `d.gcc`: GASTOS siempre va a `PESOS`, nunca a `cc_pesos`.

Antes de habilitar compras o ventas en cuenta corriente —el caso más probable es el
descuento de documentos contra la cuenta del cliente— hay que corregir la agregación para
reconocer las patas cruzadas.

Lo mismo vale para los pares **cheques** y **USDT**: al 10/8/2026 no existe en toda la
base ni una sola COMPRA o VENTA con esas monedas, así que ambos paneles están sin
contrastar contra datos reales.

---

## Paso 2 — La fórmula, en pesos

```
t1      = aC / vC        tasa promedio de COMPRA, ponderada por volumen
t2      = aV / vV        tasa promedio de VENTA, ponderada por volumen
spread  = t2 - t1

calzado = min(vC, vV)    volumen que se compró Y se vendió
stock   = |vC - vV|      volumen que quedó sin calzar

ganancia = calzado x spread  +  valuación del stock  +  gastos
```

### Valuación del stock

Lo comprado que todavía no se vendió no generó ganancia realizada, pero se le asigna un
valor. Tres criterios, configurables en el drawer:

| Criterio | Cálculo | Cuándo |
|---|---|---|
| **Margen fijo** (estándar) | `stock x 0,050` | Es el supuesto por defecto del negocio |
| **Al costo** | `0` | Postura conservadora: sin ganancia hasta vender |
| **A precio de cierre** | `stock x (cierre - t1)` si sobran compras; `stock x (t2 - cierre)` si sobran ventas | Valuación a mercado |

Los supuestos **son propios de cada par** (`SUPUESTOS_PAR` en `GananciasView.tsx`) y se
reponen al cambiar de moneda: arrastrar los de la anterior daría un número sin sentido.

#### Cheques: valuación a valor nominal

El cliente reconoce la ganancia del descuento de documentos **en el momento del
descuento** (definido 11/8/2026), no cuando el cheque se cobra. Ese criterio se obtiene
valuando la cartera a **valor nominal**: es el criterio "a precio de cierre" con
`cierre = 1,00`, un peso por cada peso de valor nominal.

Verificado sobre el caso de un cheque de 1.000.000 tomado a 0,95:

| Escenario | Margen fijo 0,050 | Cierre 1.500 (default divisas) | **Nominal 1,00** |
|---|---:|---:|---:|
| Descuento y cobro en el mismo período | 50.000 | 50.000 | **50.000** |
| Período del descuento, sin cobrar aún | 50.000 | 1.499.050.000 | **50.000** |
| Período del cobro, descontado antes | 50.000 | −1.499.000.000 | **0** |
| Descuento sin cobro nunca registrado | 50.000 | 1.499.050.000 | **50.000** |

Solo el criterio nominal da bien las cuatro filas: reconoce los 50.000 en el período del
descuento y deja el período del cobro en cero, sin duplicar. El margen fijo acierta acá
únicamente por coincidencia —0,050 por peso nominal *es* un descuento del 5 %—; con un
descuento del 3 % seguiría informando 50.000 cuando la ganancia real es 30.000. Y heredar
el default de divisas produciría cifras absurdas, de ahí que los supuestos sean por par.

### Gastos

Solo existen en **pesos** (regla del dominio) y entran con su signo, restando. Se pueden
excluir desde la configuración para ver la ganancia bruta.

Dos precisiones al leerlos:

- **No están prorrateados entre monedas.** Se restan enteros en el par que se esté
  mirando. En dólares el efecto es despreciable frente al margen; en euros o reales los
  gastos del período pueden superar el margen y dar negativo. No es un error de cálculo
  —los gastos son en pesos y no pertenecen a ninguna moneda— pero condiciona la lectura
  de los paneles chicos.
- La rama `d.gcc` (gastos de cuenta corriente) **siempre suma cero**: el motor manda
  GASTOS a `PESOS` incluso con `tipo = 'CTA CTE'`, y en ese caso además devuelve
  `cuenta = null` porque la planilla no contempla la combinación.

### Costo %

El campo **no lo lee esta pantalla**, y sin embargo **está incluido en el resultado**. El
motor lo aplica sobre la pata en pesos al calcular el movimiento (`factor = 1 + costo x
signo de la pata externa`), así que la columna `pesos` que Ganancias suma ya lo tiene
incorporado:

```
COMPRA 1.000 dólares a 1.500, costo 0 %  →  DOLARES  1.000   PESOS -1.500.000
COMPRA 1.000 dólares a 1.500, costo 1 %  →  DOLARES  1.000   PESOS -1.485.000
VENTA  1.000 dólares a 1.500, costo 1 %  →  DOLARES -1.000   PESOS  1.515.000
```

Funciona como una comisión sobre la cotización: comprando se pagan menos pesos, vendiendo
se cobran más — un costo positivo siempre juega a favor de la casa. La consecuencia para
la lectura de la pantalla es que `t1` y `t2` son **tasas efectivas con comisión incluida**,
no la cotización de pizarra.

En cheques rige igual, y eso vuelve equivalentes dos formas de cargar un descuento de
documentos:

```
COMPRA 1.000.000 en cheques, cot 0,95, costo —    →  PESOS -950.000   CHEQUES 1.000.000
COMPRA 1.000.000 en cheques, cot 1,00, costo 5 %  →  PESOS -950.000   CHEQUES 1.000.000
```

La ganancia informada es idéntica en los dos casos, porque ambas dejan la misma columna
`pesos`. La diferencia es solo de registro: la primera guarda el precio efectivo, la
segunda deja la tasa de descuento como dato separado y auditable.

### Ejemplo

Compraste US$ 10.000 a $ 1.000 y US$ 5.000 a $ 1.020. Vendiste US$ 12.000 a $ 1.060.

```
t1      = (10.000 x 1.000 + 5.000 x 1.020) / 15.000 = $ 1.006,67
t2      = $ 1.060
spread  = $ 53,33

calzado = min(15.000, 12.000) = US$ 12.000  ->  12.000 x 53,33 = $ 640.000
stock   = US$ 3.000 x 0,050                 ->  $ 150

ganancia = $ 640.150 (antes de gastos)
```

---

## Paso 3 — El mismo resultado, en dólares

El panel de dólares **no es un cálculo distinto**: es el mismo número convertido.

```
ganancia en dólares = ganancia en pesos / cotización del período
```

### Qué cotización se usa y por qué

Es el **promedio ponderado por volumen de todas las operaciones en dólares del propio
período** — compras y ventas, caja y cuenta corriente:

```
cotización = (aC + aCcc + aV + aVcc) / (vC + vCcc + vV + vVcc)     [del par dólares]
```

Tres decisiones de diseño detrás de esto:

1. **Sale de las operaciones reales, no de una cotización externa ni de la del día de
   hoy.** El divisor lo construyen las propias transacciones del período, ponderadas por
   su volumen: una operación de US$ 50.000 pesa más que una de US$ 500.

2. **Se toma siempre del par dólares, sin importar el par elegido.** Si el usuario está
   mirando euros y se usara la cotización del euro, el resultado serían *euros rotulados
   como dólares*. Por eso la cotización se deriva siempre de las operaciones en dólares,
   aunque el resultado que se está midiendo sea de otro par.

3. **Consistencia garantizada.** No es un cálculo independiente: es el mismo importe
   dividido por la cotización, así que los dos paneles nunca pueden contradecirse. La
   cotización usada se muestra en pantalla para que el número sea verificable.

   > Los tres valores se presentan **redondeados**, de modo que rehacer la multiplicación
   > a mano puede dar una diferencia de unos pesos. No es un error de cálculo: internamente
   > se opera con la precisión completa.

### Cuándo no se puede mostrar

Si en el período **no hubo ninguna operación en dólares**, no hay de dónde derivar la
cotización y el panel muestra `—` con la explicación. No se inventa un valor ni se cae a
una cotización externa.

---

## Alternativas evaluadas y descartadas

**Ganancia por transacción (FIFO o costo promedio móvil).** Sería necesario asignarle a
cada venta un costo de adquisición por lotes. Se descartó porque es un modelo de cálculo
distinto del que el negocio viene usando: cambiaría el resultado y requeriría revalidarlo
con el cliente. Queda como mejora futura si alguna vez se necesita rentabilidad por
operación o por cliente.

**Conversión día por día.** Prorratear el resultado del período entre los días y
convertir cada parte a la cotización de ese día. Es más fiel económicamente en períodos
largos con devaluación —mil pesos ganados en enero valen más dólares que en diciembre—,
pero agrega un supuesto de prorrateo y la diferencia solo es relevante en el período
*Año*. Se optó por la conversión única, que es exacta y explicable en una línea.

---

## Configuración disponible en pantalla

| Parámetro | Qué modifica | Valor estándar |
|---|---|---|
| Operaciones | Qué movimientos entran al cálculo | COMPRA + VENTA + GASTOS |
| Par de monedas | Sobre qué moneda se mide la ganancia | Dólares |
| Cuenta corriente | Si lo operado por cta cte suma al volumen | Incluida |
| Stock residual | Cómo se valúa lo comprado sin vender | Margen fijo 0,050 |
| Gastos | Si el número grande resta los gastos | Sí |

Con los valores estándar la pantalla muestra el sello **"✓ Cálculo con los supuestos
estándar"**. Al tocar cualquier parámetro pasa a **"Cálculo con configuración
modificada"**, para que nunca se confunda un resultado exploratorio con el oficial.
