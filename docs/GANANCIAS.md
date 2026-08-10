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

**Pendiente de verificar: la pata de cuenta corriente.** Por código, la cta cte se
acumula por separado (`vCcc`/`vVcc`) y se suma cuando la configuración lo pide. Pero una
fila de CTA CTE con operación COMPRA/VENTA impacta `dolares` contra `cc_pesos` —patas
cruzadas— y la agregación exige que ambas estén en la misma pata, así que quedaría
afuera. El mes medido **no tuvo ninguna operación de cta cte**, por lo que el caso no
pudo comprobarse contra datos reales. Antes de dar el módulo por validado hay que repetir
la medición sobre un período que sí tenga compras o ventas en cuenta corriente.

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

### Gastos

Solo existen en **pesos** (regla del dominio) y entran con su signo, restando. Se pueden
excluir desde la configuración para ver la ganancia bruta.

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
