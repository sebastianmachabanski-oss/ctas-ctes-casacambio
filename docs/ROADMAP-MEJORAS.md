# Roadmap de mejoras — módulos ofrecibles por separado

Listado de mejoras posteriores al alcance original (digitalizar, modernizar y securizar
la operatoria del Excel, cerrado al 29/7/2026). Cada ítem está pensado como **módulo
autónomo, cotizable y vendible por separado**, con foco en valor de negocio, no en deuda
técnica.

**Convención de esfuerzo:** horas-desarrollador de presupuesto, misma base que
`docs/PLAN-VS-REAL.md` (el tiempo activo real históricamente fue muy inferior).

---

## Punto de partida: qué NO tiene la app hoy

Relevado sobre el código al 29/7/2026, para no vender lo ya construido:

- **Sin exportación**: ninguna pantalla permite bajar a Excel/CSV/PDF.
- **Sin trazabilidad de quién hizo qué**: `movimientos_caja` no guarda usuario que carga,
  edita o borra (solo `synced_at`). La tabla vieja `diario` sí tenía `creado_por`.
- **Sin comprobante de operación**: no hay ticket ni constancia para el cliente final.
- **Portal del cliente mínimo**: el rol `cliente` existe y ve su cuenta corriente y
  cambia su contraseña. Nada más.
- **Sin arqueo/cierre de caja**: la app muestra el saldo teórico, nunca se contrasta
  contra el efectivo contado.
- **Clientes sin normalizar**: `cliente` es texto libre (decisión de negocio vigente),
  lo que impide analítica por cliente.
- **Cotización sin pizarra propia**: hay banda de mercado de referencia, pero el
  operador tipea la cotización a mano en cada operación.

---

## 1. Control interno y confianza (el eje "securizar" llevado al día a día)

### 1.1. Auditoría y trazabilidad completa — **6 a 8 h**
Registrar quién carga, edita y borra cada operación, cuándo, y **qué cambió**
(valor anterior → valor nuevo). Pantalla de auditoría filtrable por usuario, fecha y
operación.

> **Gancho comercial:** hoy, si un número aparece cambiado, no hay forma de saber quién
> lo tocó. Con varios operadores sobre la misma caja, esto es control interno básico y
> es lo primero que pregunta cualquier contador o auditor.

### 1.2. Cierre de caja diario / arqueo — **8 a 10 h**
Al cerrar el día, el operador declara el efectivo **físico contado** por moneda; el
sistema lo compara contra el saldo teórico (que ya calcula) y registra la diferencia,
con historial de cierres y quién los firmó.

> **Gancho comercial:** convierte la app de "registro" en **control**. Un faltante se
> detecta el mismo día y con responsable identificado, en vez de aparecer a fin de mes
> sin poder reconstruir qué pasó. Probablemente el módulo de mayor impacto real.

### 1.3. Alertas de posición y stock mínimo — **4 a 6 h**
Avisar cuando el stock de una moneda baja de un mínimo configurable (ej. quedan menos de
USD 10.000) o cuando hay exceso ocioso sin colocar.

> **Gancho comercial:** evita quedarse sin billete para una operación grande y evita
> capital dormido. Se apoya en el umbral configurable que ya existe.

### 1.4. Backup automático a Drive + restauración probada — **3 a 4 h**
Automatizar el `pg_dump` que hoy es manual, subirlo a una carpeta de Drive del negocio
con la cuenta de servicio existente, y dejar una restauración de prueba documentada.

> **Gancho comercial:** se vende como *plan de continuidad*. Barato de hacer, muy
> tranquilizador para el dueño.

---

## 2. Cara al cliente final (lo que el cliente de la casa de cambio percibe)

### 2.1. Comprobante de operación — **5 a 7 h**
Generar una constancia (PDF/imagen) con el detalle de la operación —fecha, monedas,
monto, cotización aplicada, saldo resultante— lista para enviar por WhatsApp o imprimir.

> **Gancho comercial:** el salto de imagen más grande por menos plata. Pasa de "te lo
> anoto" a entregar un comprobante profesional con la marca del negocio.

### 2.2. Extracto de cuenta corriente enviable — **6 a 8 h**
Extracto en PDF por cuenta y período, con saldo de apertura, movimientos y cierre.
Descargable y enviable por email; opcionalmente automático a fin de mes.

> **Gancho comercial:** elimina el ida y vuelta telefónico de "pasame cómo estoy".
> Además, un extracto formal reduce discusiones sobre saldos.

### 2.3. Portal del cliente ampliado — **10 a 14 h**
Extender el acceso `cliente` actual: descarga de extractos, cotizaciones del día,
**confirmación de saldo** (el cliente valida su saldo y queda registrado) y
solicitud de operación ("quiero comprar USD 5.000") que le llega al operador.

> **Gancho comercial:** diferencial competitivo fuerte. Muy pocas casas de cambio de
> este porte le dan acceso digital al cliente; fideliza y descarga trabajo del mostrador.

### 2.4. Pizarra de cotizaciones propia — **6 a 8 h**
El negocio define su compra/venta del día por moneda (con spread sobre la referencia de
mercado). La app la usa como **valor por defecto** al cargar operaciones y permite
publicarla o enviarla a clientes.

> **Gancho comercial:** doble beneficio — comercial (comunicar precios) y de control
> (menos errores de tipeo en la cotización; recordar los EUR/USD cargados como 1 que
> hubo que corregir a mano en la reconciliación).

---

## 3. Dinero en la calle y logística

### 3.1. Circuito completo de entregas — **10 a 12 h**
Extender "Dinero en calle" (hoy vista + marcar ingreso) a un circuito con estados:
pendiente → en camino → entregado/rechazado, con sello de tiempo, quién confirmó y
comprobante de entrega.

> **Gancho comercial:** es **plata real en la calle**. Saber en tiempo real cuánto tiene
> cada repartidor y desde cuándo reduce pérdidas y discusiones.

### 3.2. Vista móvil del repartidor — **6 a 8 h**
Acceso restringido en el celular: el repartidor ve solo sus entregas y marca la entrega
en el momento (con hora y, opcionalmente, ubicación).

> **Gancho comercial:** cierra el circuito anterior sin llamadas telefónicas. Se vende
> junto con 3.1 como paquete "logística de efectivo".

---

## 4. Inteligencia de negocio (decisiones, no registro)

### 4.0. Ganancias: arreglar el cálculo antes de presentarlo — **24 a 34 h**
Tres arreglos del propio cálculo, antes que cualquier gráfico. No son presentación: hoy
el número que se muestra no es el del negocio. El tercero (4.0.c) es el más grande de
los tres y se descubrió último, el 20/11/2026.

> **Ya arreglado el 20/11/2026:** la consulta de la pantalla no pedía la columna
> `cc_usdt`. Como la pata se lee por nombre de columna, la ausencia no daba error:
> devolvía `undefined`, que termina en 0. Las compras y ventas de USDT por **cuenta
> corriente** —que existen desde el 25/8/2026— no entraban en el resultado y nada en
> pantalla lo decía.

**4.0.a · El total consolidado — 6 a 8 h.** Ganancias calcula **una moneda por vez**, y
viene en dólares por defecto. Las operaciones en euros, reales y USDT se registran y se
calculan, pero se ven cambiando el par en ⚙ Configuración, de a una. No hay ningún
número que sume todo, y **no se puede obtener sumando los pares a mano**: los gastos y
las transferencias en pesos se descuentan enteros en cada par, así que sumarlos los
contaría varias veces.

El arreglo es un total que sume el margen de cada moneda —cada uno ya nace en pesos— y
cuente **una sola vez** los gastos y las transferencias en pesos, con el desglose por
moneda a la vista. El selector de par se queda, para mirar una sola cuando interesa.
Incluye validar que cada moneda por separado siga dando exactamente lo que da hoy, que
es la forma de comprobar que no se rompió un cálculo validado contra la planilla.

Hay una maqueta de cómo quedaría expuesto, armada el 20/11/2026 para mostrársela al
cliente, con las columnas Volumen operado · Volumen calzado · Spread por unidad ·
Valuación del stock · Aporta, y abajo los gastos y transferencias contados una vez.

**4.0.b · La cotización de cierre, automática — 4 a 6 h.** Cuando el stock se valúa con
el criterio "cotización de cierre", esa cotización **se tipea a mano** y arranca en
`1500`, escrito en el código. Con el blue en 1.640 eso valúa el stock un 9% abajo del
mercado, y nada en la pantalla avisa que el número quedó viejo. Peor: un valor tipeado
**no sigue al período** — cargado pensando en noviembre, octubre se valúa con la
cotización de hoy.

Pasa a salir de `cotizaciones_mercado`: la del **último día del período que se está
mirando**, de la fuente que el cliente confía, mostrando en pantalla cuál se usó y de
cuándo. El campo manual se conserva para cuando quieran otro criterio, pero indicando
cuál de los dos está en uso. Para períodos anteriores al 19/11/2026 la historia sale de
monitorargy, que publica el blue diario desde 2011.

La referencia quedó definida: **blue**, para todas las monedas, USDT incluido.

> **Falta una definición del cliente:** con qué cotización valuar lo que tiene en el
> cajón — la **compra** del mercado, la **venta** o el promedio. Las dos ramas de la
> fórmula son consistentes entre sí, así que la elección no cambia cuánto se gana en
> total: cambia **en qué período se reconoce**. Con *venta* el margen aparece cuando
> compra; con *compra*, cuando vende. Para un negocio que rota el stock en días,
> **venta es la opción a recomendar** y hace el resultado menos dependiente de qué día
> cae el corte; en contra, anota margen sobre mercadería no vendida.

> **Al implementarlo, cuidado con el valor de arrastre (20/11/2026).** La cotización
> de cierre es el valor al que el stock **entra y sale** del cálculo: una rama hace
> `stock × (cierre − t1)` y la otra `stock × (t2 − cierre)`. Tiene que ser **la misma
> de los dos lados**. Hoy lo es de casualidad, porque es un único número tipeado.
> Automatizarla por período lo rompe: si noviembre guarda el stock a 1.643 y diciembre
> lo saca medido contra 1.700, aparecen 57 pesos por dólar que nadie ganó. La rama de
> salida tiene que usar la cotización del período **anterior**.

> **Lo que no cambia:** automatizar la cotización la vuelve reproducible, no la vuelve
> un hecho. La valuación del stock sigue siendo el único número de la pantalla sin una
> operación detrás. Medido sobre producción el 20/11/2026, además, pesa poco donde más
> volumen hay: en dólares el criterio mueve el resultado un 2 %, porque el "stock" de
> cada mes es casi todo corte de calendario (los desbalances mensuales suman 1.388.939
> dólares, 36 veces el desbalance real de los trece meses, que es de 38.049). En euros
> —volumen chico y grumoso— mueve un 32 %.

> **El margen fijo no significa lo que dice la pantalla.** El texto afirma que con
> *margen fijo* "se asume que cada unidad va a dejar ese margen cuando se venda", pero
> el valor es `0,05` y el margen real es de **$ 17,24 por dólar** y **$ 87,26 por euro**
> (promedios ponderados de trece meses): 403 y 1.745 veces más. No está documentado de
> dónde salió el 0,05. Hay que redactar el texto por lo que el número hace —valuar el
> stock en casi cero— o cambiar el número; lo que no puede quedar es la contradicción.

**4.0.c · Las operaciones moneda contra moneda — 14 a 20 h.** El hallazgo más grande, y
el que explica el reclamo del cliente de que "euros y reales no se toman en cuenta".
Tenía razón, y la causa no era la que se suponía.

Ganancias mide el margen de una moneda **siempre contra pesos**: toma la tasa promedio
de compra, la de venta, y la diferencia es la ganancia. Una fila entra al cálculo solo
si tiene volumen de esa moneda **y** contrapartida en pesos. Pero el cliente opera sus
otras monedas **contra dólares**, no contra pesos, y esas filas no tienen pata en pesos:
no hay tasa de la que sacar un spread, así que **no existen** para el cálculo.

Medido sobre producción el 20/11/2026, ventana 1/11/2025 → 20/11/2026:

| | Comprados | contra dólares | contra pesos | ve Ganancias |
|---|---|---|---|---|
| Euros | 654.295 | 507.214 | 147.081 | **22 %** |
| Reales | 140.258 | 137.718 | 2.540 | **2 %** |

| | Vendidos | contra dólares | contra pesos | ve Ganancias |
|---|---|---|---|---|
| Euros | 639.390 | 467.480 | 171.910 | **27 %** |
| Reales | 129.992 | 88.075 | 41.917 | **32 %** |

El libro euro-dólar es **tres veces y media** más grande que el euro-peso. Compró euros
a US$ 1,1872 y los vendió a US$ 1,1982: 0,93 % de margen sobre 467.480 euros calzados,
unos **US$ 5.166** (≈ $ 7,4 millones al dólar a 1.440). La pantalla informa $ 8,7
millones de euros, así que el negocio real sería **casi el doble**.

En reales la proporción es peor. Compró 137.718 a 5,12 reales por dólar y vendió 88.075
a 4,96: unos **US$ 546**. La pantalla informa **$ 41.000**; el real está entre
$ 910.000 y $ 1.630.000 según a qué dólar se valúe la pata en dólares — **20 a 37 veces
más**.

Sumando las dos monedas quedan afuera unos **US$ 5.712 ≈ $ 8,2 millones**, que sobre
los $ 550 millones que informa el sistema es **1,5 %**. Parece poco porque el negocio de
dólares contra pesos es enorme y domina el total, pero hay **US$ 1.206.946 de volumen
que no aparece en ninguna pantalla**.

> **Los dos márgenes de arriba tienen un asterisco.** Están medidos sobre los trece
> meses enteros, así que mezclan margen de operación con la deriva del euro contra el
> dólar en ese período. Para un número defendible hay que calcular el libro
> moneda-dólar **mes por mes**, como hace la pantalla con el de pesos: son 2 o 3 h de
> análisis y conviene hacerlas **antes** de llevarle cifras al cliente.

> **No es un error de código.** El motor está diseñado para medir moneda contra pesos y
> lo hace bien. Contar las operaciones moneda contra moneda es una decisión del cliente
> y un desarrollo de verdad: hay que leer la columna `externo`, armar el libro de cada
> par, calcular el margen en la moneda de la contrapartida y recién ahí pasarlo a pesos
> con la cotización del período, sin contar dos veces la pata en dólares, que también
> es volumen propio.

> **Lo que NO hay que tocar:** las filas `INGRESAN` / `EGRESAN` sin contrapartida
> (14.950 y 24.330 euros, 7.000 y 2.233 reales) son entregas y retiros de cuenta
> corriente, no operaciones de cambio. No tienen margen y no deben entrar al cálculo.
> Y `op = 'C'` es "operación común", no transferencia: no hay que filtrarlo.

Las consultas para reproducir todo esto están en `scripts/reales-de-donde-salen.sql`
(la consulta 3 sirve para cualquier moneda cambiando el nombre de la columna) y en
`scripts/comparar-valuacion-stock.sql`. Las dos solo leen.

### 4.1. Rentabilidad por cliente y por moneda — **6 a 8 h**
Hoy Ganancias es un total global. Este módulo abre el margen por cliente, por moneda y
por tipo de operación, con ranking de los que más y menos aportan.

> **Gancho comercial:** responde la pregunta que ningún Excel contestaba: *¿qué clientes
> me dejan plata y cuáles me dan trabajo gratis?* Base para negociar spreads.

### 4.2. Análisis de spread por operación y operador — **6 a 8 h**
Comparar la cotización aplicada contra la de mercado en ese momento, y detectar
operaciones cerradas fuera de rango, por operador.

> **Gancho comercial:** detecta plata que se escapa por precios mal cargados o
> concesiones no autorizadas. Se paga solo con una operación grande detectada.

### 4.3. Estacionalidad y proyección de demanda — **5 a 7 h**
Qué días, semanas y horarios concentran demanda por moneda, para dotar la caja de
efectivo y organizar personal.

> **Gancho comercial:** menos capital inmovilizado y menos operaciones perdidas por no
> tener billete.

### 4.4. Paquete mensual para el contador — **4 a 6 h**
Exportación armada del período: libro de movimientos, resumen por moneda, cierre y
ganancias, en el formato que el contador ya usa.

> **Gancho comercial:** ahorra horas de armado manual todos los meses. Valor fácilmente
> cuantificable frente al costo del módulo.

### 4.5. Tablero de Ganancias: tendencia y composición — **13 a 18 h**
Una vez que el número sea el correcto (4.0), que la pantalla deje de ser un número con
su explicación y pase a ser algo que se mira todos los meses. Tres piezas:

- **Separar ganancia por spread de ganancia por tenencia — 4 a 6 h.** Los componentes ya
  se calculan; hoy viven escondidos en el desplegable "¿cómo se calcula?". Con el margen
  fijo de 0,05 que está puesto, la tenencia aporta centavos, así que esto no va a revelar
  nada escondido: hace explícito algo que está mezclado, y recién pesa de verdad si se
  pasa a valuar a cotización de cierre.
- **Evolución de la ganancia — 6 a 8 h.** Doce a veinticuatro meses, con el período
  elegido resaltado. Es el agujero más grande: hoy se ve un número sin contexto. Cuesta
  más de lo que parece porque la pantalla trae solo los días del período y hay que
  ampliar la consulta.
- **Comparación contra el período anterior — 3 a 4 h.** Y contra el mismo del año
  pasado, con la variación en porcentaje. Es lo primero que mira cualquiera.

Y la contracara: los **reportes de caja** que hoy cuelgan abajo de Ganancias —listado de
clientes, saldo en dólares, barras mensuales— no se usan y no son análisis de resultado
sino de posición. Salen de ahí. Son, eso sí, las únicas vistas de evolución que existen
hoy, así que conviene sacarlas recién cuando estén las nuevas.

> **Gancho comercial:** es lo que convierte "el sistema registra" en "el sistema me dice
> cómo viene el negocio". Se vende después de 4.0, nunca antes: un tablero lindo sobre un
> número que deja afuera dos monedas es peor que no tenerlo.

### 4.6. Valuar la posición de verdad, y devengar los cheques — **14 a 20 h**

Surgió el 24/11/2026 de una pregunta del cliente sobre el principio de prudencia. El
razonamiento contable completo está en `docs/GANANCIAS.md`; acá va el trabajo.

Son dos cosas, y la primera es más grave de lo que parece.

- **Valuar la posición acumulada, no el desbalance del período — 8 a 12 h.** Hoy el
  "stock" que se valúa es `|compras − ventas|` *del período*, que no es la tenencia de la
  casa: en un mes cualquiera es ruido de calendario. Medido sobre la base real, los
  desbalances mensuales suman **36,5 veces** el desbalance anual, porque se compensan
  entre sí. Hay que traer la posición al cierre —acumulada desde el principio— y valuar
  esa. Cuesta porque la pantalla hoy trae solo los días del período, igual que la
  evolución de 4.5, y conviene hacerlas juntas.
  Depende de tener una **cotización de cierre**: es la decisión de fuente de cotización
  que ya está pendiente del cliente.

- **Devengar la ganancia del cheque hasta su vencimiento — 6 a 8 h.** Hoy se reconoce
  entera el día del descuento. Es interés: descontar a 90 días es prestar plata 90 días,
  y reconocer todo en el primer mes infla ese mes y deja los otros dos en cero. El dato
  necesario ya existe (`cheques.fecha_pago`); falta repartir y que el período del cobro
  siga dando cero, sin duplicar.

No se tocó nada todavía: para la demo quedó el criterio actual (margen fijo en divisas,
valor nominal en cheques). Se confirma con el cliente antes de cambiarlo, porque mueve
el resultado informado de todos los períodos hacia atrás.

> **Gancho comercial:** es la conversación que convierte al sistema en el interlocutor
> del contador. Y la respuesta a la objeción más probable de un cliente con formación
> contable, que es exactamente de donde salió.

---

## 5. Calidad de datos y cumplimiento

### 5.1. Ficha de cliente unificada + deduplicación — **8 a 12 h**
Detectar y unificar variantes del mismo cliente ("JUAN PEREZ" / "Juan Perez" / "J
PEREZ"), con ficha única: contacto, histórico, volumen operado y límite asignado.
Respeta la decisión vigente de texto libre: se propone, no se impone.

> **Gancho comercial:** es el **habilitador** de 4.1 y 5.2 — sin clientes normalizados
> no hay analítica por cliente posible. Conviene venderlo como paso previo.

### 5.2. Reportes de trazabilidad por cliente — **8 a 12 h**
Acumulados por cliente y período, detección de operaciones fraccionadas y umbrales
configurables, con reporte exportable.

> **Gancho comercial:** según el encuadre regulatorio del negocio, puede ser un
> requisito o una buena práctica. En cualquier caso, tener el dato ordenado ante un
> pedido de información es muy superior a reconstruirlo del Excel.

### 5.3. Cerrar y reabrir cuentas corrientes — **6 a 8 h**
Hoy **no hay forma de dar de baja una cuenta corriente desde la app**: la tabla tiene un
campo `activo` que todas las pantallas respetan, pero el único lugar del código que lo
escribe lo pone en `true`. Una cuenta creada por error, un cliente que se fue o la
perdedora de una unificación se quedan para siempre en todos los desplegables.

**Se puede cerrar aunque no esté saldada.** Cerrar acá es sacarla de los desplegables, no
borrarla ni esconder la plata: Posición y Saldos Pendientes leen la vista de saldos **sin
mirar `activo`**, así que una cuenta cerrada con deuda sigue figurando en "nos deben".
Exigir saldo cero sería contraproducente — las que nunca se van a saldar (incobrables,
clientes que se fueron) son justamente las que más conviene retirar de circulación.

**Lo único que bloquea el cierre:** que haya un usuario con rol cliente atado a la cuenta
(`profiles.cuenta_cte`). Si no, esa persona entra y se queda mirando una cuenta que nadie
puede operar. Ahí el mensaje es "desvinculá primero a Fulano", no una advertencia salteable.

**Lo que advierte sin bloquear:**
- Saldo distinto de cero, mostrando los importes por moneda y las dos consecuencias:
  sigue apareciendo en Saldos Pendientes, y para registrar el cobro hay que reabrirla.
- Movimientos en los últimos 60 días, que es la mejor señal de un error de dedo.

**Requisitos del cierre:** motivo obligatorio cuando hay saldo ("unificada con X",
"incobrable"), registrado en auditoría con quién y cuándo; y una vista de cerradas con
botón para reabrir, porque sin eso cerrar es un pozo.

**Dos arreglos que entran en el mismo trabajo:**
- La pantalla de Cuenta Corriente arma su selector con `activo = true`, así que una cuenta
  cerrada **queda sin forma de consultar su extracto**. Hace falta un "incluir cerradas".
- El alta dice *"la cuenta no existe, ¿crearla?"* cuando el nombre corresponde a una cuenta
  cerrada, y al confirmar **la reactiva**. El candado ya es blando; lo que está mal es el
  mensaje, que debería decir *"la cuenta X está cerrada, ¿reabrirla?"*.

> **Regla que no se toca:** el cierre NO saca el saldo de Posición ni de Saldos Pendientes.
> Si lo hiciera, cerrar una cuenta sería la forma de hacer desaparecer un incobrable sin
> dejar rastro. Hoy funciona así y parece un descuido: es correcto, queda anotado para que
> nadie lo "arregle".

> **Gancho comercial:** es el cierre natural de 5.1 — se unifica, y después hay que poder
> retirar la cuenta que sobró. Vendido solo es flojo; junto con la deduplicación se explica
> en una frase.

---

## 6. Productividad diaria (quick wins)

### 6.1. Exportación a Excel/PDF en todas las vistas — **4 a 6 h**
Botón "Exportar" en Transacciones, Cuentas Corrientes, Calle, Deudores y Ganancias,
respetando los filtros aplicados.

> **Gancho comercial:** **el primero que hay que vender.** El cliente viene de Excel y
> es lo que más va a extrañar. Bajo esfuerzo, valor percibido altísimo, y desactiva la
> objeción "con la planilla podía hacer cualquier cosa con los datos".

### 6.2. Búsqueda global — **3 a 4 h**
Buscar cliente, monto, nota o número de operación desde cualquier pantalla.

### 6.3. Plantillas de operaciones frecuentes — **3 a 5 h**
Cargar de un clic las operaciones repetitivas de cada día.

### 6.4. App móvil instalable (PWA) — **5 a 8 h**
Instalable en el celular con ícono propio, para consultar saldos y cargar fuera del
mostrador.

> **Gancho comercial:** percepción de "app de verdad" por muy poco desarrollo, ya que
> la base web actual es aprovechable.

### 6.5. Lectura automática del cheque (OCR) — **10 a 14 h**
La cartera de cheques (`docs/CHEQUES.md`) quedó construida el 23/11/2026 **salvo esto**,
y no por falta de tiempo: tiene adentro una decisión que es del cliente.

La foto de un cheque muestra **CUIT, número de cuenta y la firma del librador**, que no
es el cliente de la casa de cambio sino un tercero que nunca aceptó nada. Mandar esa
imagen a un proveedor externo para que la lea se decide, no se implementa. Es la misma
razón por la que el bucket es privado y la imagen se sirve con un enlace firmado: cuidado
eso, no tendría sentido que lo primero que haga la app con la imagen sea mandarla afuera
sin que nadie lo resuelva.

Las tres opciones y lo que cada una cuesta de verdad están en `docs/CHEQUES.md`. En
resumen: **Claude (visión)** es el único que lee bien una foto de teléfono con partes
manuscritas; **Google Vision / Textract** es muy bueno con texto impreso y flojo con
manuscritos, que es justo donde van el importe y la fecha; **en el navegador** no sale
nada del dispositivo pero, sobre una foto real, acierta poco.

> **Al evaluarlo, el ahorro es menor de lo que parece.** En el alta ya se heredan
> librador, CUIT y banco de la fila anterior, así que de los siete campos de un cheque
> tres vienen puestos. El OCR ahorraría el número y el importe: no se compara contra
> cargar todo a mano, sino contra cargar dos campos.

> **La regla no cambia según el motor:** el OCR precarga, la persona confirma. Un importe
> mal leído no se descubre hasta el día del rechazo, cuando ya se pagó por el cheque. Y
> un formulario mayormente lleno y equivocado es peor que uno vacío, porque la gente
> acepta lo que ya está puesto. De las 10 a 14 h, unas 5 o 6 son esa pantalla de
> confirmación, que hay que hacer con cualquiera de los tres motores.

### 6.6. Rechazo de cheque: resolver la plata desde la ficha — **4 a 6 h**
El rechazo es el único evento de un cheque que cuesta dinero: la casa ya pagó por un
documento que no se cobró. Hoy el botón cambia el estado y deja el evento, pero **ahí se
corta**: la decisión de qué pasa con la plata hay que cargarla aparte en Nueva operación,
y el enlace entre el rechazo y ese movimiento queda sin hacer.

El trabajo es que el rechazo ofrezca las tres salidas y arme el movimiento:

| | |
|---|---|
| Se le debita al cliente en su cuenta corriente | lo normal cuando el cliente tiene cuenta |
| El cliente lo repone en efectivo | movimiento de caja |
| Se asume la pérdida | queda en el resultado |

`cheques_eventos.movimiento_id` ya existe para guardar el enlace: no hay nada que migrar.

> **Las reglas del dominio que tiene que respetar.** Las patas `cc_*` las calcula SIEMPRE
> el motor, nunca a mano — hacerlo a mano ya produjo un signo invertido (1/9/2026). Y si
> la salida elegida es la cuenta corriente, el movimiento tiene que escribirse en
> `movimientos_caja` **y** en `diario`: son dos tablas que van a la par, y escribir una
> sola deja el saldo del cliente mal sin ninguna señal en pantalla.

> **Por qué no se hizo junto con el resto.** Sin esto la cartera igual sirve: el rechazo
> queda registrado con su fecha y el cheque sale del circuito. Lo que falta es la
> comodidad de no cargar la contrapartida a mano, y el riesgo de que alguien se olvide de
> cargarla. Vale la pena cuando haya un cliente descontando cheques de verdad.

---

## Secuencia de venta recomendada

| Orden | Módulos | Esfuerzo | Por qué en este orden |
|---|---|---|---|
| **0º** | 4.0 Arreglar el cálculo de Ganancias | 24 a 34 h | No se vende, se corrige. El número que la pantalla muestra hoy no es el del negocio: le falta el 78 % de los euros y el 98 % de las compras de reales (ver 4.0.c). Vender analítica sobre un cálculo incompleto es construir arriba del error. |
| **1º** | 6.1 Exportación + 2.1 Comprobante | 9 a 13 h | Impacto visible inmediato y bajo costo; genera confianza para seguir comprando. |
| **2º** | 1.1 Auditoría + 1.2 Cierre de caja | 14 a 18 h | El salto real de control; es lo que justifica haber dejado el Excel. |
| **3º** | 3.1 + 3.2 Logística de efectivo | 16 a 20 h | Protege plata en la calle; ROI argumentable con un solo incidente evitado. |
| **4º** | 5.1 Ficha unificada + 5.3 Cerrar cuentas → 4.1 Rentabilidad | 20 a 28 h | Ordenar clientes primero —unificar y poder retirar la que sobró—, después explotar la analítica. |
| **5º** | 2.3 Portal del cliente + 2.4 Pizarra | 16 a 22 h | Diferencial competitivo, una vez que el interno está sólido. |

**Paquete "arranque" sugerido:** 6.1 + 2.1 + 1.1 + 1.4 ≈ **18 a 25 h** — cubre
exportación, comprobante, auditoría y backup automático. Es la oferta más fácil de
cerrar porque cada ítem se explica en una frase.
